import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import { Fragment, Suspense, lazy } from "react";
import { Files, RefreshCw, Save } from "../Icons";
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
			{messages.map((m, index) => {
				const text = messageText(m).trim();
				const isPendingAssistant =
					m.role === "assistant" &&
					!text &&
					isAwaitingResponse &&
					index === messages.length - 1;
				if (!text && !isPendingAssistant) return null;
				return (
					<Fragment key={m.id}>
						<div
							className={cn(
								"aiChatMsg",
								m.role === "user" ? "aiChatMsg-user" : "aiChatMsg-assistant",
							)}
						>
							{isPendingAssistant ? (
								<motion.div
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
								</motion.div>
							) : m.role === "assistant" ? (
								<Suspense
									fallback={<div className="aiChatContent">{text}</div>}
								>
									<AIMessageMarkdown markdown={text} />
								</Suspense>
							) : (
								<div className="aiChatContent">{text}</div>
							)}
							{m.role === "assistant" && text ? (
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
