import { cn } from "@/lib/utils";
import { ChatAdd01Icon, Logout05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAISidebarContext, useUILayoutContext } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import { onWindowDragMouseDown } from "../../utils/window";
import { ChevronDown, Settings as SettingsIcon, X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import type { AIActivityTimelineEvent } from "./AIActivityTimeline";
import { AIChatThread } from "./AIChatThread";
import { AIComposer } from "./AIComposer";
import { AIHistoryPanel } from "./AIHistoryPanel";
import {
	AI_CONTEXT_ATTACH_EVENT,
	type AiContextAttachDetail,
} from "./aiContextEvents";
import { messageText, parseAddTrigger } from "./aiPanelConstants";
import { useAiActions } from "./hooks/useAiActions";
import { useAiToolEvents } from "./hooks/useAiToolEvents";
import { useRigChat } from "./hooks/useRigChat";
import { preloadAiContextIndex, useAiContext } from "./useAiContext";
import { preloadAiHistorySummaries, useAiHistory } from "./useAiHistory";
import { preloadAiProfilesData, useAiProfiles } from "./useAiProfiles";

const CHIP_MARKER_RE = /\uE000[^\uE001]*\uE001|\uE000|\uE001/g;

interface AIPanelProps {
	onClose: () => void;
}

export async function prefetchAIPanelData(): Promise<void> {
	await Promise.all([
		preloadAiProfilesData(),
		preloadAiHistorySummaries(14),
		preloadAiContextIndex(),
	]);
}

function stripChipMarkers(text: string): string {
	return text.replace(CHIP_MARKER_RE, "");
}

export function AIPanel({ onClose }: AIPanelProps) {
	const { aiAssistantMode } = useAISidebarContext();
	const { activeMarkdownTabPath, openSettings } = useUILayoutContext();
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
	const profiles = useAiProfiles();
	const trigger = parseAddTrigger(input);
	const showAddPanel = addPanelOpen || Boolean(trigger);
	const panelQuery = addPanelOpen ? addPanelQuery : (trigger?.query ?? "");
	const context = useAiContext(panelQuery);
	const toolEvents = useAiToolEvents({ isChatMode, chatStatus: chat.status });
	const actions = useAiActions(chat);

	const composerInputRef = useRef<HTMLDivElement | null>(null);
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
			for (const path of paths) {
				context.addContext("file", path);
				const marker = `\uE000file${path}\uE001`;
				setInput((prev) =>
					prev.includes(marker)
						? prev
						: `${prev}${prev && !/\s$/.test(prev) ? " " : ""}${marker} `,
				);
			}
			setAddPanelOpen(false);
			setAddPanelQuery("");
			window.requestAnimationFrame(() => composerInputRef.current?.focus());
		};
		window.addEventListener(AI_CONTEXT_ATTACH_EVENT, onAttach);
		return () => window.removeEventListener(AI_CONTEXT_ATTACH_EVENT, onAttach);
	}, [context.addContext]);

	const canSend =
		!toolEvents.isAwaitingResponse &&
		Boolean(stripChipMarkers(input).trim()) &&
		Boolean(profiles.activeProfileId);
	const showIdleActivity =
		!toolEvents.isAwaitingResponse &&
		(Boolean(stripChipMarkers(input).trim()) ||
			(chat.status === "ready" &&
				chat.messages.some(
					(message) =>
						message.role === "assistant" &&
						Boolean(messageText(message).trim()),
				)));
	const activeProvider = profiles.activeProfile?.provider;
	const sendWithCurrentContext = useCallback(
		async (text: string) => {
			const trimmed = text.trim();
			const sanitized = stripChipMarkers(trimmed).trim();
			if (!sanitized || !profiles.activeProfileId) return false;
			toolEvents.setResponsePhase("submitted");
			toolEvents.resetToolState();
			let built: Awaited<ReturnType<typeof context.ensurePayload>>;
			try {
				built = await context.ensurePayload();
			} catch {
				toolEvents.setResponsePhase("idle");
				return false;
			}
			void chat.sendMessage(
				{ text: sanitized, context: built.attachments },
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
		const text = context.resolveMentionsFromInput(input);
		const sanitized = stripChipMarkers(text).trim();
		if (
			!sanitized ||
			toolEvents.isAwaitingResponse ||
			!profiles.activeProfileId
		) {
			return;
		}
		actions.setAssistantActionError("");
		toolEvents.setResponsePhase("submitted");
		toolEvents.resetToolState();
		setInput("");
		scheduleResize();
		let built: Awaited<ReturnType<typeof context.ensurePayload>>;
		try {
			built = await context.ensurePayload();
		} catch (error) {
			toolEvents.setResponsePhase("idle");
			actions.setAssistantActionError(extractErrorMessage(error));
			setInput(text);
			scheduleResize();
			return;
		}
		void chat.sendMessage(
			{ text: sanitized, context: built.attachments },
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
		actions,
		aiAssistantMode,
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
			const marker = `\uE000${kind}${path}\uE001`;
			if (trigger) {
				setInput((prev) => {
					const before = prev.slice(0, trigger.start).trimEnd();
					const after = prev.slice(trigger.end).replace(/^\s+/, "");
					const parts = prev.includes(marker)
						? [before, after]
						: [before, marker, after];
					return parts.filter(Boolean).join(" ");
				});
			} else {
				setInput((prev) =>
					prev.includes(marker)
						? prev
						: `${prev}${prev && !/\s$/.test(prev) ? " " : ""}${marker} `,
				);
			}
			setAddPanelOpen(false);
			setAddPanelQuery("");
		},
		[context.addContext, trigger],
	);

	const handleRemoveContext = useCallback(
		(kind: "folder" | "file", path: string) => {
			context.removeContext(kind, path);
			const marker = `\uE000${kind}${path}\uE001`;
			setInput((prev) => {
				const markerIndex = prev.indexOf(marker);
				if (markerIndex === -1) return prev;
				const before = prev.slice(0, markerIndex);
				const after = prev.slice(markerIndex + marker.length);
				if (!before) return after.replace(/^[ \t]+/, "");
				if (!after) return before.replace(/[ \t]+$/, "");
				return `${before.replace(/[ \t]+$/, "")} ${after.replace(/^[ \t]+/, "")}`;
			});
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
			toolEvents.resetToolState();
			toolEvents.setResponsePhase("idle");
			const restoredTimeline: AIActivityTimelineEvent[] = loaded.toolEvents
				.filter((event) => event.phase === "result")
				.map((event) => ({
					kind: "citation",
					payload: event.payload,
				}));
			toolEvents.setActivityTimeline(restoredTimeline);
			chat.setMessages(loaded.messages);
			chat.clearError();
		},
		[
			chat,
			history.loadChatMessages,
			toolEvents.resetToolState,
			toolEvents.setResponsePhase,
			toolEvents.setActivityTimeline,
		],
	);

	const handleNewChat = useCallback(() => {
		if (chat.status === "streaming" || chat.status === "submitted") {
			chat.stop();
		}
		toolEvents.resetToolState();
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

	return (
		<div
			className="aiPanel"
			data-ai-mode={aiAssistantMode}
			data-window-drag-ignore
		>
			<div
				className="aiPanelHeader drag"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			>
				<div className="aiPanelHeaderLeft">
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
				</div>
				<div className="aiPanelHeaderRight">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						data-action="new-chat"
						aria-label="New chat"
						onClick={handleNewChat}
						title="New chat"
						disabled={chat.status === "streaming"}
						onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
					>
						<HugeiconsIcon
							icon={ChatAdd01Icon}
							size="var(--icon-sm)"
							strokeWidth={0.9}
						/>
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						data-action="settings"
						aria-label="Settings"
						onClick={() => openSettings("ai")}
						title="Settings"
						onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
					>
						<SettingsIcon size="var(--icon-sm)" />
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						data-action="minimize"
						aria-label="Minimize"
						onClick={onClose}
						title="Minimize"
						onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
					>
						<HugeiconsIcon
							icon={Logout05Icon}
							size="var(--icon-sm)"
							strokeWidth={0.9}
						/>
					</Button>
				</div>
			</div>
			<div className="aiPanelBody">
				{historyExpanded ? (
					<AIHistoryPanel
						history={history}
						onLoadHistory={(jobId) => void handleLoadHistory(jobId)}
					/>
				) : null}
				<div
					className="aiChatThread"
					ref={threadRef}
					onScroll={handleThreadScroll}
				>
					<AIChatThread
						messages={chat.messages}
						isChatMode={isChatMode}
						isAwaitingResponse={toolEvents.isAwaitingResponse}
						chatStatus={chat.status}
						phaseStatusText={toolEvents.phaseStatusText}
						activityState={toolEvents.activityState}
						showIdleActivity={showIdleActivity}
						activityTimeline={toolEvents.activityTimeline}
						onCopy={(t) => void actions.handleCopyAssistantResponse(t)}
						onSave={(t) => void actions.handleSaveAssistantResponse(t)}
						onRetry={(i) => void handleRetry(i)}
					/>
				</div>
				{showScrollFab && (
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className="aiScrollFab"
						onClick={() => {
							const el = threadRef.current;
							if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
						}}
						aria-label="Scroll to bottom"
						title="Scroll to latest"
					>
						<ChevronDown size="var(--icon-md)" />
					</Button>
				)}
				{chat.error ? (
					<div className="aiPanelError">
						<span>{chat.error.message}</span>
						<button type="button" onClick={() => chat.clearError()}>
							<X size="var(--icon-xs)" />
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
							<X size="var(--icon-xs)" />
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
					isStreamingResponse={toolEvents.responsePhase === "streaming"}
					canSend={canSend}
					onSend={() => void handleSend()}
					onStop={() => chat.stop()}
					composerInputRef={composerInputRef}
					scheduleComposerInputResize={scheduleResize}
					profiles={profiles}
					context={context}
					activeFilePath={activeMarkdownTabPath}
					showAddPanel={showAddPanel}
					panelQuery={panelQuery}
					addPanelOpen={addPanelOpen}
					setAddPanelOpen={setAddPanelOpen}
					setAddPanelQuery={setAddPanelQuery}
					onAddContext={handleAddContext}
					onRemoveContext={handleRemoveContext}
				/>
			</div>
		</div>
	);
}
