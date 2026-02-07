import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { invoke } from "../tauri";
import { listenTauriEvent } from "../tauriEvents";

type TauriChatBody = {
	profile_id: string;
	context?: string;
	context_manifest?: unknown;
	audit?: boolean;
};

type TauriAiMessage = {
	role: "system" | "user" | "assistant";
	content: string;
};

function uiMessageToTauriMessage(message: UIMessage): TauriAiMessage | null {
	const content = message.parts
		.filter((p) => p.type === "text")
		.map((p) => p.text)
		.join("")
		.trim();

	if (!content) return null;
	return { role: message.role, content };
}

export class TauriChatTransport implements ChatTransport<UIMessage> {
	async sendMessages({
		messages,
		abortSignal,
		body,
	}: Parameters<ChatTransport<UIMessage>["sendMessages"]>[0]): Promise<
		ReadableStream<UIMessageChunk>
	> {
		const requestBody = (body ?? {}) as Partial<TauriChatBody>;
		const profileId = requestBody.profile_id?.trim() ?? "";
		if (!profileId) {
			throw new Error("No AI profile selected.");
		}

		const requestMessages = messages
			.map(uiMessageToTauriMessage)
			.filter((m): m is TauriAiMessage => m != null);

		const res = await invoke("ai_chat_start", {
			request: {
				profile_id: profileId,
				messages: requestMessages,
				context: requestBody.context || undefined,
				context_manifest: requestBody.context_manifest ?? undefined,
				audit: requestBody.audit ?? true,
			},
		});

		const jobId = res.job_id;
		const textPartId = crypto.randomUUID();

		const cleanupRef: { fn: (() => void) | null } = { fn: null };

		return new ReadableStream<UIMessageChunk>({
			start: async (controller) => {
				let startedText = false;
				let finished = false;

				const cleanupFns: Array<() => void> = [];
				const cleanup = () => {
					if (finished) return;
					finished = true;
					for (const fn of cleanupFns) fn();
					cleanupFns.length = 0;
				};
				cleanupRef.fn = cleanup;

				const maybeStartText = () => {
					if (startedText) return;
					startedText = true;
					controller.enqueue({ type: "text-start", id: textPartId });
				};

				const finishText = () => {
					if (startedText)
						controller.enqueue({ type: "text-end", id: textPartId });
				};

				if (abortSignal) {
					const onAbort = () => {
						void invoke("ai_chat_cancel", { job_id: jobId }).catch(() => {});
						try {
							finishText();
						} catch {
							// ignore
						}
						try {
							controller.close();
						} catch {
							// ignore
						}
						cleanup();
					};
					abortSignal.addEventListener("abort", onAbort, { once: true });
					cleanupFns.push(() =>
						abortSignal.removeEventListener("abort", onAbort),
					);
				}

				const unlistenChunk = await listenTauriEvent("ai:chunk", (payload) => {
					if (payload.job_id !== jobId) return;
					maybeStartText();
					controller.enqueue({
						type: "text-delta",
						id: textPartId,
						delta: payload.delta,
					});
				});
				cleanupFns.push(unlistenChunk);

				const unlistenDone = await listenTauriEvent("ai:done", (payload) => {
					if (payload.job_id !== jobId) return;
					try {
						finishText();
						controller.close();
					} catch {
						// ignore
					}
					cleanup();
				});
				cleanupFns.push(unlistenDone);

				const unlistenError = await listenTauriEvent("ai:error", (payload) => {
					if (payload.job_id !== jobId) return;
					try {
						controller.enqueue({
							type: "error",
							errorText: payload.message,
						});
						controller.close();
					} catch {
						// ignore
					}
					cleanup();
				});
				cleanupFns.push(unlistenError);
			},
			cancel: async () => {
				void invoke("ai_chat_cancel", { job_id: jobId }).catch(() => {});
				cleanupRef.fn?.();
			},
		});
	}

	async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
		return null;
	}
}
