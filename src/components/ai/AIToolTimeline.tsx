import { cn } from "@/lib/utils";
import { AnimatePresence, m } from "motion/react";
import { Suspense, lazy, useState } from "react";
import { ChevronDown } from "../Icons";
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

function formatPhaseLabel(phase: ToolPhase): string {
	if (phase === "call") return "Started";
	if (phase === "result") return "Done";
	return "Failed";
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
	});
}

function stringifyDetail(value: unknown): string {
	if (value == null) return "";
	if (typeof value === "string") return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function detailTextForEvent(event: ToolTimelineToolEvent): string {
	const lines: string[] = [];
	if (event.callId?.trim()) {
		lines.push(`call_id: ${event.callId}`);
	}
	if (event.payload !== undefined) {
		const payloadText = stringifyDetail(event.payload);
		if (payloadText.trim()) {
			lines.push("payload:");
			lines.push(payloadText);
		}
	}
	if (event.error?.trim()) {
		lines.push("error:");
		lines.push(event.error.trim());
	}
	const detail = lines.join("\n").trim();
	if (detail.length <= 4000) return detail;
	return `${detail.slice(0, 4000)}\n…(truncated)`;
}

export function AIToolTimeline({ events, streaming }: AIToolTimelineProps) {
	const [expanded, setExpanded] = useState<Record<string, boolean>>({});
	if (events.length === 0) return null;
	const orderedEvents = [...events].sort((a, b) => a.at - b.at);

	return (
		<m.div className="aiToolTimelineInline" aria-live="polite">
			<AnimatePresence initial={false}>
				{orderedEvents.map((event) => {
					if (event.kind === "text") {
						return (
							<m.div
								key={event.id}
								layout
								initial={{ opacity: 0, y: 8, scale: 0.99 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0, y: -6 }}
								transition={{ type: "spring", stiffness: 340, damping: 27 }}
								className="aiToolInlineText"
							>
								<Suspense
									fallback={
										<div className="aiToolInlineTextContent">{event.text}</div>
									}
								>
									<AIMessageMarkdown markdown={event.text} />
								</Suspense>
								<div className="aiToolTime">{formatTime(event.at)}</div>
							</m.div>
						);
					}
					const summary = summarizePayload(event.payload);
					const error =
						event.phase === "error" && typeof event.error === "string"
							? event.error
							: null;
					const detail = detailTextForEvent(event);
					const isExpanded = expanded[event.id] === true;
					return (
						<m.div
							key={event.id}
							layout
							initial={{ opacity: 0, y: 8, scale: 0.99 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: -6 }}
							transition={{ type: "spring", stiffness: 340, damping: 27 }}
							className={cn(
								"aiToolInlineItem",
								event.phase === "error" && "aiToolTimelineItem-error",
								event.phase === "call" && "aiToolTimelineItem-running",
							)}
						>
							<button
								type="button"
								className="aiToolTimelineTop aiToolExpandBtn"
								onClick={() =>
									setExpanded((prev) => ({
										...prev,
										[event.id]: !prev[event.id],
									}))
								}
								aria-expanded={isExpanded}
							>
								<span
									className={cn("aiToolPhase", `aiToolPhase-${event.phase}`)}
								>
									{formatPhaseLabel(event.phase)}
								</span>
								<span className="aiToolName">{formatToolName(event.tool)}</span>
								<span className="aiToolTime">{formatTime(event.at)}</span>
								<span
									className={cn(
										"aiToolChevron",
										isExpanded && "aiToolChevron-open",
									)}
									aria-hidden
								>
									<ChevronDown size={12} />
								</span>
							</button>
							{summary ? <div className="aiToolSummary">{summary}</div> : null}
							{error ? <div className="aiToolError">{error}</div> : null}
							{isExpanded && detail ? (
								<pre className="aiToolDetails">{detail}</pre>
							) : null}
						</m.div>
					);
				})}
			</AnimatePresence>
			{streaming ? (
				<div className="aiToolInlineLive" aria-label="Tool call in progress">
					<span className="aiToolLiveDot" />
					Working with tools...
				</div>
			) : null}
		</m.div>
	);
}
