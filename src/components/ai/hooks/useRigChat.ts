import { useCallback, useEffect, useRef, useState } from "react";
import {
	type AiAssistantMode,
	type AiMessage,
	invoke,
} from "../../../lib/tauri";
import { listenTauriEvent } from "../../../lib/tauriEvents";

export type UIMessagePart = { type: "text"; text: string };

export interface UIMessage {
	id: string;
	role: "system" | "user" | "assistant";
	parts: UIMessagePart[];
}

type SendMessageArgs = { text: string };

type SendMessageOptions = {
	body?: {
		profile_id?: string;
		thread_id?: string;
		mode?: AiAssistantMode;
		context?: string;
		context_manifest?: unknown;
		audit?: boolean;
	};
};

type RigChatStatus = "ready" | "submitted" | "streaming" | "error";
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

export function useRigChat() {
	const [messages, setMessages] = useState<UIMessage[]>([]);
	const [status, setStatus] = useState<RigChatStatus>("ready");
	const [error, setError] = useState<Error | null>(null);

	const messagesRef = useRef<UIMessage[]>([]);
	const activeJobIdRef = useRef<string | null>(null);
	const activeThreadIdRef = useRef<string | null>(null);
	const stopListenersRef = useRef<Array<() => void>>([]);
	const doneTimerRef = useRef<number | null>(null);

	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);

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
		cleanupListeners();
		setStatus("ready");
	}, [cleanupListeners, clearDoneTimer]);

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
			const nextMessages = [
				...messagesRef.current,
				userMessage,
				assistantMessage,
			];
			setMessages(nextMessages);
			setStatus("submitted");

			try {
				clearDoneTimer();
				const requestedThreadId = options?.body?.thread_id?.trim() ?? "";
				const threadId =
					requestedThreadId || activeThreadIdRef.current || crypto.randomUUID();
				activeThreadIdRef.current = threadId;
				const { job_id: jobId } = await invoke("ai_chat_start", {
					request: {
						profile_id: profileId,
						messages: asAiMessages([...messagesRef.current, userMessage]),
						thread_id: threadId,
						mode: options?.body?.mode ?? "create",
						context: options?.body?.context || undefined,
						context_manifest: options?.body?.context_manifest,
						audit: options?.body?.audit ?? true,
					},
				});

				activeJobIdRef.current = jobId;

				const onChunk = await listenTauriEvent("ai:chunk", (payload) => {
					if (payload.job_id !== activeJobIdRef.current) return;
					clearDoneTimer();
					setStatus("streaming");
					setMessages((prev) =>
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
				});

				const onDone = await listenTauriEvent("ai:done", (payload) => {
					if (payload.job_id !== activeJobIdRef.current) return;
					clearDoneTimer();
					doneTimerRef.current = window.setTimeout(() => {
						if (payload.job_id !== activeJobIdRef.current) return;
						completeActiveJob();
					}, DONE_SETTLE_MS);
				});

				const onError = await listenTauriEvent("ai:error", (payload) => {
					if (payload.job_id !== activeJobIdRef.current) return;
					clearDoneTimer();
					activeJobIdRef.current = null;
					cleanupListeners();
					setError(new Error(payload.message));
					setStatus("error");
				});

				stopListenersRef.current = [onChunk, onDone, onError];
			} catch (err) {
				clearDoneTimer();
				activeJobIdRef.current = null;
				cleanupListeners();
				setError(err instanceof Error ? err : new Error(String(err)));
				setStatus("error");
			}
		},
		[cleanupListeners, clearDoneTimer, completeActiveJob, stop],
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
			setMessages(next);
		},
		setThreadId: (threadId: string | null) => {
			activeThreadIdRef.current = threadId?.trim() || null;
		},
		clearError,
		stop,
	};
}
