import { AnimatePresence, m } from "motion/react";
import { Suspense, lazy } from "react";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "../ai-elements/reasoning";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "../ai-elements/tool";
import { formatToolName } from "./aiPanelConstants";

const AIMessageMarkdown = lazy(async () => {
	const module = await import("./AIMessageMarkdown");
	return { default: module.AIMessageMarkdown };
});

type ToolPhase = "call" | "result" | "error";

export interface ToolTimelineToolEvent {
	id: string;
	kind?: "tool";
	tool: string;
	phase: ToolPhase;
	at: number;
	callId?: string;
	payload?: unknown;
	error?: string;
}

export interface ToolTimelineTextEvent {
	id: string;
	kind: "text";
	text: string;
	at: number;
}

export type ToolTimelineEvent = ToolTimelineToolEvent | ToolTimelineTextEvent;

interface AIToolTimelineProps {
	events: ToolTimelineEvent[];
	streaming: boolean;
}

const DURATION_FORMATTER = new Intl.NumberFormat(undefined, {
	minimumFractionDigits: 1,
	maximumFractionDigits: 1,
});

function summarizePayload(payload: unknown): string {
	if (!payload || typeof payload !== "object") return "";
	const value = payload as Record<string, unknown>;
	const query = typeof value.query === "string" ? value.query : "";
	const path = typeof value.path === "string" ? value.path : "";
	const dir = typeof value.dir === "string" ? value.dir : "";
	const results = Array.isArray(value.results) ? value.results.length : null;
	const files = Array.isArray(value.files) ? value.files.length : null;
	const relPath =
		typeof value.rel_path === "string" ? (value.rel_path as string) : "";
	const truncated = value.truncated === true;
	if (query) return `Query "${query}"`;
	if (path) return `Path "${path}"`;
	if (dir) return `Dir "${dir}"`;
	if (results != null)
		return `Found ${results} result${results === 1 ? "" : "s"}`;
	if (files != null) return `Listed ${files} item${files === 1 ? "" : "s"}`;
	if (relPath) return `${truncated ? "Read (truncated)" : "Read"} "${relPath}"`;
	return "";
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
	});
}

type GroupedStep = {
	id: string;
	kind: "tool-group";
	tool: string;
	callEvent: ToolTimelineToolEvent;
	resultEvent?: ToolTimelineToolEvent;
	status: "running" | "done" | "error";
	duration?: number;
};

type TimelineItem = GroupedStep | ToolTimelineTextEvent | ToolTimelineToolEvent;

function buildGroupedTimeline(
	orderedEvents: ToolTimelineEvent[],
): TimelineItem[] {
	const groupMap = new Map<string, GroupedStep>();
	const output: TimelineItem[] = [];

	for (const event of orderedEvents) {
		if (event.kind === "text") {
			output.push(event);
			continue;
		}

		const toolEvent = event as ToolTimelineToolEvent;
		if (!toolEvent.callId) {
			output.push(toolEvent);
			continue;
		}

		if (toolEvent.phase === "call") {
			const group: GroupedStep = {
				id: toolEvent.callId,
				kind: "tool-group",
				tool: toolEvent.tool,
				callEvent: toolEvent,
				status: "running",
			};
			groupMap.set(toolEvent.callId, group);
			output.push(group);
		} else {
			const existing = groupMap.get(toolEvent.callId);
			if (existing) {
				existing.resultEvent = toolEvent;
				existing.status = toolEvent.phase === "error" ? "error" : "done";
				existing.duration = toolEvent.at - existing.callEvent.at;
			} else {
				output.push(toolEvent);
			}
		}
	}

	return output;
}

function formatDuration(ms: number): string {
	const seconds = ms / 1000;
	if (seconds < 0.1) return "<0.1s";
	return `${DURATION_FORMATTER.format(seconds)}s`;
}

function summarizeReasoningText(text: string): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (!normalized) return "Thought process";
	if (normalized.length <= 88) return normalized;
	return `${normalized.slice(0, 88).trimEnd()}…`;
}

function GroupedStepCard({
	step,
	defaultOpen,
}: {
	step: GroupedStep;
	defaultOpen: boolean;
}) {
	const summaryEvent = step.resultEvent ?? step.callEvent;
	const summary = summarizePayload(summaryEvent.payload);
	const errorText =
		step.resultEvent?.phase === "error" ? step.resultEvent.error : undefined;
	const state = step.status === "error" ? "error" : step.status === "done" ? "done" : "running";
	const meta =
		step.duration != null
			? formatDuration(step.duration)
			: formatTime(step.callEvent.at);

	return (
		<m.div
			key={step.id}
			layout
			initial={{ opacity: 0, y: 8, scale: 0.99 }}
			animate={{ opacity: 1, y: 0, scale: 1 }}
			exit={{ opacity: 0, y: -6 }}
			transition={{ type: "spring", stiffness: 340, damping: 27 }}
			className="w-full"
		>
			<Tool defaultOpen={defaultOpen}>
				<ToolHeader
					title={formatToolName(step.tool)}
					state={state}
					meta={meta}
				/>
				<ToolContent>
					{summary ? (
						<p className="text-sm leading-6 text-muted-foreground">{summary}</p>
					) : null}
					<ToolInput input={step.callEvent.payload} />
					{step.resultEvent ? (
						<ToolOutput
							output={step.resultEvent.payload}
							errorText={errorText}
						/>
					) : null}
				</ToolContent>
			</Tool>
		</m.div>
	);
}

export function AIToolTimeline({ events, streaming }: AIToolTimelineProps) {
	if (events.length === 0) return null;
	const orderedEvents = [...events].sort((a, b) => a.at - b.at);
	const timelineItems = buildGroupedTimeline(orderedEvents);
	const lastTextItem = [...timelineItems]
		.reverse()
		.find((item): item is ToolTimelineTextEvent => item.kind === "text");

	return (
		<m.div className="flex flex-col gap-3" aria-live="polite">
			<AnimatePresence initial={false}>
				{timelineItems.map((item) => {
					if (item.kind === "text") {
						const isStreamingThought =
							streaming && lastTextItem?.id === item.id;
						return (
							<m.div
								key={item.id}
								layout
								initial={{ opacity: 0, y: 8, scale: 0.99 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0, y: -6 }}
								transition={{ type: "spring", stiffness: 340, damping: 27 }}
								className="w-full"
							>
								<Reasoning
									defaultOpen={isStreamingThought}
									isStreaming={isStreamingThought}
								>
									<ReasoningTrigger
										label={
											isStreamingThought
												? "Thinking..."
												: summarizeReasoningText(item.text)
										}
										meta={formatTime(item.at)}
									/>
									<ReasoningContent>
										<Suspense
											fallback={
												<div className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
													{item.text}
												</div>
											}
										>
											<AIMessageMarkdown markdown={item.text} />
										</Suspense>
									</ReasoningContent>
								</Reasoning>
							</m.div>
						);
					}

					if (item.kind === "tool-group") {
						return (
							<GroupedStepCard
								key={item.id}
								step={item}
								defaultOpen={item.status !== "done"}
							/>
						);
					}

					const event = item;
					const summary = summarizePayload(event.payload);
					const state =
						event.phase === "error"
							? "error"
							: event.phase === "result"
								? "done"
								: "running";
					return (
						<m.div
							key={event.id}
							layout
							initial={{ opacity: 0, y: 8, scale: 0.99 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: -6 }}
							transition={{ type: "spring", stiffness: 340, damping: 27 }}
							className="w-full"
						>
							<Tool defaultOpen={event.phase !== "result"}>
								<ToolHeader
									title={formatToolName(event.tool)}
									state={state}
									meta={formatTime(event.at)}
								/>
								<ToolContent>
									{summary ? (
										<p className="text-sm leading-6 text-muted-foreground">
											{summary}
										</p>
									) : null}
									<ToolInput input={event.payload} />
									{event.phase !== "call" ? (
										<ToolOutput
											output={event.payload}
											errorText={event.error}
										/>
									) : null}
								</ToolContent>
							</Tool>
						</m.div>
					);
				})}
			</AnimatePresence>
			{streaming ? (
				<div
					className="inline-flex items-center gap-2 self-start rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground"
					aria-label="Tool call in progress"
				>
					<span className="size-1.5 rounded-full bg-[var(--interactive-accent)]" />
					Working with tools...
				</div>
			) : null}
		</m.div>
	);
}
