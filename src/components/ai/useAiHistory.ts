import { useCallback, useEffect, useState } from "react";
import {
	type AiChatHistoryDetail,
	type AiChatHistorySummary,
	type AiStoredToolEvent,
	TauriInvokeError,
	invoke,
} from "../../lib/tauri";
import type { UIMessage } from "./hooks/useRigChat";

function errMessage(err: unknown): string {
	if (err instanceof TauriInvokeError) return err.message;
	if (err instanceof Error) return err.message;
	return String(err);
}

function toUIMessages(
	jobId: string,
	messages: AiChatHistoryDetail["messages"],
): UIMessage[] {
	const out: UIMessage[] = [];
	for (let i = 0; i < messages.length; i += 1) {
		const msg = messages[i];
		if (!msg.content.trim()) continue;
		out.push({
			id: `${jobId}:${i}`,
			role: msg.role,
			parts: [{ type: "text", text: msg.content }],
		});
	}
	return out;
}

export interface LoadedAiChat {
	messages: UIMessage[];
	toolEvents: AiStoredToolEvent[];
}

export function useAiHistory(limit = 20) {
	const [summaries, setSummaries] = useState<AiChatHistorySummary[]>([]);
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
	const [listLoading, setListLoading] = useState(false);
	const [loadingJobId, setLoadingJobId] = useState<string | null>(null);
	const [error, setError] = useState("");

	const refresh = useCallback(async () => {
		setListLoading(true);
		setError("");
		try {
			const list = await invoke("ai_chat_history_list", { limit });
			setSummaries(list);
			setSelectedJobId((prev) =>
				prev && !list.some((item) => item.job_id === prev) ? null : prev,
			);
		} catch (err) {
			setError(errMessage(err));
		} finally {
			setListLoading(false);
		}
	}, [limit]);

	const loadChatMessages = useCallback(async (jobId: string) => {
		setLoadingJobId(jobId);
		setError("");
		try {
			const detail = await invoke("ai_chat_history_get", { job_id: jobId });
			setSelectedJobId(jobId);
			return {
				messages: toUIMessages(jobId, detail.messages),
				toolEvents: detail.tool_events ?? [],
			} satisfies LoadedAiChat;
		} catch (err) {
			setError(errMessage(err));
			return null;
		} finally {
			setLoadingJobId(null);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	return {
		summaries,
		selectedJobId,
		listLoading,
		loadingJobId,
		error,
		refresh,
		loadChatMessages,
	};
}
