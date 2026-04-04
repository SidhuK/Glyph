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
let aiHistoryGeneration = 0;

export function clearAiHistoryCache() {
	aiHistoryGeneration += 1;
	aiHistorySummaryCache.clear();
	aiHistorySummaryPromiseCache.clear();
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

export async function preloadAiHistorySummaries(
	limit = 20,
): Promise<AiChatHistorySummary[]> {
	const cached = aiHistorySummaryCache.get(limit);
	if (cached) return cached;
	const inFlight = aiHistorySummaryPromiseCache.get(limit);
	if (inFlight) return inFlight;
	const generation = aiHistoryGeneration;
	const request = invoke("ai_chat_history_list", { limit })
		.then((list) => {
			if (generation === aiHistoryGeneration) {
				aiHistorySummaryCache.set(limit, list);
			}
			return list;
		})
		.finally(() => {
			if (generation === aiHistoryGeneration) {
				aiHistorySummaryPromiseCache.delete(limit);
			}
		});
	if (generation === aiHistoryGeneration) {
		aiHistorySummaryPromiseCache.set(limit, request);
	}
	return request;
}

interface UseAiHistoryOptions {
	enabled?: boolean;
}

export function useAiHistory(limit = 20, options?: UseAiHistoryOptions) {
	const enabled = options?.enabled ?? true;
	const [summaries, setSummaries] = useState<AiChatHistorySummary[]>(
		() => aiHistorySummaryCache.get(limit) ?? [],
	);
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
	const [listLoading, setListLoading] = useState(false);
	const [loadingJobId, setLoadingJobId] = useState<string | null>(null);
	const [error, setError] = useState("");

	const refresh = useCallback(async () => {
		const generation = aiHistoryGeneration;
		setListLoading(true);
		setError("");
		try {
			aiHistorySummaryCache.delete(limit);
			const list = await preloadAiHistorySummaries(limit);
			if (generation !== aiHistoryGeneration) return;
			setSummaries(list);
			setSelectedJobId((prev) =>
				prev && !list.some((item) => item.job_id === prev) ? null : prev,
			);
		} catch (err) {
			if (generation === aiHistoryGeneration) {
				setError(extractErrorMessage(err));
			}
		} finally {
			if (generation === aiHistoryGeneration) {
				setListLoading(false);
			}
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
		if (!enabled) return;
		void refresh();
	}, [enabled, refresh]);

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
