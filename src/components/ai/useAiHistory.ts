import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { queryClient } from "../../lib/queryClient";
import {
	type AiChatHistoryDetail,
	type AiChatHistorySummary,
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
		});
	}
	return out;
}

interface LoadedAiChat {
	messages: UIMessage[];
	toolEvents: AiStoredToolEvent[];
}

export function preloadAiHistorySummaries(
	limit = 20,
): Promise<AiChatHistorySummary[]> {
	return queryClient.fetchQuery({
		queryKey: aiHistoryQueryKeys.summaries(limit),
		queryFn: () => invoke("ai_chat_history_list", { limit }),
	});
}

interface UseAiHistoryOptions {
	enabled?: boolean;
}

export function useAiHistory(limit = 20, options?: UseAiHistoryOptions) {
	const enabled = options?.enabled ?? true;
	const localQueryClient = useQueryClient();
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
	const [loadError, setLoadError] = useState("");

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
			});
			return {
				messages: toUIMessages(jobId, detail.messages),
				toolEvents: detail.tool_events ?? [],
			};
		},
		onMutate: () => {
			setLoadError("");
		},
		onSuccess: (_data, jobId) => {
			setSelectedJobId(jobId);
		},
		onError: (error) => {
			setLoadError(extractErrorMessage(error));
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
		loadError ||
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
