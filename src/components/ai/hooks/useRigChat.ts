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
		mode?: AiAssistantMode;
		context?: string;
		context_manifest?: unknown;
		audit?: boolean;
	};
};

type RigChatStatus = "ready" | "submitted" | "streaming" | "error";

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
	const stopListenersRef = useRef<Array<() => void>>([]);

	useEffect(() => {
		messagesRef.current = messages;
	}, [messages]);

	const cleanupListeners = useCallback(() => {
		for (const stop of stopListenersRef.current) {
			stop();
		}
		stopListenersRef.current = [];
	}, []);

	const clearError = useCallback(() => {
		setError(null);
		setStatus((prev) => (prev === "error" ? "ready" : prev));
	}, []);

	const stop = useCallback(() => {
		const jobId = activeJobIdRef.current;
		if (jobId) {
			void invoke("ai_chat_cancel", { job_id: jobId }).catch(() => {});
		}
		activeJobIdRef.current = null;
		cleanupListeners();
		setStatus("ready");
	}, [cleanupListeners]);

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
				const { job_id: jobId } = await invoke("ai_chat_start", {
					request: {
						profile_id: profileId,
						messages: asAiMessages([...messagesRef.current, userMessage]),
						mode: options?.body?.mode ?? "create",
						context: options?.body?.context || undefined,
						context_manifest: options?.body?.context_manifest,
						audit: options?.body?.audit ?? true,
					},
				});

				activeJobIdRef.current = jobId;

				const onChunk = await listenTauriEvent("ai:chunk", (payload) => {
					if (payload.job_id !== activeJobIdRef.current) return;
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
					activeJobIdRef.current = null;
					cleanupListeners();
					setStatus("ready");
				});

				const onError = await listenTauriEvent("ai:error", (payload) => {
					if (payload.job_id !== activeJobIdRef.current) return;
					activeJobIdRef.current = null;
					cleanupListeners();
					setError(new Error(payload.message));
					setStatus("error");
				});

				stopListenersRef.current = [onChunk, onDone, onError];
			} catch (err) {
				activeJobIdRef.current = null;
				cleanupListeners();
				setError(err instanceof Error ? err : new Error(String(err)));
				setStatus("error");
			}
		},
		[cleanupListeners, stop],
	);

	useEffect(() => () => stop(), [stop]);

	return {
		messages,
		status,
		error,
		sendMessage,
		setMessages,
		clearError,
		stop,
	};
}
