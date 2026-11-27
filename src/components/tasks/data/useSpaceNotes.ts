import { skipToken, useQuery } from "@tanstack/react-query";
import { useSpace } from "@/contexts";
import { navigationQueryKeys } from "@/lib/navigationPrefetch";
import { invoke } from "@/lib/tauri";

const SPACE_LIST_STALE_TIME_MS = 60_000;
const SPACE_LIST_LIMIT = 5000;

export function useSpaceNotes(enabled: boolean) {
	const { spacePath } = useSpace();
	return useQuery({
		queryKey: [...navigationQueryKeys.all, "task-notes", spacePath],
		queryFn:
			spacePath && enabled
				? async () => {
						const entries = await invoke("space_list_markdown_files", {
							recursive: true,
							limit: SPACE_LIST_LIMIT,
						});
						return entries.map((entry) => entry.rel_path).sort((a, b) => a.localeCompare(b));
					}
				: skipToken,
		staleTime: SPACE_LIST_STALE_TIME_MS,
	});
}

export function useSpaceFolders() {
	const { spacePath } = useSpace();
	return useQuery({
		queryKey: [...navigationQueryKeys.all, "task-folders", spacePath],
		queryFn: spacePath
			? async () => {
					const entries = await invoke("space_list_dir", {
						recursive: true,
						directories_only: true,
						limit: SPACE_LIST_LIMIT,
					});
					return entries.map((entry) => entry.rel_path).sort((a, b) => a.localeCompare(b));
				}
			: skipToken,
		staleTime: SPACE_LIST_STALE_TIME_MS,
	});
}
