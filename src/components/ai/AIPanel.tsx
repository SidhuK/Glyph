import { type UIMessage, useChat } from "@ai-sdk/react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TauriChatTransport } from "../../lib/ai/tauriChatTransport";
import { useTauriEvent } from "../../lib/tauriEvents";
import { openSettingsWindow } from "../../lib/windows";
import { cn } from "../../utils/cn";
import {
  FileText,
  Layout,
  Minus,
  Paperclip,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from "../Icons";
import { Button } from "../ui/shadcn/button";
import { useAiContext } from "./useAiContext";
import { useAiHistory } from "./useAiHistory";
import { useAiProfiles } from "./useAiProfiles";

function messageText(message: UIMessage): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
}

type AddTrigger = { start: number; query: string };
type ToolPhase = "call" | "result" | "error";

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

function formatHistoryTime(createdAtMs: number): string {
  if (!createdAtMs) return "Unknown time";
  return new Date(createdAtMs).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatToolName(tool: string): string {
  return tool.split("_").filter(Boolean).join(" ");
}

interface AIPanelProps {
  activeFolderPath: string | null;
  activeCanvasId: string | null;
  onNewAICanvas: () => Promise<void>;
  onAddAttachmentsToCanvas: (paths: string[]) => Promise<void>;
  onCreateNoteFromLastAssistant: (markdown: string) => Promise<void>;
  onClose: () => void;
}

export function AIPanel({
  activeFolderPath,
  activeCanvasId,
  onNewAICanvas,
  onAddAttachmentsToCanvas,
  onCreateNoteFromLastAssistant,
  onClose,
}: AIPanelProps) {
  const transport = useMemo(() => new TauriChatTransport(), []);
  const chat = useChat({ transport, experimental_throttle: 32 });
  const [input, setInput] = useState("");
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  const [addPanelQuery, setAddPanelQuery] = useState("");

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
  const shouldReduceMotion = useReducedMotion();
  const activeToolJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    setContextSearch(panelQuery);
  }, [panelQuery, setContextSearch]);

  useEffect(() => {
    if (chat.status === "streaming") return;
    activeToolJobIdRef.current = null;
    setActiveTools([]);
    setLastToolEvent(null);
  }, [chat.status]);

  useTauriEvent("ai:tool", (payload) => {
    if (chat.status !== "streaming") return;
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
    } else {
      setActiveTools((prev) => prev.filter((name) => name !== tool));
    }

    setLastToolEvent({
      tool,
      phase,
      error: typeof payload.error === "string" ? payload.error : undefined,
    });
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

  const canSend =
    chat.status !== "streaming" &&
    Boolean(input.trim()) &&
    Boolean(profiles.activeProfileId);
  const lastAssistantText = [...chat.messages]
    .reverse()
    .find((m) => m.role === "assistant");

  const handleSend = async () => {
    if (!canSend) return;
    const text = context.resolveMentionsFromInput(input);
    if (!text) return;
    setInput("");
    const built = await context.ensurePayload();
    if (context.payloadError) {
      setInput(text);
      return;
    }
    void chat.sendMessage(
      { text },
      {
        body: {
          profile_id: profiles.activeProfileId,
          context: built.payload || undefined,
          context_manifest: built.manifest ?? undefined,
          canvas_id: activeCanvasId ?? undefined,
          audit: true,
        },
      },
    );
  };

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

  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragOrigin = useRef({ px: 0, py: 0, ox: 0, oy: 0 });

  const onDragDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragging.current = true;
      dragOrigin.current = {
        px: e.clientX,
        py: e.clientY,
        ox: pos.x,
        oy: pos.y,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pos],
  );

  const onDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    setPos({
      x: dragOrigin.current.ox + (e.clientX - dragOrigin.current.px),
      y: dragOrigin.current.oy + (e.clientY - dragOrigin.current.py),
    });
  }, []);

  const onDragUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const handleLoadHistory = useCallback(
    async (jobId: string) => {
      const messages = await history.loadChatMessages(jobId);
      if (!messages) return;
      chat.setMessages(messages);
      chat.clearError();
    },
    [chat, history.loadChatMessages],
  );

  const threadRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef(chat.status);
  const msgCount = chat.messages.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgCount]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev === "streaming" && chat.status !== "streaming") {
      void history.refresh();
    }
    prevStatusRef.current = chat.status;
  }, [chat.status, history.refresh]);

  return (
    <motion.div
      className="aiPanel"
      style={{
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        pointerEvents: "auto",
      }}
      initial={{ opacity: 0, scale: 0.92, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 12 }}
      transition={
        shouldReduceMotion
          ? { type: "tween", duration: 0 }
          : { type: "spring", stiffness: 260, damping: 24 }
      }
      data-window-drag-ignore
    >
      <div
        className="aiPanelHeader"
        onPointerDown={onDragDown}
        onPointerMove={onDragMove}
        onPointerUp={onDragUp}
      >
        <div className="aiPanelTitle">
          <Sparkles size={14} />
          <span>AI</span>
        </div>
        <div className="aiPanelHeaderRight">
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
            aria-label="Close"
            onClick={onClose}
            title="Close"
            onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
          >
            <Minus size={13} />
          </Button>
        </div>
      </div>

      <div className="aiPanelBody">
        <div className="aiHistory">
          <div className="aiHistoryHeader">
            <span>Recent Chats</span>
            <button
              type="button"
              onClick={() => void history.refresh()}
              disabled={history.listLoading}
            >
              Refresh
            </button>
          </div>
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
                  <div className="aiHistoryItemPreview">
                    {item.preview || "Untitled chat"}
                  </div>
                  <div className="aiHistoryItemMeta">
                    <span>{formatHistoryTime(item.created_at_ms)}</span>
                    <span>{item.profile_name || item.model || "AI"}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="aiHistoryEmpty">
                {history.listLoading ? "Loading chats…" : "No chat history yet"}
              </div>
            )}
          </div>
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
          {chat.messages.map((m) => {
            const text = messageText(m).trim();
            if (!text) return null;
            return (
              <div
                key={m.id}
                className={cn(
                  "aiChatMsg",
                  m.role === "user" ? "aiChatMsg-user" : "aiChatMsg-assistant",
                )}
              >
                <div className="aiChatContent">{text}</div>
              </div>
            );
          })}
          {chat.status === "streaming" && (
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
                onClick={() => context.removeContext(item.kind, item.path)}
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
          <textarea
            className="aiComposerInput"
            value={input}
            placeholder="Ask AI…"
            disabled={chat.status === "streaming"}
            onChange={(e) => setInput(e.target.value)}
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
                aria-label="New AI canvas"
                title="New AI canvas"
                onClick={() => void onNewAICanvas()}
              >
                <Layout size={14} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Add attachments to canvas"
                title="Add attachments to canvas"
                onClick={() =>
                  void context
                    .resolveAttachedPathsForCanvas()
                    .then((paths) => onAddAttachmentsToCanvas(paths))
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
                disabled={!lastAssistantText}
              >
                <Sparkles size={14} />
              </Button>
            </div>
            {chat.status === "streaming" ? (
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
                <Send size={14} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
