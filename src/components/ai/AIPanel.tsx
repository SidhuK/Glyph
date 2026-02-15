import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUIContext } from "../../contexts";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { openSettingsWindow } from "../../lib/windows";
import { cn } from "@/lib/utils";
import { AiLattice, Minus, Plus, Settings as SettingsIcon, X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { type ToolTimelineEvent } from "./AIToolTimeline";
import { AIChatThread } from "./AIChatThread";
import { AIComposer } from "./AIComposer";
import { AIHistoryPanel } from "./AIHistoryPanel";
import {
	FINALIZING_MS,
	SLOW_START_MS,
	type ResponsePhase,
	type ToolPhase,
	type ToolStatusEvent,
	formatToolName,
	messageText,
	normalizePath,
	parseAddTrigger,
} from "./aiPanelConstants";
import {
	AI_CONTEXT_ATTACH_EVENT,
	type AiContextAttachDetail,
} from "./aiContextEvents";
import { type UIMessage, useRigChat } from "./hooks/useRigChat";
import { useAiContext } from "./useAiContext";
import { useAiHistory } from "./useAiHistory";
import { useAiProfiles } from "./useAiProfiles";

interface AIPanelProps {
	isOpen: boolean;
	activeFolderPath: string | null;
	currentFilePath: string | null;
	onAttachContextFiles: (paths: string[]) => Promise<void>;
	onCreateNoteFromLastAssistant: (markdown: string) => Promise<void>;
	onClose: () => void;
	width?: number;
}

export function AIPanel({
	isOpen,
	activeFolderPath,
	currentFilePath,
	onAttachContextFiles,
	onCreateNoteFromLastAssistant,
	onClose,
}: AIPanelProps) {
	const chat = useRigChat();
	const { aiAssistantMode } = useUIContext();
	const isChatMode = aiAssistantMode === "chat";
	const normalizedCurrentFilePath = useMemo(
		() => normalizePath(currentFilePath),
		[currentFilePath],
	);
	const [input, setInput] = useState("");
	const [addPanelOpen, setAddPanelOpen] = useState(false);
	const [addPanelQuery, setAddPanelQuery] = useState("");
	const [removedAutoContextFile, setRemovedAutoContextFile] = useState("");

	const profiles = useAiProfiles();
	const context = useAiContext({ activeFolderPath });
	const history = useAiHistory(14);
	const setContextSearch = context.setContextSearch;
	const trigger = parseAddTrigger(input);
	const showAddPanel = addPanelOpen || Boolean(trigger);
	const panelQuery = addPanelOpen ? addPanelQuery : (trigger?.query ?? "");
	const [activeTools, setActiveTools] = useState<string[]>([]);
	const [lastToolEvent, setLastToolEvent] = useState<ToolStatusEvent | null>(
		null,
	);
	const [toolTimeline, setToolTimeline] = useState<ToolTimelineEvent[]>([]);
	const [responsePhase, setResponsePhase] = useState<ResponsePhase>("idle");
	const [showSlowStart, setShowSlowStart] = useState(false);
	const [assistantActionError, setAssistantActionError] = useState("");
	const [historyExpanded, setHistoryExpanded] = useState(false);
	const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
	const scheduleComposerInputResize = useCallback(() => {
		window.requestAnimationFrame(() => {
			const el = composerInputRef.current;
			if (!el) return;
			const minHeight = 40;
			const maxHeight = 180;
			el.style.height = "0px";
			const next = Math.max(minHeight, Math.min(el.scrollHeight, maxHeight));
			el.style.height = `${next.toString()}px`;
			el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
		});
	}, []);

	const activeToolJobIdRef = useRef<string | null>(null);
	const slowStartTimerRef = useRef<number | null>(null);
	const finalizingTimerRef = useRef<number | null>(null);

	const clearSlowStartTimer = useCallback(() => {
		if (slowStartTimerRef.current == null) return;
		window.clearTimeout(slowStartTimerRef.current);
		slowStartTimerRef.current = null;
	}, []);

	const clearFinalizingTimer = useCallback(() => {
		if (finalizingTimerRef.current == null) return;
		window.clearTimeout(finalizingTimerRef.current);
		finalizingTimerRef.current = null;
	}, []);

	useEffect(() => {
		setContextSearch(panelQuery);
	}, [panelQuery, setContextSearch]);

	useEffect(() => {
		const onAttach = (event: Event) => {
			const detail = (event as CustomEvent<AiContextAttachDetail>).detail;
			const paths = detail?.paths ?? [];
			if (!paths.length) return;
			for (const path of paths) {
				context.addContext("file", path);
			}
			setAddPanelOpen(false);
			setAddPanelQuery("");
			window.requestAnimationFrame(() => {
				composerInputRef.current?.focus();
			});
		};
		window.addEventListener(AI_CONTEXT_ATTACH_EVENT, onAttach);
		return () => {
			window.removeEventListener(AI_CONTEXT_ATTACH_EVENT, onAttach);
		};
	}, [context.addContext]);

	useEffect(() => {
		if (
			removedAutoContextFile &&
			removedAutoContextFile !== normalizedCurrentFilePath
		) {
			setRemovedAutoContextFile("");
		}
		if (!isChatMode || !normalizedCurrentFilePath) return;
		if (removedAutoContextFile === normalizedCurrentFilePath) return;
		context.addContext("file", normalizedCurrentFilePath);
	}, [
		context.addContext,
		isChatMode,
		normalizedCurrentFilePath,
		removedAutoContextFile,
	]);

	useEffect(() => {
		if (chat.status === "streaming") return;
		activeToolJobIdRef.current = null;
		setActiveTools([]);
		setLastToolEvent(null);
	}, [chat.status]);

	useEffect(() => {
		if (!isChatMode) return;
		activeToolJobIdRef.current = null;
		setToolTimeline([]);
		setActiveTools([]);
		setLastToolEvent(null);
	}, [isChatMode]);

	useTauriEvent("ai:tool", (payload) => {
		if (isChatMode) return;
		if (chat.status !== "submitted" && chat.status !== "streaming") return;
		if (
			activeToolJobIdRef.current &&
			payload.job_id !== activeToolJobIdRef.current
		)
			return;
		if (!activeToolJobIdRef.current) {
			activeToolJobIdRef.current = payload.job_id;
		}
		const tool = payload.tool?.trim() || "tool";
		const phase: ToolPhase =
			payload.phase === "call" ||
			payload.phase === "result" ||
			payload.phase === "error"
				? payload.phase
				: "call";
		if (phase === "call") {
			setActiveTools((prev) => (prev.includes(tool) ? prev : [...prev, tool]));
			setResponsePhase((prev) =>
				prev === "streaming" ? "streaming" : "tooling",
			);
		} else {
			setActiveTools((prev) => prev.filter((name) => name !== tool));
		}
		setLastToolEvent({
			tool,
			phase,
			error: typeof payload.error === "string" ? payload.error : undefined,
		});
		setToolTimeline((prev) => [
			...prev,
			{
				id: `${payload.call_id ?? crypto.randomUUID()}-${phase}-${Date.now()}`,
				tool,
				phase,
				callId: payload.call_id,
				payload: payload.payload,
				error: typeof payload.error === "string" ? payload.error : undefined,
				at:
					typeof payload.at_ms === "number" && payload.at_ms > 0
						? payload.at_ms
						: Date.now(),
			},
		]);
	});

	const toolStatusText = useMemo(() => {
		if (activeTools.length > 0) {
			return `Using ${activeTools.map(formatToolName).join(", ")}…`;
		}
		if (lastToolEvent?.phase === "result") {
			return `Finished ${formatToolName(lastToolEvent.tool)}. Writing response…`;
		}
		if (lastToolEvent?.phase === "error") {
			return `Tool ${formatToolName(lastToolEvent.tool)} failed. Continuing…`;
		}
		return "Thinking…";
	}, [activeTools, lastToolEvent]);

	const isAwaitingResponse =
		chat.status === "submitted" || chat.status === "streaming";

	const phaseStatusText = useMemo(() => {
		if (responsePhase === "submitted") {
			return showSlowStart ? "Still thinking…" : "Preparing response…";
		}
		if (responsePhase === "tooling") {
			return showSlowStart ? "Still working…" : "Working with tools…";
		}
		if (responsePhase === "streaming") {
			return activeTools.length > 0 ? toolStatusText : "Writing response…";
		}
		if (responsePhase === "finalizing") return "Finalizing…";
		return "";
	}, [activeTools.length, responsePhase, showSlowStart, toolStatusText]);

	const canSend =
		!isAwaitingResponse &&
		Boolean(input.trim()) &&
		Boolean(profiles.activeProfileId);
	const lastAssistantMsg = [...chat.messages]
		.reverse()
		.find((m) => m.role === "assistant");
	const lastAssistantText = lastAssistantMsg
		? messageText(lastAssistantMsg)
		: "";
	const lastUserMessageIndex = useMemo(() => {
		for (let i = chat.messages.length - 1; i >= 0; i--) {
			if (chat.messages[i]?.role === "user") return i;
		}
		return -1;
	}, [chat.messages]);

	const handleSend = useCallback(async () => {
		if (!canSend) return;
		const text = context.resolveMentionsFromInput(input);
		if (!text) return;
		clearFinalizingTimer();
		setShowSlowStart(false);
		setResponsePhase("submitted");
		setToolTimeline([]);
		activeToolJobIdRef.current = null;
		setInput("");
		scheduleComposerInputResize();
		const built = await context.ensurePayload();
		if (context.payloadError) {
			setResponsePhase("idle");
			setShowSlowStart(false);
			setInput(text);
			scheduleComposerInputResize();
			return;
		}
		void chat.sendMessage(
			{ text },
			{
				body: {
					profile_id: profiles.activeProfileId ?? undefined,
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
		clearFinalizingTimer,
		context,
		input,
		profiles.activeProfileId,
		scheduleComposerInputResize,
	]);

	const sendWithCurrentContext = useCallback(
		async (text: string) => {
			const trimmed = text.trim();
			if (!trimmed || !profiles.activeProfileId) return false;
			clearFinalizingTimer();
			setShowSlowStart(false);
			setResponsePhase("submitted");
			setToolTimeline([]);
			activeToolJobIdRef.current = null;
			const built = await context.ensurePayload();
			if (context.payloadError) {
				setResponsePhase("idle");
				setShowSlowStart(false);
				return false;
			}
			void chat.sendMessage(
				{ text: trimmed },
				{
					body: {
						profile_id: profiles.activeProfileId ?? undefined,
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
			aiAssistantMode,
			chat,
			clearFinalizingTimer,
			context,
			profiles.activeProfileId,
		],
	);

	const handleCopyAssistantResponse = useCallback(async (text: string) => {
		setAssistantActionError("");
		try {
			await navigator.clipboard.writeText(text);
		} catch (e) {
			setAssistantActionError(
				e instanceof Error ? e.message : "Failed to copy response",
			);
		}
	}, []);

	const handleSaveAssistantResponse = useCallback(async (text: string) => {
		const trimmed = text.trim();
		if (!trimmed) return;
		setAssistantActionError("");
		try {
			const { save } = await import("@tauri-apps/plugin-dialog");
			const selection = await save({
				title: "Save AI response as Markdown",
				defaultPath: "AI Response.md",
				filters: [{ name: "Markdown", extensions: ["md"] }],
			});
			const absPath = Array.isArray(selection)
				? (selection[0] ?? null)
				: selection;
			if (!absPath) return;
			const rel = await invoke("vault_relativize_path", { abs_path: absPath });
			const markdownRel = rel.toLowerCase().endsWith(".md") ? rel : `${rel}.md`;
			await invoke("vault_write_text", {
				path: markdownRel,
				text: trimmed,
				base_mtime_ms: null,
			});
		} catch (e) {
			setAssistantActionError(
				e instanceof Error ? e.message : "Failed to save response to file",
			);
		}
	}, []);

	const handleRetryFromAssistant = useCallback(
		async (assistantIndex: number) => {
			if (chat.status === "streaming") return;
			setAssistantActionError("");
			let userIndex = -1;
			for (let i = assistantIndex - 1; i >= 0; i--) {
				if (chat.messages[i]?.role === "user") {
					userIndex = i;
					break;
				}
			}
			if (userIndex < 0) {
				setAssistantActionError("No matching user prompt found for retry.");
				return;
			}
			const userText = messageText(
				chat.messages[userIndex] as UIMessage,
			).trim();
			if (!userText) {
				setAssistantActionError("No matching user prompt found for retry.");
				return;
			}
			chat.setMessages(chat.messages.slice(0, userIndex));
			const ok = await sendWithCurrentContext(userText);
			if (!ok) {
				setAssistantActionError(
					context.payloadError || "Retry failed due to missing AI context.",
				);
			}
		},
		[chat, context.payloadError, sendWithCurrentContext],
	);

	const handleAddContext = useCallback(
		(kind: "folder" | "file", path: string) => {
			context.addContext(kind, path);
			if (trigger) {
				setInput((prev) => {
					const before = prev.slice(0, trigger.start).trimEnd();
					return before ? `${before} ` : "";
				});
			}
			setAddPanelOpen(false);
			setAddPanelQuery("");
		},
		[context.addContext, trigger],
	);

	const handleRemoveContext = useCallback(
		(kind: "folder" | "file", path: string) => {
			const normalized = normalizePath(path);
			if (
				kind === "file" &&
				isChatMode &&
				normalizedCurrentFilePath &&
				normalized === normalizedCurrentFilePath
			) {
				setRemovedAutoContextFile(normalizedCurrentFilePath);
			}
			context.removeContext(kind, path);
		},
		[context.removeContext, isChatMode, normalizedCurrentFilePath],
	);

	const handleLoadHistory = useCallback(
		async (jobId: string) => {
			const loaded = await history.loadChatMessages(jobId);
			if (!loaded) return;
			const restoredTimeline = loaded.toolEvents.map((event, index) => ({
				id: `${
					event.call_id?.trim()
						? `${event.call_id}-${event.phase}`
						: `${event.tool}-${event.phase}-${index}`
				}-${event.at_ms ?? 0}`,
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
			setToolTimeline(restoredTimeline);
			activeToolJobIdRef.current = null;
			chat.setMessages(loaded.messages);
			chat.clearError();
		},
		[chat, history.loadChatMessages],
	);

	const handleNewChat = useCallback(() => {
		if (chat.status === "streaming") chat.stop();
		clearSlowStartTimer();
		clearFinalizingTimer();
		setInput("");
		scheduleComposerInputResize();
		setToolTimeline([]);
		setAssistantActionError("");
		setShowSlowStart(false);
		setResponsePhase("idle");
		setActiveTools([]);
		setLastToolEvent(null);
		activeToolJobIdRef.current = null;
		chat.setMessages([]);
		chat.clearError();
	}, [chat, clearFinalizingTimer, clearSlowStartTimer, scheduleComposerInputResize]);

	const threadRef = useRef<HTMLDivElement>(null);
	const prevStatusRef = useRef(chat.status);
	const msgCount = chat.messages.length;

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
	useEffect(() => {
		const el = threadRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [msgCount]);

	useEffect(() => {
		if (!isAwaitingResponse) return;
		if (chat.messages.length === 0) return;
		const el = threadRef.current;
		if (!el) return;
		el.scrollTop = el.scrollHeight;
	}, [chat.messages, isAwaitingResponse]);

	useEffect(() => {
		const prev = prevStatusRef.current;
		if (prev === "streaming" && chat.status !== "streaming") {
			void history.refresh();
		}
		if (chat.status === "submitted" && responsePhase === "idle") {
			setShowSlowStart(false);
			setResponsePhase("submitted");
		}
		if (chat.status === "streaming") {
			clearFinalizingTimer();
			setShowSlowStart(false);
			setResponsePhase("streaming");
		}
		if (chat.status === "ready") {
			if (prev === "streaming") {
				clearFinalizingTimer();
				setResponsePhase("finalizing");
				finalizingTimerRef.current = window.setTimeout(() => {
					setResponsePhase("idle");
					setShowSlowStart(false);
					finalizingTimerRef.current = null;
				}, FINALIZING_MS);
			} else if (prev === "submitted") {
				setResponsePhase("idle");
				setShowSlowStart(false);
			}
		}
		if (chat.status === "error") {
			clearSlowStartTimer();
			clearFinalizingTimer();
			setShowSlowStart(false);
			setResponsePhase("idle");
		}
		prevStatusRef.current = chat.status;
	}, [
		chat.status,
		clearFinalizingTimer,
		clearSlowStartTimer,
		history.refresh,
		responsePhase,
	]);

	useEffect(() => {
		clearSlowStartTimer();
		if (
			!isAwaitingResponse ||
			responsePhase === "idle" ||
			responsePhase === "streaming" ||
			responsePhase === "finalizing"
		) {
			setShowSlowStart(false);
			return;
		}
		slowStartTimerRef.current = window.setTimeout(() => {
			setShowSlowStart(true);
			slowStartTimerRef.current = null;
		}, SLOW_START_MS);
		return () => clearSlowStartTimer();
	}, [clearSlowStartTimer, isAwaitingResponse, responsePhase]);

	useEffect(
		() => () => {
			clearSlowStartTimer();
			clearFinalizingTimer();
		},
		[clearFinalizingTimer, clearSlowStartTimer],
	);

	return (
		<div
			className="aiPanel"
			data-open={isOpen}
			data-ai-mode={aiAssistantMode}
			data-window-drag-ignore
		>
			<div className="aiPanelHeader">
				<div className="aiPanelTitle">
					<AiLattice size={18} />
					<span>AI</span>
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
						<Plus size={13} />
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
						<Minus size={13} />
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
						isAwaitingResponse={isAwaitingResponse}
						chatStatus={chat.status}
						phaseStatusText={phaseStatusText}
						toolTimeline={toolTimeline}
						lastUserMessageIndex={lastUserMessageIndex}
						onCopy={(t) => void handleCopyAssistantResponse(t)}
						onSave={(t) => void handleSaveAssistantResponse(t)}
						onRetry={(i) => void handleRetryFromAssistant(i)}
					/>
					{!isChatMode && chat.status === "streaming" && (
						<div
							className={cn(
								"aiToolStatus",
								lastToolEvent?.phase === "error" && "aiToolStatusError",
							)}
							aria-live="polite"
							aria-label="Tool status"
						>
							<span className="aiToolStatusDot" />
							<span>{toolStatusText}</span>
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
				{assistantActionError ? (
					<div className="aiPanelError">
						<span>{assistantActionError}</span>
						<button type="button" onClick={() => setAssistantActionError("")}>
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
					isAwaitingResponse={isAwaitingResponse}
					canSend={canSend}
					isChatMode={isChatMode}
					lastAssistantText={lastAssistantText}
					onSend={() => void handleSend()}
					onStop={() => chat.stop()}
					composerInputRef={composerInputRef}
					scheduleComposerInputResize={scheduleComposerInputResize}
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
					onCreateNoteFromLastAssistant={onCreateNoteFromLastAssistant}
				/>
			</div>
		</div>
	);
}
