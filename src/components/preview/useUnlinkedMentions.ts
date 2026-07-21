import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { type UnlinkedMention, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";

interface UseUnlinkedMentionsOptions {
	enabled: boolean;
	noteId: string;
	refreshKey: number;
	onLinked: () => void;
}

export function useUnlinkedMentions({
	enabled,
	noteId,
	refreshKey,
	onLinked,
}: UseUnlinkedMentionsOptions) {
	const queryClient = useQueryClient();
	const [linkedCount, setLinkedCount] = useState(0);
	const [skippedCount, setSkippedCount] = useState(0);
	const queryKey = ["unlinked-mentions", noteId, refreshKey] as const;
	const invalidateMentions = useCallback(() => {
		if (!enabled) return;
		void queryClient.invalidateQueries({ queryKey });
	}, [enabled, queryClient, queryKey]);
	useTauriEvent("notes:external_changed", invalidateMentions);
	useTauriEvent("space:fs_changed", invalidateMentions);
	const mentionsQuery = useQuery({
		queryKey,
		enabled: enabled && Boolean(noteId),
		staleTime: 0,
		queryFn: () => invoke("unlinked_mentions", { note_id: noteId }),
	});
	const linkMutation = useMutation({
		mutationFn: (mentions: UnlinkedMention[]) =>
			invoke("space_link_unlinked_mentions", {
				target_note_id: noteId,
				mentions,
			}),
		onMutate: () => {
			setLinkedCount(0);
			setSkippedCount(0);
		},
		onSuccess: (result) => {
			setLinkedCount(result.linked_count);
			setSkippedCount(result.skipped_count);
			invalidateMentions();
			if (result.linked_count > 0) onLinked(result);
		},
	});
	const linkMention = useCallback(
		(mention: UnlinkedMention) => linkMutation.mutate([mention]),
		[linkMutation],
	);
	const linkAll = useCallback(() => {
		const mentions = mentionsQuery.data?.mentions ?? [];
		if (mentions.length) linkMutation.mutate(mentions);
	}, [linkMutation, mentionsQuery.data?.mentions]);

	return {
		mentions: mentionsQuery.data?.mentions ?? [],
		isLoading: mentionsQuery.isLoading,
		error: mentionsQuery.error ?? linkMutation.error,
		isLinking: linkMutation.isPending,
		linkedCount,
		skippedCount,
		linkMention,
		linkAll,
	};
}
