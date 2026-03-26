import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type AiChatHistoryDetail,
	type AiChatHistorySummary,
	type AiStoredToolEvent,
	invoke,
} from "../../lib/tauri";
import type { UIMessage } from "./hooks/useRigChat";

const aiHistorySummaryCache = new Map<number, AiChatHistorySummary[]>();
const aiHistorySummaryPromiseCache = new Map<
	number,
	Promise<AiChatHistorySummary[]>
>();

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

export async function preloadAiHistorySummaries(
	limit = 20,
): Promise<AiChatHistorySummary[]> {
	const cached = aiHistorySummaryCache.get(limit);
	if (cached) return cached;
	const inFlight = aiHistorySummaryPromiseCache.get(limit);
	if (inFlight) return inFlight;
	const request = invoke("ai_chat_history_list", { limit })
		.then((list) => {
			aiHistorySummaryCache.set(limit, list);
			return list;
		})
		.finally(() => {
			aiHistorySummaryPromiseCache.delete(limit);
		});
	aiHistorySummaryPromiseCache.set(limit, request);
	return request;
}

export function useAiHistory(limit = 20) {
	const [summaries, setSummaries] = useState<AiChatHistorySummary[]>(
		() => aiHistorySummaryCache.get(limit) ?? [],
	);
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
	const [listLoading, setListLoading] = useState(false);
	const [loadingJobId, setLoadingJobId] = useState<string | null>(null);
	const [error, setError] = useState("");

	const refresh = useCallback(async () => {
		setListLoading(true);
		setError("");
		try {
			aiHistorySummaryCache.delete(limit);
			const list = await preloadAiHistorySummaries(limit);
			setSummaries(list);
			setSelectedJobId((prev) =>
				prev && !list.some((item) => item.job_id === prev) ? null : prev,
			);
		} catch (err) {
			setError(extractErrorMessage(err));
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
			setError(extractErrorMessage(err));
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
