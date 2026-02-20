import { cn } from "@/lib/utils";
import { m, useReducedMotion } from "motion/react";
import { Fragment, Suspense, lazy, useState } from "react";
import { dispatchMarkdownLinkClick } from "../editor/markdown/editorEvents";
import { ChevronDown, Files, RefreshCw, Save } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { AIToolTimeline, type ToolTimelineEvent } from "./AIToolTimeline";
import { messageText } from "./aiPanelConstants";
import type { UIMessage } from "./hooks/useRigChat";

const AIMessageMarkdown = lazy(async () => {
	const module = await import("./AIMessageMarkdown");
	return { default: module.AIMessageMarkdown };
});

interface AIChatThreadProps {
	messages: UIMessage[];
	isChatMode: boolean;
	isAwaitingResponse: boolean;
	chatStatus: string;
	phaseStatusText: string;
	toolTimeline: ToolTimelineEvent[];
	lastUserMessageIndex: number;
	onCopy: (text: string) => void;
	onSave: (text: string) => void;
	onRetry: (index: number) => void;
}

type CitationItem = {
	path: string;
	snippet?: string;
};

function isMarkdownPath(path: string): boolean {
	const lower = path.toLowerCase();
	return lower.endsWith(".md") || lower.endsWith(".markdown");
}

function parseJsonLoose(value: unknown): unknown {
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	if (!trimmed) return value;
	try {
		const parsed = JSON.parse(trimmed);
		if (typeof parsed === "string") {
			const inner = parsed.trim();
			if (inner.startsWith("{") || inner.startsWith("[")) {
				try {
					return JSON.parse(inner);
				} catch {
					return parsed;
				}
			}
		}
		return parsed;
	} catch {
		return value;
	}
}

function collectFromEntries(entries: unknown[]): CitationItem[] {
	const out: CitationItem[] = [];
	for (const entry of entries) {
		if (!entry || typeof entry !== "object") continue;
		const rec = entry as Record<string, unknown>;
		const relPath =
			typeof rec.rel_path === "string"
				? rec.rel_path
				: typeof rec.path === "string"
					? rec.path
					: "";
		if (!relPath || !isMarkdownPath(relPath)) continue;
		out.push({
			path: relPath,
			snippet: typeof rec.snippet === "string" ? rec.snippet : undefined,
		});
	}
	return out;
}

function extractCitations(events: ToolTimelineEvent[]): CitationItem[] {
	const byPath = new Map<string, CitationItem>();
	for (const event of events) {
		if (event.phase !== "result") continue;
		let payload = parseJsonLoose(event.payload);
		if (payload && typeof payload === "object") {
			const root = payload as Record<string, unknown>;
			if ("content" in root) payload = parseJsonLoose(root.content);
		}
		if (!payload || typeof payload !== "object") continue;
		const root = payload as Record<string, unknown>;
		const data =
			root.payload && typeof root.payload === "object"
				? (root.payload as Record<string, unknown>)
				: root;
		const collected: CitationItem[] = [];
		if (Array.isArray(data.results)) {
			collected.push(...collectFromEntries(data.results));
		}
		if (Array.isArray(data.files)) {
			collected.push(...collectFromEntries(data.files));
		}
		const singlePath =
			typeof data.rel_path === "string"
				? data.rel_path
				: typeof data.path === "string"
					? data.path
					: "";
		if (singlePath && isMarkdownPath(singlePath)) {
			collected.push({ path: singlePath });
		}
		for (const item of collected) {
			if (!byPath.has(item.path)) byPath.set(item.path, item);
		}
	}
	return Array.from(byPath.values()).slice(0, 8);
}

export function AIChatThread({
	messages,
	isChatMode,
	isAwaitingResponse,
	chatStatus,
	phaseStatusText,
	toolTimeline,
	lastUserMessageIndex,
	onCopy,
	onSave,
	onRetry,
}: AIChatThreadProps) {
	const shouldReduceMotion = useReducedMotion();
	const citations = extractCitations(toolTimeline);
	const [citationsOpen, setCitationsOpen] = useState(false);

	return (
		<>
			{messages.length === 0 ? (
				<div className="aiChatEmpty">
					<div className="aiChatEmptyTitle">Ask anything about your notes</div>
					<div className="aiChatEmptyMeta">
						Use @ to mention files or folders
					</div>
				</div>
			) : null}
			{messages.map((msg, index) => {
				const text = messageText(msg).trim();
				const isPendingAssistant =
					msg.role === "assistant" &&
					!text &&
					isAwaitingResponse &&
					index === messages.length - 1;
				if (!text && !isPendingAssistant) return null;
				return (
					<Fragment key={msg.id}>
						<div
							className={cn(
								"aiChatMsg",
								msg.role === "user" ? "aiChatMsg-user" : "aiChatMsg-assistant",
							)}
						>
							{isPendingAssistant ? (
								<m.div
									className="aiPendingAssistant"
									initial={
										shouldReduceMotion
											? false
											: { opacity: 0, y: 4, scale: 0.99 }
									}
									animate={{ opacity: 1, y: 0, scale: 1 }}
									transition={
										shouldReduceMotion
											? { duration: 0 }
											: { duration: 0.18, ease: "easeOut" }
									}
								>
									<div className="aiPendingHeader">
										<span className="aiPendingDot" />
										<span>{phaseStatusText || "Preparing response…"}</span>
									</div>
									<div className="aiPendingSkeleton">
										<span className="aiPendingLine aiPendingLine-1" />
										<span className="aiPendingLine aiPendingLine-2" />
									</div>
									<div className="aiPendingDots" aria-hidden="true">
										<span />
										<span />
										<span />
									</div>
								</m.div>
							) : msg.role === "assistant" ? (
								<Suspense
									fallback={<div className="aiChatContent">{text}</div>}
								>
									<AIMessageMarkdown markdown={text} />
								</Suspense>
							) : (
								<div className="aiChatContent">{text}</div>
							)}
							{msg.role === "assistant" && text ? (
								<div className="aiAssistantActions">
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className="aiAssistantActionBtn aiAssistantActionIconBtn"
										onClick={() => onCopy(text)}
										title="Copy response"
										aria-label="Copy response"
									>
										<Files size={12} />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className="aiAssistantActionBtn aiAssistantActionIconBtn"
										onClick={() => onSave(text)}
										title="Save response to file"
										aria-label="Save response to file"
									>
										<Save size={12} />
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className="aiAssistantActionBtn aiAssistantActionIconBtn"
										onClick={() => onRetry(index)}
										title="Retry this response"
										aria-label="Retry response"
										disabled={chatStatus === "streaming"}
									>
										<RefreshCw size={12} />
									</Button>
								</div>
							) : null}
							{msg.role === "assistant" &&
							text &&
							!isChatMode &&
							index === messages.length - 1 &&
							citations.length > 0 ? (
								<div className="aiFootnoteRefs" aria-label="Footnote citations">
									{citations.map((item, citationIndex) => (
										<button
											key={item.path}
											type="button"
											className="aiFootnoteRef"
											title={item.snippet || item.path}
											onClick={() =>
												dispatchMarkdownLinkClick({
													href: item.path,
													sourcePath: "",
												})
											}
										>
											[{citationIndex + 1}]
										</button>
									))}
								</div>
							) : null}
							{msg.role === "assistant" &&
							text &&
							!isChatMode &&
							index === messages.length - 1 &&
							citations.length > 0 ? (
								<div className="aiCitations" aria-label="Citations">
									<button
										type="button"
										className="aiCitationsToggle"
										onClick={() => setCitationsOpen((prev) => !prev)}
										aria-expanded={citationsOpen}
									>
										<span>Cited Notes</span>
										<span
											className={cn(
												"aiCitationsChevron",
												citationsOpen && "open",
											)}
											aria-hidden
										>
											<ChevronDown size={12} />
										</span>
									</button>
									{citationsOpen ? (
										<div className="aiCitationsList">
											{citations.map((item, citationIndex) => (
												<button
													key={item.path}
													type="button"
													className="aiCitationLink"
													title={item.snippet || item.path}
													onClick={() =>
														dispatchMarkdownLinkClick({
															href: item.path,
															sourcePath: "",
														})
													}
												>
													[{citationIndex + 1}] {item.path}
												</button>
											))}
										</div>
									) : null}
								</div>
							) : null}
						</div>
						{!isChatMode && index === lastUserMessageIndex ? (
							<AIToolTimeline
								events={toolTimeline}
								streaming={
									chatStatus === "streaming" || chatStatus === "submitted"
								}
							/>
						) : null}
					</Fragment>
				);
			})}
		</>
	);
}
