import { useCallback, useEffect, useRef, useState } from "react";
import {
	type AiAssistantMode,
	type AiMessage,
	type AiProviderKind,
	invoke,
} from "../../../lib/tauri";
import { listenTauriEvent } from "../../../lib/tauriEvents";

type UIMessagePart = { type: "text"; text: string };

export interface UIMessage {
	id: string;
	role: "system" | "user" | "assistant";
	parts: UIMessagePart[];
}

type SendMessageArgs = { text: string };
type ChunkPayload = { job_id: string; delta: string };
type DonePayload = { job_id: string; cancelled: boolean };
type ErrorPayload = { job_id: string; message: string };

type SendMessageOptions = {
	body?: {
		profile_id?: string;
		provider?: AiProviderKind;
		thread_id?: string;
		mode?: AiAssistantMode;
		system_prompt?: string;
		context?: string;
		context_manifest?: unknown;
		audit?: boolean;
	};
};

interface UseRigChatOptions {
	onComplete?: () => void;
}

export type RigChatStatus = "ready" | "submitted" | "streaming" | "error";
const DONE_SETTLE_MS = 140;

function asAiMessages(messages: UIMessage[]): AiMessage[] {
	const out: AiMessage[] = [];
	for (const message of messages) {
		const content = message.parts
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("")
			.trim();
		if (!content) continue;
		out.push({ role: message.role, content });
	}
	return out;
}

export function useRigChat(options: UseRigChatOptions = {}) {
	const [messages, setMessages] = useState<UIMessage[]>([]);
	const [status, setStatus] = useState<RigChatStatus>("ready");
	const [error, setError] = useState<Error | null>(null);

	const messagesRef = useRef<UIMessage[]>([]);
	const activeJobIdRef = useRef<string | null>(null);
	const activeThreadIdRef = useRef<string | null>(null);
	const awaitingStartRef = useRef(false);
	const stopListenersRef = useRef<Array<() => void>>([]);
	const doneTimerRef = useRef<number | null>(null);
	const onComplete = options.onComplete;

	const updateMessages = useCallback(
		(next: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => {
			setMessages((prev) => {
				const resolved = typeof next === "function" ? next(prev) : next;
				messagesRef.current = resolved;
				return resolved;
			});
		},
		[],
	);

	const cleanupListeners = useCallback(() => {
		for (const stop of stopListenersRef.current) {
			stop();
		}
		stopListenersRef.current = [];
	}, []);

	const clearDoneTimer = useCallback(() => {
		if (doneTimerRef.current == null) return;
		window.clearTimeout(doneTimerRef.current);
		doneTimerRef.current = null;
	}, []);

	const completeActiveJob = useCallback(() => {
		clearDoneTimer();
		activeJobIdRef.current = null;
		awaitingStartRef.current = false;
		cleanupListeners();
		setStatus("ready");
		onComplete?.();
	}, [cleanupListeners, clearDoneTimer, onComplete]);

	const clearError = useCallback(() => {
		setError(null);
		setStatus((prev) => (prev === "error" ? "ready" : prev));
	}, []);

	const stop = useCallback(() => {
		const jobId = activeJobIdRef.current;
		if (jobId) {
			void invoke("ai_chat_cancel", { job_id: jobId }).catch(() => {});
		}
		clearDoneTimer();
		activeJobIdRef.current = null;
		awaitingStartRef.current = false;
		cleanupListeners();
		setStatus("ready");
	}, [cleanupListeners, clearDoneTimer]);

	const sendMessage = useCallback(
		async ({ text }: SendMessageArgs, options?: SendMessageOptions) => {
			const trimmed = text.trim();
			if (!trimmed) return;
			const profileId = options?.body?.profile_id?.trim() ?? "";
			if (!profileId) {
				setError(new Error("No AI profile selected."));
				setStatus("error");
				return;
			}

			setError(null);
			stop();

			const previousMessages = messagesRef.current;
			const userId = crypto.randomUUID();
			const assistantId = crypto.randomUUID();
			const userMessage: UIMessage = {
				id: userId,
				role: "user",
				parts: [{ type: "text", text: trimmed }],
			};
			const assistantMessage: UIMessage = {
				id: assistantId,
				role: "assistant",
				parts: [{ type: "text", text: "" }],
			};
			const nextMessages = [...previousMessages, userMessage, assistantMessage];
			updateMessages(nextMessages);
			setStatus("submitted");
			awaitingStartRef.current = true;

			try {
				clearDoneTimer();
				const requestedThreadId = options?.body?.thread_id?.trim() ?? "";
				const threadId =
					requestedThreadId || activeThreadIdRef.current || crypto.randomUUID();
				activeThreadIdRef.current = threadId;
				const systemPrompt = options?.body?.system_prompt?.trim() ?? "";
				const requestMessages = asAiMessages([
					...previousMessages,
					userMessage,
				]);
				if (systemPrompt) {
					requestMessages.unshift({
						role: "system",
						content: systemPrompt,
					});
				}
				const pendingChunks: ChunkPayload[] = [];
				let pendingDone: DonePayload | null = null;
				let pendingError: ErrorPayload | null = null;
				const shouldBufferEvent = (jobId: string) =>
					awaitingStartRef.current && !activeJobIdRef.current && !!jobId;
				const isActiveJob = (jobId: string) => jobId === activeJobIdRef.current;
				const handleChunk = (payload: ChunkPayload) => {
					if (!isActiveJob(payload.job_id)) return;
					clearDoneTimer();
					setStatus("streaming");
					updateMessages((prev) =>
						prev.map((m) => {
							if (m.id !== assistantId) return m;
							const first = m.parts[0];
							return {
								...m,
								parts: [
									{
										type: "text",
										text: `${first?.text ?? ""}${payload.delta}`,
									},
								],
							};
						}),
					);
				};
				const handleDone = (payload: DonePayload) => {
					if (!isActiveJob(payload.job_id)) return;
					awaitingStartRef.current = false;
					clearDoneTimer();
					doneTimerRef.current = window.setTimeout(() => {
						if (payload.job_id !== activeJobIdRef.current) return;
						completeActiveJob();
					}, DONE_SETTLE_MS);
				};
				const handleError = (payload: ErrorPayload) => {
					if (!isActiveJob(payload.job_id)) return;
					clearDoneTimer();
					activeJobIdRef.current = null;
					awaitingStartRef.current = false;
					cleanupListeners();
					setError(new Error(payload.message));
					setStatus("error");
				};

				const onChunk = await listenTauriEvent("ai:chunk", (payload) => {
					if (shouldBufferEvent(payload.job_id)) {
						pendingChunks.push(payload);
						return;
					}
					handleChunk(payload);
				});

				const onDone = await listenTauriEvent("ai:done", (payload) => {
					if (shouldBufferEvent(payload.job_id)) {
						pendingDone = payload;
						return;
					}
					handleDone(payload);
				});

				const onError = await listenTauriEvent("ai:error", (payload) => {
					if (shouldBufferEvent(payload.job_id)) {
						pendingError = payload;
						return;
					}
					handleError(payload);
				});

				stopListenersRef.current = [onChunk, onDone, onError];

				const { job_id: jobId } = await invoke("ai_chat_start", {
					request: {
						profile_id: profileId,
						messages: requestMessages,
						thread_id: threadId,
						mode: options?.body?.mode ?? "create",
						context: options?.body?.context || undefined,
						context_manifest: options?.body?.context_manifest,
						audit: options?.body?.audit ?? true,
					},
				});

				activeJobIdRef.current = jobId;
				awaitingStartRef.current = false;
				for (const payload of pendingChunks) {
					handleChunk(payload);
				}
				if (pendingError) {
					handleError(pendingError);
				} else if (pendingDone) {
					handleDone(pendingDone);
				}
			} catch (err) {
				clearDoneTimer();
				activeJobIdRef.current = null;
				awaitingStartRef.current = false;
				cleanupListeners();
				setError(err instanceof Error ? err : new Error(String(err)));
				setStatus("error");
			}
		},
		[cleanupListeners, clearDoneTimer, completeActiveJob, stop, updateMessages],
	);

	useEffect(
		() => () => {
			clearDoneTimer();
			stop();
		},
		[clearDoneTimer, stop],
	);

	return {
		messages,
		status,
		error,
		sendMessage,
		setMessages: (next: UIMessage[]) => {
			if (next.length === 0) activeThreadIdRef.current = null;
			updateMessages(next);
		},
		setThreadId: (threadId: string | null) => {
			activeThreadIdRef.current = threadId?.trim() || null;
		},
		clearError,
		stop,
	};
}
