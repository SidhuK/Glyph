import { cn } from "@/lib/utils";
import { ChatAdd01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAISidebarContext, useUILayoutContext } from "../../contexts";
import { onWindowDragMouseDown } from "../../utils/window";
import { ChevronDown, Settings as SettingsIcon, X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { AIChatThread } from "./AIChatThread";
import { AIComposer } from "./AIComposer";
import { AIHistoryPanel } from "./AIHistoryPanel";
import type { ToolTimelineEvent } from "./AIToolTimeline";
import {
	AI_CONTEXT_ATTACH_EVENT,
	type AiContextAttachDetail,
} from "./aiContextEvents";
import { parseAddTrigger } from "./aiPanelConstants";
import { useAiActions } from "./hooks/useAiActions";
import { useAiToolEvents } from "./hooks/useAiToolEvents";
import { useRigChat } from "./hooks/useRigChat";
import { useAiContext } from "./useAiContext";
import { useAiHistory } from "./useAiHistory";
import { useAiProfiles } from "./useAiProfiles";

export function AIAgentPane() {
	const { aiAssistantMode } = useAISidebarContext();
	const { openSettings } = useUILayoutContext();
	const isChatMode = aiAssistantMode === "chat";

	const [input, setInput] = useState("");
	const [addPanelOpen, setAddPanelOpen] = useState(false);
	const [addPanelQuery, setAddPanelQuery] = useState("");
	const [historyExpanded, setHistoryExpanded] = useState(false);
	const [showScrollFab, setShowScrollFab] = useState(false);

	const history = useAiHistory(14, { enabled: historyExpanded });
	const chat = useRigChat({
		onComplete: () => void history.refresh(),
	});
	const trigger = parseAddTrigger(input);
	const showAddPanel = addPanelOpen || Boolean(trigger);
	const panelQuery = addPanelOpen ? addPanelQuery : (trigger?.query ?? "");
	const profiles = useAiProfiles();
	const context = useAiContext(panelQuery);
	const toolEvents = useAiToolEvents({ isChatMode, chatStatus: chat.status });
	const actions = useAiActions(chat);

	const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
	const scheduleResize = useCallback(() => {
		window.requestAnimationFrame(() => {
			const el = composerInputRef.current;
			if (!el) return;
			el.style.height = "0px";
			const next = Math.max(40, Math.min(el.scrollHeight, 180));
			el.style.height = `${next.toString()}px`;
			el.style.overflowY = el.scrollHeight > 180 ? "auto" : "hidden";
		});
	}, []);

	useEffect(() => {
		const onAttach = (event: Event) => {
			const detail = (event as CustomEvent<AiContextAttachDetail>).detail;
			const paths = detail?.paths ?? [];
			if (!paths.length) return;
			for (const path of paths) context.addContext("file", path);
			setAddPanelOpen(false);
			setAddPanelQuery("");
			window.requestAnimationFrame(() => composerInputRef.current?.focus());
		};
		window.addEventListener(AI_CONTEXT_ATTACH_EVENT, onAttach);
		return () => window.removeEventListener(AI_CONTEXT_ATTACH_EVENT, onAttach);
	}, [context.addContext]);

	const canSend =
		!toolEvents.isAwaitingResponse &&
		Boolean(input.trim()) &&
		Boolean(profiles.activeProfileId);
	const activeProvider = profiles.activeProfile?.provider;

	const sendWithCurrentContext = useCallback(
		async (text: string) => {
			const trimmed = text.trim();
			if (!trimmed || !profiles.activeProfileId) return false;
			toolEvents.clearFinalizingTimer();
			toolEvents.setShowSlowStart(false);
			toolEvents.setResponsePhase("submitted");
			toolEvents.resetToolState();
			const built = await context.ensurePayload();
			if (context.payloadError) {
				toolEvents.setResponsePhase("idle");
				return false;
			}
			void chat.sendMessage(
				{ text: trimmed },
				{
					body: {
						profile_id: profiles.activeProfileId ?? undefined,
						provider: activeProvider,
						mode: aiAssistantMode,
						context: built.payload || undefined,
						context_manifest: built.manifest ?? undefined,
						audit: true,
					},
				},
			);
			return true;
		},
		[
			activeProvider,
			aiAssistantMode,
			chat,
			context,
			profiles.activeProfileId,
			toolEvents,
		],
	);

	const handleSend = useCallback(async () => {
		if (!canSend) return;
		const text = context.resolveMentionsFromInput(input);
		if (!text) return;
		toolEvents.clearFinalizingTimer();
		toolEvents.setShowSlowStart(false);
		toolEvents.setResponsePhase("submitted");
		toolEvents.resetToolState();
		setInput("");
		scheduleResize();
		const built = await context.ensurePayload();
		if (context.payloadError) {
			toolEvents.setResponsePhase("idle");
			setInput(text);
			scheduleResize();
			return;
		}
		void chat.sendMessage(
			{ text },
			{
				body: {
					profile_id: profiles.activeProfileId ?? undefined,
					provider: activeProvider,
					mode: aiAssistantMode,
					context: built.payload || undefined,
					context_manifest: built.manifest ?? undefined,
					audit: true,
				},
			},
		);
	}, [
		aiAssistantMode,
		canSend,
		chat,
		context,
		input,
		profiles.activeProfileId,
		activeProvider,
		scheduleResize,
		toolEvents,
	]);

	const handleRetry = useMemo(
		() =>
			actions.createRetryHandler(sendWithCurrentContext, context.payloadError),
		[actions, sendWithCurrentContext, context.payloadError],
	);

	const handleAddContext = useCallback(
		(kind: "folder" | "file", path: string) => {
			context.addContext(kind, path);
			if (trigger)
				setInput((prev) => {
					const before = prev.slice(0, trigger.start).trimEnd();
					return before ? `${before} ` : "";
				});
			setAddPanelOpen(false);
			setAddPanelQuery("");
		},
		[context.addContext, trigger],
	);

	const handleRemoveContext = useCallback(
		(kind: "folder" | "file", path: string) => {
			context.removeContext(kind, path);
		},
		[context.removeContext],
	);

	const handleLoadHistory = useCallback(
		async (jobId: string) => {
			if (chat.status === "submitted" || chat.status === "streaming") {
				chat.stop();
			}
			const loaded = await history.loadChatMessages(jobId);
			if (!loaded) return;
			toolEvents.clearSlowStartTimer();
			toolEvents.clearFinalizingTimer();
			toolEvents.resetToolState();
			toolEvents.setShowSlowStart(false);
			toolEvents.setResponsePhase("idle");
			const restoredTimeline = loaded.toolEvents.map((event, index) => ({
				id: `${event.call_id?.trim() ? `${event.call_id}-${event.phase}` : `${event.tool}-${event.phase}-${index}`}-${event.at_ms ?? 0}`,
				kind: "tool" as const,
				tool: event.tool || "tool",
				phase:
					event.phase === "result" || event.phase === "error"
						? event.phase
						: "call",
				callId: event.call_id ?? undefined,
				payload: event.payload,
				error: typeof event.error === "string" ? event.error : undefined,
				at:
					typeof event.at_ms === "number" && event.at_ms > 0
						? event.at_ms
						: Date.now(),
			})) as ToolTimelineEvent[];
			toolEvents.setToolTimeline(restoredTimeline);
			chat.setThreadId(jobId);
			chat.setMessages(loaded.messages);
			chat.clearError();
		},
		[
			chat,
			history.loadChatMessages,
			toolEvents.clearFinalizingTimer,
			toolEvents.clearSlowStartTimer,
			toolEvents.resetToolState,
			toolEvents.setResponsePhase,
			toolEvents.setShowSlowStart,
			toolEvents.setToolTimeline,
		],
	);

	const handleNewChat = useCallback(() => {
		if (chat.status === "streaming" || chat.status === "submitted") {
			chat.stop();
		}
		toolEvents.clearSlowStartTimer();
		toolEvents.clearFinalizingTimer();
		toolEvents.resetToolState();
		toolEvents.setShowSlowStart(false);
		toolEvents.setResponsePhase("idle");
		setInput("");
		scheduleResize();
		actions.setAssistantActionError("");
		chat.setThreadId(null);
		chat.setMessages([]);
		chat.clearError();
	}, [actions, chat, scheduleResize, toolEvents]);

	const threadRef = useRef<HTMLDivElement>(null);
	const handleThreadScroll = useCallback(() => {
		const el = threadRef.current;
		if (!el) return;
		const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		setShowScrollFab(distanceFromBottom > 120);
	}, []);
	const msgCount = chat.messages.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
	useEffect(() => {
		const el = threadRef.current;
		if (el) {
			el.scrollTop = el.scrollHeight;
			setShowScrollFab(false);
		}
	}, [msgCount]);
	useEffect(() => {
		if (!toolEvents.isAwaitingResponse || !chat.messages.length) return;
		const el = threadRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [chat.messages, toolEvents.isAwaitingResponse]);

	const hasMessages = chat.messages.length > 0;

	const composer = (
		<AIComposer
			input={input}
			setInput={setInput}
			isAwaitingResponse={toolEvents.isAwaitingResponse}
			canSend={canSend}
			onSend={() => void handleSend()}
			onStop={() => chat.stop()}
			composerInputRef={composerInputRef}
			scheduleComposerInputResize={scheduleResize}
			profiles={profiles}
			context={context}
			showAddPanel={showAddPanel}
			panelQuery={panelQuery}
			addPanelOpen={addPanelOpen}
			setAddPanelOpen={setAddPanelOpen}
			setAddPanelQuery={setAddPanelQuery}
			onAddContext={handleAddContext}
			onRemoveContext={handleRemoveContext}
		/>
	);

	const errors = (
		<>
			{chat.error ? (
				<div className="aiPanelError">
					<span>{chat.error.message}</span>
					<button
						type="button"
						aria-label="Dismiss error"
						onClick={() => chat.clearError()}
					>
						<X size={11} />
					</button>
				</div>
			) : null}
			{actions.assistantActionError ? (
				<div className="aiPanelError">
					<span>{actions.assistantActionError}</span>
					<button
						type="button"
						aria-label="Dismiss assistant action error"
						onClick={() => actions.setAssistantActionError("")}
					>
						<X size={11} />
					</button>
				</div>
			) : null}
			{profiles.error ? (
				<div className="aiPanelError">{profiles.error}</div>
			) : null}
			{history.error ? (
				<div className="aiPanelError">{history.error}</div>
			) : null}
		</>
	);

	const historyPanel = historyExpanded ? (
		<AIHistoryPanel
			history={history}
			onLoadHistory={(jobId) => void handleLoadHistory(jobId)}
		/>
	) : null;

	return (
		<div
			className="aiAgentPane aiPanel"
			data-ai-mode={aiAssistantMode}
			data-has-messages={hasMessages}
		>
			<div
				className="aiAgentHeader drag"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			>
				<button
					type="button"
					className={cn(
						"aiPanelHistoryButton",
						historyExpanded && "aiPanelHistoryButton-active",
					)}
					aria-pressed={historyExpanded}
					onClick={() => setHistoryExpanded((prev) => !prev)}
					title="Recent chats"
				>
					Recent Chats
				</button>
				<div className="aiAgentHeaderRight">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="New chat"
						onClick={handleNewChat}
						title="New chat"
						disabled={chat.status === "streaming"}
					>
						<HugeiconsIcon icon={ChatAdd01Icon} size={14} strokeWidth={0.9} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Settings"
						onClick={() => openSettings("ai")}
						title="AI Settings"
					>
						<SettingsIcon size={14} />
					</Button>
				</div>
			</div>

			{hasMessages ? (
				<div className="aiAgentBody">
					{historyPanel}
					<div
						className="aiAgentThread"
						ref={threadRef}
						onScroll={handleThreadScroll}
					>
						<AIChatThread
							messages={chat.messages}
							isChatMode={isChatMode}
							isAwaitingResponse={toolEvents.isAwaitingResponse}
							chatStatus={chat.status}
							phaseStatusText={toolEvents.phaseStatusText}
							toolTimeline={toolEvents.toolTimeline}
							onCopy={(t) => void actions.handleCopyAssistantResponse(t)}
							onSave={(t) => void actions.handleSaveAssistantResponse(t)}
							onRetry={(i) => void handleRetry(i)}
						/>
						{!isChatMode && chat.status === "streaming" && (
							<div
								className={cn(
									"aiToolStatus",
									toolEvents.lastToolEvent?.phase === "error" &&
										"aiToolStatusError",
								)}
								aria-live="polite"
								aria-label="Tool status"
							>
								<span className="aiToolStatusDot" />
								<span>{toolEvents.toolStatusText}</span>
							</div>
						)}
					</div>
					{showScrollFab && (
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="aiScrollFab"
							onClick={() => {
								const el = threadRef.current;
								if (el)
									el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
							}}
							aria-label="Scroll to bottom"
							title="Scroll to latest"
						>
							<ChevronDown size={14} />
						</Button>
					)}
					{errors}
					{composer}
				</div>
			) : (
				<div className="aiAgentEmpty">
					{historyPanel}
					{errors}
					{composer}
				</div>
			)}
		</div>
	);
}
