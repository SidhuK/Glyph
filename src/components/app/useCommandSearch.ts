import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo } from "react";
import { pathInWorkspace } from "../../hooks/useFolderWorkspace";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { invoke } from "../../lib/tauri";
import type { SearchResult } from "../../lib/tauri";
import { isPreviewableNotePath } from "../../utils/path";
import { parseSearchQueryWithPeople } from "./commandPaletteHelpers";

export function useCommandSearch(
	query: string,
	spacePath: string | null,
	enabled: boolean,
	peopleMentionsEnabled: boolean,
	folderPrefix: string | null = null,
) {
	const deferredQuery = useDeferredValue(query.trim());
	const { recentFiles } = useRecentFiles(spacePath, 100);
	const recentPreviewableFiles = useMemo(
		() =>
			recentFiles
				.filter(
					(file) =>
						isPreviewableNotePath(file.path) &&
						pathInWorkspace(file.path, folderPrefix),
				)
				.slice(0, 8),
		[recentFiles, folderPrefix],
	);
	const search = useQuery({
		queryKey: [
			"command-search",
			spacePath,
			folderPrefix,
			deferredQuery,
			peopleMentionsEnabled,
		],
		enabled:
			enabled && Boolean(spacePath) && Boolean(deferredQuery || folderPrefix),
		queryFn: async () => {
			if (peopleMentionsEnabled)
				return invoke("search_parse_and_run", {
					raw_query: deferredQuery,
					limit: 1500,
					folder_prefix: folderPrefix,
				});
			const parsed = parseSearchQueryWithPeople(deferredQuery, false);
			return invoke("search_advanced", {
				request: {
					...parsed.request,
					limit: 1500,
					folder_prefix: folderPrefix,
				},
			});
		},
	});
	const searchResults = search.data ?? [];
	const isSearching = search.isFetching || deferredQuery !== query.trim();

	const { titleMatches, contentMatches } = useMemo(() => {
		if (!enabled || (!query.trim() && !folderPrefix))
			return { titleMatches: [], contentMatches: [] };
		const parsed = parseSearchQueryWithPeople(
			query.trim(),
			peopleMentionsEnabled,
		);
		const q = parsed.text.toLowerCase();
		if (parsed.request.tag_only) {
			return { titleMatches: searchResults, contentMatches: [] };
		}
		const title: SearchResult[] = [];
		const content: SearchResult[] = [];
		const titleSeen = new Set<string>();
		for (const r of searchResults) {
			// Body occurrence rows always list under content (multi-match jump list).
			if (typeof r.match_index === "number") {
				content.push(r);
				continue;
			}
			if (!q || r.title.toLowerCase().includes(q)) {
				if (!titleSeen.has(r.id)) {
					titleSeen.add(r.id);
					title.push(r);
				}
			} else {
				content.push(r);
			}
		}
		return { titleMatches: title, contentMatches: content };
	}, [searchResults, query, enabled, peopleMentionsEnabled, folderPrefix]);

	return {
		recentFiles: recentPreviewableFiles,
		isSearching,
		error: search.error,
		titleMatches,
		contentMatches,
	};
}
