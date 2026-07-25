import { cn } from "@/lib/utils";
import { m, useReducedMotion } from "motion/react";
import { Fragment, memo, useMemo, useState } from "react";
import { type OrbState, ThinkingOrb } from "thinking-orbs";
import { isMarkdownPath } from "../../utils/path";
import { ChevronDown, Files, RefreshCw, Save } from "../Icons";
import { dispatchMarkdownLinkClick } from "../editor/markdown/editorEvents";
import { Button } from "../ui/shadcn/button";
import {
	AIActivityTimeline,
	type AIActivityTimelineEvent,
} from "./AIActivityTimeline";
import { AIMessageMarkdown } from "./AIMessageMarkdown";
import { messageText } from "./aiPanelConstants";
import type { RigChatStatus, UIMessage } from "./hooks/useRigChat";

interface AIChatThreadProps {
	messages: UIMessage[];
	isChatMode: boolean;
	isAwaitingResponse: boolean;
	chatStatus: RigChatStatus;
	phaseStatusText: string;
	activityState: OrbState;
	showIdleActivity: boolean;
	activityTimeline: AIActivityTimelineEvent[];
	onCopy: (text: string) => void;
	onSave: (text: string) => void;
	onRetry: (index: number) => void;
}

type CitationItem = {
	path: string;
	snippet?: string;
};

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

function extractCitations(events: AIActivityTimelineEvent[]): CitationItem[] {
	const byPath = new Map<string, CitationItem>();
	for (const event of events) {
		if (event.kind !== "citation") continue;
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

interface AIChatMessageBodyProps {
	msg: UIMessage;
	index: number;
	text: string;
	isChatMode: boolean;
	isPendingAssistant: boolean;
	isFailedAssistant: boolean;
	isStreamingAssistant: boolean;
	isLastAssistantWithTimeline: boolean;
	phaseStatusText: string;
	activityState: OrbState;
	shouldReduceMotion: boolean;
	chatStatus: RigChatStatus;
	onCopy: (text: string) => void;
	onSave: (text: string) => void;
	onRetry: (index: number) => void;
}

const AIChatMessageBody = memo(function AIChatMessageBody({
	msg,
	index,
	text,
	isChatMode,
	isPendingAssistant,
	isFailedAssistant,
	isStreamingAssistant,
	isLastAssistantWithTimeline,
	phaseStatusText,
	activityState,
	shouldReduceMotion,
	chatStatus,
	onCopy,
	onSave,
	onRetry,
}: AIChatMessageBodyProps) {
	return (
		<>
			{isPendingAssistant ? (
				<m.div
					className="aiPendingHeader"
					initial={
						shouldReduceMotion ? false : { opacity: 0, y: 4, scale: 0.99 }
					}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					transition={
						shouldReduceMotion
							? { duration: 0 }
							: { duration: 0.18, ease: "easeOut" }
					}
				>
					<ThinkingOrb
						state={activityState}
						size={20}
						aria-label={phaseStatusText}
					/>
					<span>{phaseStatusText}</span>
				</m.div>
			) : msg.role === "assistant" ? (
				!isChatMode &&
				isLastAssistantWithTimeline ? null : isStreamingAssistant ? (
					<div className="aiStreamingCaretWrap">
						<AIMessageMarkdown markdown={text} streaming />
						<span className="aiStreamingCaret">▍</span>
					</div>
				) : (
					<AIMessageMarkdown markdown={text} />
				)
			) : (
				<div className="aiChatContent">{text}</div>
			)}
			{isFailedAssistant ? (
				<div className="aiInlineError">
					<span className="aiInlineErrorDot" />
					<span className="aiInlineErrorText">Response failed</span>
					<button
						type="button"
						className="aiInlineRetryBtn"
						onClick={() => onRetry(index)}
					>
						<RefreshCw size="var(--icon-xs)" />
						<span>Retry</span>
					</button>
				</div>
			) : null}
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
						<Files size="var(--icon-sm)" />
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
						<Save size="var(--icon-sm)" />
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
						<RefreshCw size="var(--icon-sm)" />
					</Button>
				</div>
			) : null}
		</>
	);
});

export function AIChatThread({
	messages,
	isChatMode,
	isAwaitingResponse,
	chatStatus,
	phaseStatusText,
	activityState,
	showIdleActivity,
	activityTimeline,
	onCopy,
	onSave,
	onRetry,
}: AIChatThreadProps) {
	const shouldReduceMotion = useReducedMotion();
	const citations = useMemo(
		() => extractCitations(activityTimeline),
		[activityTimeline],
	);
	const [citationsOpen, setCitationsOpen] = useState(false);
	const hasInterleavedTextTimeline = activityTimeline.some(
		(e) => e.kind === "text",
	);
	const lastAssistantMessageIndex = (() => {
		for (let i = messages.length - 1; i >= 0; i -= 1) {
			if (messages[i]?.role === "assistant") return i;
		}
		return -1;
	})();

	return (
		<>
			{messages.length === 0 ? (
				<div className="aiChatEmpty">
					{showIdleActivity ? (
						<ThinkingOrb
							className="aiChatEmptyActivity"
							state="shaping"
							size={20}
							aria-label="Shaping your thought"
						/>
					) : null}
					<div className="aiChatEmptyTitle">Talk to your notes</div>
					<div className="aiChatEmptyMeta">
						Ask naturally, or use <code>@</code> to add notes and folders to the
						conversation
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
				const isFailedAssistant =
					msg.role === "assistant" &&
					chatStatus === "error" &&
					index === messages.length - 1;
				if (!text && !isPendingAssistant && !isFailedAssistant) return null;
				const isStreamingAssistant =
					msg.role === "assistant" &&
					chatStatus === "streaming" &&
					index === lastAssistantMessageIndex &&
					!!text;
				return (
					<Fragment key={msg.id}>
						<div
							className={cn(
								"aiChatMsg",
								msg.role === "user" ? "aiChatMsg-user" : "aiChatMsg-assistant",
							)}
						>
							<AIChatMessageBody
								msg={msg}
								index={index}
								text={text}
								isChatMode={isChatMode}
								isPendingAssistant={isPendingAssistant}
								isFailedAssistant={isFailedAssistant}
								isStreamingAssistant={isStreamingAssistant}
								isLastAssistantWithTimeline={
									index === lastAssistantMessageIndex &&
									hasInterleavedTextTimeline
								}
								phaseStatusText={phaseStatusText}
								activityState={activityState}
								shouldReduceMotion={shouldReduceMotion === true}
								chatStatus={chatStatus}
								onCopy={onCopy}
								onSave={onSave}
								onRetry={onRetry}
							/>
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
											<ChevronDown size="var(--icon-sm)" />
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
						{!isChatMode && index === lastAssistantMessageIndex ? (
							<AIActivityTimeline
								events={activityTimeline}
								streaming={
									hasInterleavedTextTimeline &&
									(chatStatus === "streaming" || chatStatus === "submitted")
								}
								activityState={activityState}
								statusText={phaseStatusText}
							/>
						) : null}
					</Fragment>
				);
			})}
			{messages.length > 0 && showIdleActivity ? (
				<m.div
					className="aiIdleAssistant"
					initial={
						shouldReduceMotion ? false : { opacity: 0, y: 4, scale: 0.98 }
					}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					transition={
						shouldReduceMotion
							? { duration: 0 }
							: { duration: 0.18, ease: "easeOut" }
					}
				>
					<ThinkingOrb
						state="shaping"
						size={20}
						aria-label="Shaping your thought"
					/>
				</m.div>
			) : null}
		</>
	);
}
