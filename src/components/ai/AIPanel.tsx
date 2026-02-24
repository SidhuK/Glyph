import { cn } from "@/lib/utils";
import {
	AiBrain04Icon,
	ChatAdd01Icon,
	Logout01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAISidebarContext } from "../../contexts";
import { openSettingsWindow } from "../../lib/windows";
import { Settings as SettingsIcon, X } from "../Icons";
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

interface AIPanelProps {
	isOpen: boolean;
	activeFolderPath: string | null;
	onAttachContextFiles: (paths: string[]) => Promise<void>;
	onClose: () => void;
	width?: number;
}

export function AIPanel({
	isOpen,
	activeFolderPath,
	onAttachContextFiles,
	onClose,
}: AIPanelProps) {
	const chat = useRigChat();
	const { aiAssistantMode } = useAISidebarContext();
	const isChatMode = aiAssistantMode === "chat";

	const [input, setInput] = useState("");
	const [addPanelOpen, setAddPanelOpen] = useState(false);
	const [addPanelQuery, setAddPanelQuery] = useState("");
	const [historyExpanded, setHistoryExpanded] = useState(false);

	const profiles = useAiProfiles();
	const context = useAiContext({ activeFolderPath });
	const history = useAiHistory(14);
	const toolEvents = useAiToolEvents({ isChatMode, chatStatus: chat.status });
	const actions = useAiActions(chat);

	const trigger = parseAddTrigger(input);
	const showAddPanel = addPanelOpen || Boolean(trigger);
	const panelQuery = addPanelOpen ? addPanelQuery : (trigger?.query ?? "");

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
		context.setContextSearch(panelQuery);
	}, [panelQuery, context.setContextSearch]);

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
	const lastUserMessageIndex = useMemo(() => {
		for (let i = chat.messages.length - 1; i >= 0; i--) {
			if (chat.messages[i]?.role === "user") return i;
		}
		return -1;
	}, [chat.messages]);

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
			const loaded = await history.loadChatMessages(jobId);
			if (!loaded) return;
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
		[chat, history.loadChatMessages, toolEvents.setToolTimeline],
	);

	const handleNewChat = useCallback(() => {
		if (chat.status === "streaming") chat.stop();
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
	const msgCount = chat.messages.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
	useEffect(() => {
		const el = threadRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [msgCount]);
	useEffect(() => {
		if (!toolEvents.isAwaitingResponse || !chat.messages.length) return;
		const el = threadRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [chat.messages, toolEvents.isAwaitingResponse]);

	useEffect(() => {
		if (chat.status !== "streaming") void history.refresh();
	}, [chat.status, history.refresh]);

	return (
		<div
			className="aiPanel"
			data-open={isOpen}
			data-ai-mode={aiAssistantMode}
			data-window-drag-ignore
		>
			<div className="aiPanelHeader">
				<div className="aiPanelTitle">
					<HugeiconsIcon icon={AiBrain04Icon} size={18} />
					<span>Glyph AI</span>
				</div>
				<div className="aiPanelHeaderRight">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="New chat"
						onClick={handleNewChat}
						title="New chat"
						disabled={chat.status === "streaming"}
						onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
					>
						<HugeiconsIcon icon={ChatAdd01Icon} size={13} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Settings"
						onClick={() => void openSettingsWindow("ai")}
						title="Settings"
						onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
					>
						<SettingsIcon size={13} />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label="Minimize"
						onClick={onClose}
						title="Minimize"
						onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
					>
						<HugeiconsIcon icon={Logout01Icon} size={13} />
					</Button>
				</div>
			</div>
			<div className="aiPanelBody">
				<AIHistoryPanel
					history={history}
					historyExpanded={historyExpanded}
					setHistoryExpanded={setHistoryExpanded}
					onLoadHistory={(jobId) => void handleLoadHistory(jobId)}
				/>
				<div className="aiChatThread" ref={threadRef}>
					<AIChatThread
						messages={chat.messages}
						isChatMode={isChatMode}
						isAwaitingResponse={toolEvents.isAwaitingResponse}
						chatStatus={chat.status}
						phaseStatusText={toolEvents.phaseStatusText}
						toolTimeline={toolEvents.toolTimeline}
						lastUserMessageIndex={lastUserMessageIndex}
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
				{chat.error ? (
					<div className="aiPanelError">
						<span>{chat.error.message}</span>
						<button type="button" onClick={() => chat.clearError()}>
							<X size={11} />
						</button>
					</div>
				) : null}
				{actions.assistantActionError ? (
					<div className="aiPanelError">
						<span>{actions.assistantActionError}</span>
						<button
							type="button"
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
					onAttachContextFiles={onAttachContextFiles}
				/>
			</div>
		</div>
	);
}
