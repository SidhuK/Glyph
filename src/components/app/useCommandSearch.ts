import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { invoke, type SearchResult } from "../../lib/tauri";
import { isPreviewableNotePath } from "../../utils/path";
import { parseSearchQueryWithPeople } from "./commandPaletteHelpers";

const SEARCH_DEBOUNCE_MS = 200;

export function useCommandSearch(
	query: string,
	spacePath: string | null,
	enabled: boolean,
	peopleMentionsEnabled: boolean,
) {
	const { recentFiles } = useRecentFiles(spacePath, 8);
	const recentPreviewableFiles = useMemo(
		() => recentFiles.filter((file) => isPreviewableNotePath(file.path)),
		[recentFiles],
	);
	const search = useQuery({
		queryKey: ["navigation", "search", spacePath, query.trim(), peopleMentionsEnabled, true],
		enabled: enabled && Boolean(spacePath) && Boolean(query.trim()),
		retry: false,
		queryFn: async ({ signal }) => {
			// Cancel the delay when the query changes, before starting native database work.
			await new Promise<void>((resolve, reject) => {
				const abort = () => {
					clearTimeout(timer);
					reject(new DOMException("Aborted", "AbortError"));
				};
				const timer = setTimeout(() => {
					signal.removeEventListener("abort", abort);
					resolve();
				}, SEARCH_DEBOUNCE_MS);
				if (signal.aborted) abort();
				else signal.addEventListener("abort", abort, { once: true });
			});
			return peopleMentionsEnabled
				? invoke("search_parse_and_run", {
						raw_query: query.trim(),
						limit: 1500,
						include_archived: true,
					})
				: invoke("search_advanced", {
						request: {
							...parseSearchQueryWithPeople(query.trim(), false).request,
							limit: 1500,
							include_archived: true,
						},
					});
		},
	});
	const searchResults = search.data;
	const { titleMatches, contentMatches } = useMemo(() => {
		if (!enabled || !query.trim()) return { titleMatches: [], contentMatches: [] };
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
	}, [searchResults, query, enabled, peopleMentionsEnabled]);

	return {
		recentFiles: recentPreviewableFiles,
		isSearching: search.isFetching,
		searchError: enabled && spacePath && query.trim() ? search.error : null,
		titleMatches,
		contentMatches,
	};
}
