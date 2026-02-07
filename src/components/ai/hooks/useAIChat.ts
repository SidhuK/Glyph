import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type AiMessage, invoke } from "../../../lib/tauri";
import { useTauriEvent } from "../../../lib/tauriEvents";
import type { ChatMessage, ContextManifest } from "../types";
import { errMessage } from "../utils";

export interface UseAIChatOptions {
	activeProfileId: string | null;
	payloadApproved: boolean;
	payloadManifest: ContextManifest | null;
	payloadPreview: string;
}

export interface UseAIChatResult {
	chatMessages: ChatMessage[];
	setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
	input: string;
	setInput: React.Dispatch<React.SetStateAction<string>>;
	jobId: string | null;
	lastCompletedJobId: string | null;
	streaming: boolean;
	chatError: string;
	setChatError: React.Dispatch<React.SetStateAction<string>>;
	lastAssistantMessage: string;
	streamingTextRef: React.MutableRefObject<string>;
	pendingActionRef: React.MutableRefObject<"chat" | "rewrite_active_note">;
	startRequest: (userText: string) => Promise<void>;
	onSend: () => Promise<void>;
	onCancel: () => Promise<void>;
	clearChat: () => void;
}

export function useAIChat(options: UseAIChatOptions): UseAIChatResult {
	const { activeProfileId, payloadApproved, payloadManifest, payloadPreview } =
		options;

	const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState("");
	const [jobId, setJobId] = useState<string | null>(null);
	const [lastCompletedJobId, setLastCompletedJobId] = useState<string | null>(
		null,
	);
	const [streaming, setStreaming] = useState(false);
	const [chatError, setChatError] = useState("");

	const streamingTextRef = useRef("");
	const jobIdRef = useRef<string | null>(null);
	const pendingActionRef = useRef<"chat" | "rewrite_active_note">("chat");

	useEffect(() => {
		jobIdRef.current = jobId;
	}, [jobId]);

	const lastAssistantMessage = useMemo(() => {
		for (let i = chatMessages.length - 1; i >= 0; i--) {
			const m = chatMessages[i];
			if (m?.role !== "assistant") continue;
			if (!m.content.trim()) continue;
			return m.content;
		}
		return "";
	}, [chatMessages]);

	const onChunk = useCallback((payload: { job_id: string; delta: string }) => {
		if (payload.job_id !== jobIdRef.current) return;
		streamingTextRef.current += payload.delta;
		setChatMessages((prev) => {
			const next = prev.slice();
			for (let i = next.length - 1; i >= 0; i--) {
				if (next[i]?.role !== "assistant") continue;
				next[i] = { ...next[i], content: streamingTextRef.current };
				break;
			}
			return next;
		});
	}, []);

	const onDone = useCallback(
		(payload: { job_id: string; cancelled: boolean }) => {
			if (payload.job_id !== jobIdRef.current) return;
			setStreaming(false);
			setJobId(null);
			setLastCompletedJobId(payload.job_id);
			pendingActionRef.current = "chat";
		},
		[],
	);

	const onError = useCallback(
		(payload: { job_id: string; message: string }) => {
			if (payload.job_id !== jobIdRef.current) return;
			setStreaming(false);
			setJobId(null);
			setChatError(payload.message);
			pendingActionRef.current = "chat";
		},
		[],
	);

	useTauriEvent("ai:chunk", onChunk);
	useTauriEvent("ai:done", onDone);
	useTauriEvent("ai:error", onError);

	const startRequest = useCallback(
		async (userText: string) => {
			if (!activeProfileId) {
				setChatError("No AI profile selected.");
				return;
			}
			if (!userText.trim()) return;
			if (!payloadApproved) {
				setChatError("Approve the context payload before sending.");
				return;
			}
			if (!payloadManifest) {
				setChatError("Build the context payload first.");
				return;
			}
			setChatError("");
			const nextUser: ChatMessage = {
				id: crypto.randomUUID(),
				role: "user",
				content: userText.trim(),
			};
			streamingTextRef.current = "";
			setChatMessages((prev) => [
				...prev,
				nextUser,
				{ id: crypto.randomUUID(), role: "assistant", content: "" },
			]);
			setStreaming(true);
			try {
				const messagesForRequest: AiMessage[] = [...chatMessages, nextUser].map(
					(m) => ({ role: m.role, content: m.content }),
				);
				const res = await invoke("ai_chat_start", {
					request: {
						profile_id: activeProfileId,
						messages: messagesForRequest,
						context: payloadPreview || undefined,
						context_manifest: payloadManifest ?? undefined,
						audit: true,
					},
				});
				setJobId(res.job_id);
			} catch (e) {
				setStreaming(false);
				setChatError(errMessage(e));
				setChatMessages((prev) => prev.filter((m) => m.content !== ""));
			}
		},
		[
			activeProfileId,
			chatMessages,
			payloadApproved,
			payloadManifest,
			payloadPreview,
		],
	);

	const onSend = useCallback(async () => {
		if (!activeProfileId) {
			setChatError("No AI profile selected.");
			return;
		}
		if (!input.trim()) return;
		pendingActionRef.current = "chat";
		const next = input.trim();
		setInput("");
		await startRequest(next);
	}, [activeProfileId, input, startRequest]);

	const onCancel = useCallback(async () => {
		if (!jobId) return;
		try {
			await invoke("ai_chat_cancel", { job_id: jobId });
		} catch {
			// ignore
		}
	}, [jobId]);

	const clearChat = useCallback(() => {
		setChatMessages([]);
		setChatError("");
	}, []);

	return {
		chatMessages,
		setChatMessages,
		input,
		setInput,
		jobId,
		lastCompletedJobId,
		streaming,
		chatError,
		setChatError,
		lastAssistantMessage,
		streamingTextRef,
		pendingActionRef,
		startRequest,
		onSend,
		onCancel,
		clearChat,
	};
}
