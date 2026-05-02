import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
	type RecentFile,
	addRecentFile as addRecentFileToStore,
	getRecentFiles as getRecentFilesFromStore,
} from "../lib/settings";

interface UseRecentFilesReturn {
	recentFiles: RecentFile[];
	addRecentFile: (path: string, spacePath: string) => Promise<void>;
	refreshRecentFiles: () => Promise<void>;
}

export function useRecentFiles(
	currentSpacePath: string | null,
	limit = 7,
): UseRecentFilesReturn {
	const queryClient = useQueryClient();
	const queryKey = [
		"settings",
		"recent-files",
		currentSpacePath ?? "__all__",
		limit,
	] as const;
	const recentFilesQuery = useQuery({
		queryKey,
		queryFn: async () => {
			const all = await getRecentFilesFromStore();
			return currentSpacePath
				? all.filter((f) => f.spacePath === currentSpacePath).slice(0, limit)
				: all.slice(0, limit);
		},
	});
	const addRecentFileMutation = useMutation({
		mutationFn: ({ path, spacePath }: { path: string; spacePath: string }) =>
			addRecentFileToStore(path, spacePath),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["settings", "recent-files"],
			});
		},
	});

	const refreshRecentFiles = useCallback(async () => {
		await recentFilesQuery.refetch();
	}, [recentFilesQuery]);

	const addRecentFile = useCallback(
		async (path: string, spacePath: string) => {
			await addRecentFileMutation.mutateAsync({ path, spacePath });
		},
		[addRecentFileMutation],
	);

	return {
		recentFiles: recentFilesQuery.data ?? [],
		addRecentFile,
		refreshRecentFiles,
	};
}
