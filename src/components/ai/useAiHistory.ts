import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { queryClient } from "../../lib/queryClient";
import {
	type AiChatHistoryDetail,
	type AiStoredToolEvent,
	invoke,
} from "../../lib/tauri";
import type { UIMessage } from "./hooks/useRigChat";

const aiHistoryQueryKeys = {
	all: ["ai", "history"] as const,
	summaries: (limit: number) =>
		[...aiHistoryQueryKeys.all, "summaries", limit] as const,
	detail: (jobId: string) =>
		[...aiHistoryQueryKeys.all, "detail", jobId] as const,
};

export function clearAiHistoryCache() {
	queryClient.removeQueries({ queryKey: aiHistoryQueryKeys.all });
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
			context: msg.context,
		});
	}
	return out;
}

interface LoadedAiChat {
	messages: UIMessage[];
	toolEvents: AiStoredToolEvent[];
}

const HISTORY_WRITE_RETRY = 30;
const HISTORY_WRITE_RETRY_MS = 500;

export function fetchAiHistoryDetail(
	jobId: string,
): Promise<AiChatHistoryDetail> {
	return queryClient.fetchQuery({
		queryKey: aiHistoryQueryKeys.detail(jobId),
		queryFn: () => invoke("ai_chat_history_get", { job_id: jobId }),
		gcTime: 0,
		staleTime: 0,
		retry: HISTORY_WRITE_RETRY,
		retryDelay: HISTORY_WRITE_RETRY_MS,
	});
}

export function useRestoredAiChat(jobId: string | null): LoadedAiChat | null {
	const query = useQuery({
		queryKey: aiHistoryQueryKeys.detail(jobId ?? ""),
		queryFn: () => invoke("ai_chat_history_get", { job_id: jobId ?? "" }),
		enabled: Boolean(jobId),
		gcTime: 0,
	});
	if (!jobId || !query.data) return null;
	return {
		messages: toUIMessages(jobId, query.data.messages),
		toolEvents: query.data.tool_events ?? [],
	};
}

interface UseAiHistoryOptions {
	enabled?: boolean;
}

export function useAiHistory(limit = 20, options?: UseAiHistoryOptions) {
	const enabled = options?.enabled ?? true;
	const localQueryClient = useQueryClient();
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

	const summariesQuery = useQuery({
		queryKey: aiHistoryQueryKeys.summaries(limit),
		queryFn: () => invoke("ai_chat_history_list", { limit }),
		enabled,
	});

	const loadChatMutation = useMutation({
		mutationFn: async (jobId: string): Promise<LoadedAiChat> => {
			const detail = await localQueryClient.fetchQuery({
				queryKey: aiHistoryQueryKeys.detail(jobId),
				queryFn: () => invoke("ai_chat_history_get", { job_id: jobId }),
				gcTime: 0,
				staleTime: 0,
			});
			return {
				messages: toUIMessages(jobId, detail.messages),
				toolEvents: detail.tool_events ?? [],
			};
		},
		onSuccess: (_data, jobId) => {
			setSelectedJobId(jobId);
		},
	});

	const refresh = useCallback(async () => {
		await localQueryClient.invalidateQueries({
			queryKey: aiHistoryQueryKeys.summaries(limit),
		});
	}, [limit, localQueryClient]);

	const loadChatMessages = useCallback(
		async (jobId: string) => {
			try {
				return await loadChatMutation.mutateAsync(jobId);
			} catch {
				return null;
			}
		},
		[loadChatMutation],
	);

	const summaries = summariesQuery.data ?? [];
	const error =
		(loadChatMutation.error && extractErrorMessage(loadChatMutation.error)) ||
		(summariesQuery.error && extractErrorMessage(summariesQuery.error)) ||
		"";

	return {
		summaries,
		selectedJobId,
		listLoading: summariesQuery.isLoading,
		loadingJobId: loadChatMutation.isPending
			? loadChatMutation.variables
			: null,
		error,
		refresh,
		loadChatMessages,
	};
}
