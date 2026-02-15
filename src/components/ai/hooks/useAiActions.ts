import { useCallback, useState } from "react";
import { invoke } from "../../../lib/tauri";
import { messageText } from "../aiPanelConstants";
import type { UIMessage } from "./useRigChat";

type Chat = ReturnType<typeof import("./useRigChat").useRigChat>;

export function useAiActions(chat: Chat) {
	const [assistantActionError, setAssistantActionError] = useState("");

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

	const createRetryHandler = useCallback(
		(
			sendWithCurrentContext: (text: string) => Promise<boolean>,
			payloadError: string,
		) =>
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
					setAssistantActionError(
						"No matching user prompt found for retry.",
					);
					return;
				}
				const userText = messageText(
					chat.messages[userIndex] as UIMessage,
				).trim();
				if (!userText) {
					setAssistantActionError(
						"No matching user prompt found for retry.",
					);
					return;
				}
				chat.setMessages(chat.messages.slice(0, userIndex));
				const ok = await sendWithCurrentContext(userText);
				if (!ok) {
					setAssistantActionError(
						payloadError || "Retry failed due to missing AI context.",
					);
				}
			},
		[chat],
	);

	return {
		assistantActionError,
		setAssistantActionError,
		handleCopyAssistantResponse,
		handleSaveAssistantResponse,
		createRetryHandler,
	};
}
