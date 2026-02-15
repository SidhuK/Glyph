import { Navigation03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion, useReducedMotion } from "motion/react";
import {
	Fragment,
	Suspense,
	lazy,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import anthropicLogoUrl from "../../assets/provider-logos/claude-ai.svg?url";
import geminiLogoUrl from "../../assets/provider-logos/google-gemini.svg?url";
import ollamaLogoUrl from "../../assets/provider-logos/ollama.svg?url";
import openrouterLogoUrl from "../../assets/provider-logos/open-router.svg?url";
import openaiLogoUrl from "../../assets/provider-logos/openai-light.svg?url";
import { useUIContext } from "../../contexts";
import { invoke } from "../../lib/tauri";
import type { AiAssistantMode, AiProviderKind } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { openSettingsWindow } from "../../lib/windows";
import { cn } from "../../utils/cn";
import {
	AiLattice,
	ChevronDown,
	FileText,
	Files,
	Layout,
	Minus,
	Paperclip,
	Plus,
	RefreshCw,
	Save,
	Settings as SettingsIcon,
	X,
} from "../Icons";
import { Button } from "../ui/shadcn/button";
import { AIToolTimeline, type ToolTimelineEvent } from "./AIToolTimeline";
import { ModelSelector } from "./ModelSelector";
import {
	AI_CONTEXT_ATTACH_EVENT,
	type AiContextAttachDetail,
} from "./aiContextEvents";
import { type UIMessage, useRigChat } from "./hooks/useRigChat";
import { useAiContext } from "./useAiContext";
import { useAiHistory } from "./useAiHistory";
import { useAiProfiles } from "./useAiProfiles";

const AIMessageMarkdown = lazy(async () => {
	const module = await import("./AIMessageMarkdown");
	return { default: module.AIMessageMarkdown };
});

function messageText(message: UIMessage): string {
	return message.parts
		.filter((p) => p.type === "text")
		.map((p) => p.text)
		.join("");
}

type AddTrigger = { start: number; query: string };
type ToolPhase = "call" | "result" | "error";
type ResponsePhase =
	| "idle"
	| "submitted"
	| "tooling"
	| "streaming"
	| "finalizing";

interface ToolStatusEvent {
	tool: string;
	phase: ToolPhase;
	error?: string;
}

function parseAddTrigger(input: string): AddTrigger | null {
	const addMatch = input.match(/(?:^|\s)\/add\s*([\w\-./ ]*)$/);
	if (addMatch) {
		const idx = input.lastIndexOf("/add");
		return { start: idx, query: (addMatch[1] ?? "").trim() };
	}
	const atMatch = input.match(/(?:^|\s)@([\w\-./ ]*)$/);
	if (atMatch) {
		const idx = input.lastIndexOf("@");
		return { start: idx, query: (atMatch[1] ?? "").trim() };
	}
	return null;
}

function formatToolName(tool: string): string {
	return tool.split("_").filter(Boolean).join(" ");
}

const providerLogoMap: Record<AiProviderKind, string> = {
	openai: openaiLogoUrl,
	openai_compat: openaiLogoUrl,
	openrouter: openrouterLogoUrl,
	anthropic: anthropicLogoUrl,
	gemini: geminiLogoUrl,
	ollama: ollamaLogoUrl,
};

const AI_MODES: Array<{ value: AiAssistantMode; label: string; hint: string }> =
	[
		{
			value: "chat",
			label: "Chat",
			hint: "Read-only answers from attached/current context.",
		},
		{
			value: "create",
			label: "Create",
			hint: "Agentic mode with tools and file actions.",
		},
	];

const SLOW_START_MS = 3000;
const FINALIZING_MS = 280;

function normalizePath(path: string | null | undefined): string {
	return (path ?? "")
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

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
	const { aiAssistantMode, setAiAssistantMode } = useUIContext();
	const shouldReduceMotion = useReducedMotion();
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
		) {
			return;
		}
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
		if (responsePhase === "finalizing") {
			return "Finalizing…";
		}
		return "";
	}, [activeTools.length, responsePhase, showSlowStart, toolStatusText]);

	const canSend =
		!isAwaitingResponse &&
		Boolean(input.trim()) &&
		Boolean(profiles.activeProfileId);
	const lastAssistantText = [...chat.messages]
		.reverse()
		.find((m) => m.role === "assistant");
	const lastUserMessageIndex = useMemo(() => {
		for (let i = chat.messages.length - 1; i >= 0; i--) {
			if (chat.messages[i]?.role === "user") return i;
		}
		return -1;
	}, [chat.messages]);

	const handleSend = async () => {
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
	};

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

	const handleAddContext = (kind: "folder" | "file", path: string) => {
		context.addContext(kind, path);
		if (trigger) {
			setInput((prev) => {
				const before = prev.slice(0, trigger.start).trimEnd();
				return before ? `${before} ` : "";
			});
		}
		setAddPanelOpen(false);
		setAddPanelQuery("");
	};

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
		if (chat.status === "streaming") {
			chat.stop();
		}
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
	}, [
		chat,
		clearFinalizingTimer,
		clearSlowStartTimer,
		scheduleComposerInputResize,
	]);

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
				<div className="aiHistory">
					<div className="aiHistoryHeader">
						<button
							type="button"
							className="aiHistoryToggle"
							aria-expanded={historyExpanded}
							onClick={() => setHistoryExpanded((prev) => !prev)}
						>
							<span>Recent Chats</span>
							<ChevronDown
								size={12}
								className={cn(
									"aiHistoryChevron",
									historyExpanded && "aiHistoryChevron-open",
								)}
							/>
						</button>
						{historyExpanded ? (
							<button
								type="button"
								onClick={() => void history.refresh()}
								disabled={history.listLoading}
							>
								Refresh
							</button>
						) : null}
					</div>
					{historyExpanded ? (
						<div className="aiHistoryList">
							{history.summaries.length > 0 ? (
								history.summaries.map((item) => (
									<button
										key={item.job_id}
										type="button"
										className={cn(
											"aiHistoryItem",
											history.selectedJobId === item.job_id && "active",
										)}
										onClick={() => void handleLoadHistory(item.job_id)}
										disabled={history.loadingJobId === item.job_id}
									>
										<div className="aiHistoryItemTitle">
											{item.title || "Untitled chat"}
										</div>
										{item.provider ? (
											<img
												className="aiHistoryProviderIcon"
												src={providerLogoMap[item.provider]}
												alt={item.provider}
												draggable={false}
											/>
										) : null}
									</button>
								))
							) : (
								<div className="aiHistoryEmpty">
									{history.listLoading
										? "Loading chats…"
										: "No chat history yet"}
								</div>
							)}
						</div>
					) : null}
				</div>

				<div className="aiChatThread" ref={threadRef}>
					{chat.messages.length === 0 ? (
						<div className="aiChatEmpty">
							<div className="aiChatEmptyTitle">
								Ask anything about your notes
							</div>
							<div className="aiChatEmptyMeta">
								Use @ to mention files or folders
							</div>
						</div>
					) : null}
					{chat.messages.map((m, index) => {
						const text = messageText(m).trim();
						const isPendingAssistant =
							m.role === "assistant" &&
							!text &&
							isAwaitingResponse &&
							index === chat.messages.length - 1;
						if (!text && !isPendingAssistant) return null;
						return (
							<Fragment key={m.id}>
								<div
									className={cn(
										"aiChatMsg",
										m.role === "user"
											? "aiChatMsg-user"
											: "aiChatMsg-assistant",
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
												onClick={() => void handleCopyAssistantResponse(text)}
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
												onClick={() => void handleSaveAssistantResponse(text)}
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
												onClick={() => void handleRetryFromAssistant(index)}
												title="Retry this response"
												aria-label="Retry response"
												disabled={chat.status === "streaming"}
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
											chat.status === "streaming" || chat.status === "submitted"
										}
									/>
								) : null}
							</Fragment>
						);
					})}
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

				{context.attachedFolders.length > 0 ? (
					<div className="aiContextChips">
						{context.attachedFolders.map((item) => (
							<button
								key={`${item.kind}:${item.path || "vault"}`}
								type="button"
								className="aiContextChip"
								onClick={() => handleRemoveContext(item.kind, item.path)}
								title={`Remove ${item.label}`}
							>
								<span>{item.label || "Vault"}</span>
								<X size={10} />
							</button>
						))}
					</div>
				) : null}

				{showAddPanel ? (
					<div className="aiAddPanel">
						<input
							type="search"
							className="aiAddPanelInput"
							placeholder="Search files & folders…"
							value={panelQuery}
							onChange={(e) => {
								if (!addPanelOpen) setAddPanelOpen(true);
								setAddPanelQuery(e.target.value);
							}}
						/>
						{context.folderIndexError ? (
							<div className="aiPanelError">{context.folderIndexError}</div>
						) : null}
						<div className="aiAddPanelList">
							{context.visibleSuggestions.length ? (
								context.visibleSuggestions.map((item) => (
									<button
										key={`${item.kind}:${item.path || "vault"}`}
										type="button"
										className="aiAddPanelItem"
										onClick={() => handleAddContext(item.kind, item.path)}
									>
										{item.kind === "folder" ? (
											<Layout size={12} />
										) : (
											<FileText size={12} />
										)}
										<span>{item.label || "Vault"}</span>
									</button>
								))
							) : (
								<div className="aiAddPanelEmpty">No results</div>
							)}
						</div>
						<button
							type="button"
							className="aiAddPanelClose"
							onClick={() => setAddPanelOpen(false)}
						>
							<X size={11} />
						</button>
					</div>
				) : null}

				<div className="aiComposer">
					<div className="aiComposerInputShell">
						<textarea
							ref={composerInputRef}
							className="aiComposerInput"
							value={input}
							placeholder="Ask AI…"
							disabled={isAwaitingResponse}
							onChange={(e) => {
								setInput(e.target.value);
								scheduleComposerInputResize();
							}}
							onKeyDown={(e) => {
								if (
									e.key === "Enter" &&
									!e.shiftKey &&
									!e.metaKey &&
									!e.ctrlKey
								) {
									e.preventDefault();
									void handleSend();
								}
							}}
							rows={1}
						/>
						<div
							className="aiModeMiniToggle"
							role="tablist"
							aria-label="AI mode"
						>
							{AI_MODES.map((mode) => {
								const active = mode.value === aiAssistantMode;
								return (
									<button
										key={mode.value}
										type="button"
										role="tab"
										aria-selected={active}
										className={cn("aiModeMiniOption", active && "active")}
										title={mode.hint}
										onClick={() => setAiAssistantMode(mode.value)}
										disabled={isAwaitingResponse}
									>
										{active ? (
											<motion.span
												layoutId="ai-mode-active"
												className={cn(
													"aiModeMiniActive",
													`aiModeMiniActive-${mode.value}`,
												)}
												transition={
													shouldReduceMotion
														? { duration: 0 }
														: { type: "spring", stiffness: 420, damping: 28 }
												}
											/>
										) : null}
										<span className="aiModeMiniText">{mode.label}</span>
									</button>
								);
							})}
						</div>
					</div>
					<div className="aiComposerBar">
						<div className="aiComposerTools">
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Attach file or folder"
								title="Attach file or folder"
								onClick={() => {
									setAddPanelOpen(true);
									setAddPanelQuery("");
								}}
							>
								<Paperclip size={14} />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Attach selected context files"
								title="Attach selected context files"
								onClick={() =>
									void context
										.resolveAttachedPaths()
										.then((paths) => onAttachContextFiles(paths))
								}
								disabled={context.attachedFolders.length === 0}
							>
								<FileText size={14} />
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label="Create note from last reply"
								title="Create note from last reply"
								onClick={() =>
									void onCreateNoteFromLastAssistant(
										lastAssistantText ? messageText(lastAssistantText) : "",
									)
								}
								disabled={isChatMode || !lastAssistantText}
							>
								<AiLattice size={18} />
							</Button>
						</div>
						<div className="aiComposerRight">
							<ModelSelector
								profileId={profiles.activeProfileId}
								value={profiles.activeProfile?.model ?? ""}
								provider={profiles.activeProfile?.provider ?? null}
								profiles={profiles.profiles}
								activeProfileId={profiles.activeProfileId}
								onProfileChange={(id) => void profiles.setActive(id)}
								onChange={(modelId) => void profiles.setModel(modelId)}
							/>
							{isAwaitingResponse ? (
								<button
									type="button"
									className="aiComposerStop"
									onClick={() => chat.stop()}
								>
									Stop
								</button>
							) : (
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									className="aiComposerSend"
									disabled={!canSend}
									onClick={handleSend}
									aria-label="Send"
									title="Send"
								>
									<HugeiconsIcon icon={Navigation03Icon} size={14} />
								</Button>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
