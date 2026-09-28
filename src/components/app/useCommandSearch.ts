import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo } from "react";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { invoke, type SearchResult } from "../../lib/tauri";
import { isPreviewableNotePath } from "../../utils/path";
import { parseSearchQueryWithPeople } from "./commandPaletteHelpers";

export function useCommandSearch(
	query: string,
	spacePath: string | null,
	enabled: boolean,
	peopleMentionsEnabled: boolean,
) {
	const deferredQuery = useDeferredValue(query);
	const { recentFiles } = useRecentFiles(spacePath, 8);
	const recentPreviewableFiles = useMemo(
		() => recentFiles.filter((file) => isPreviewableNotePath(file.path)),
		[recentFiles],
	);
	const search = useQuery({
		queryKey: [
			"navigation",
			"search",
			spacePath,
			deferredQuery.trim(),
			peopleMentionsEnabled,
			true,
		],
		enabled: enabled && Boolean(spacePath) && Boolean(deferredQuery.trim()),
		queryFn: () =>
			peopleMentionsEnabled
				? invoke("search_parse_and_run", {
						raw_query: deferredQuery.trim(),
						limit: 1500,
						include_archived: true,
					})
				: invoke("search_advanced", {
						request: {
							...parseSearchQueryWithPeople(deferredQuery.trim(), false).request,
							limit: 1500,
							include_archived: true,
						},
					}),
	});
	const searchResults = search.data;
	const { titleMatches, contentMatches } = useMemo(() => {
		if (!enabled || !query.trim() || query !== deferredQuery)
			return { titleMatches: [], contentMatches: [] };
		const parsed = parseSearchQueryWithPeople(query.trim(), peopleMentionsEnabled);
		const q = parsed.text.toLowerCase();
		if (parsed.request.tag_only) {
			return { titleMatches: searchResults ?? [], contentMatches: [] };
		}
		const title: SearchResult[] = [];
		const content: SearchResult[] = [];
		const titleSeen = new Set<string>();
		for (const r of searchResults ?? []) {
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
	}, [searchResults, query, deferredQuery, enabled, peopleMentionsEnabled]);

	return {
		recentFiles: recentPreviewableFiles,
		isSearching: search.isFetching || query !== deferredQuery,
		searchError: search.error,
		titleMatches,
		contentMatches,
	};
}
