import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { invoke } from "../../lib/tauri";
import type { SearchResult } from "../../lib/tauri";
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

	const trimmed = query.trim();
	const search = useQuery({
		queryKey: ["command-search", spacePath, trimmed, peopleMentionsEnabled],
		queryFn: async ({ signal }) => {
			// Avoid an IPC/SQLite search for each keystroke. Query cancellation cleans up the delay.
			await new Promise<void>((resolve, reject) => {
				signal.throwIfAborted();
				const abort = () => {
					clearTimeout(timer);
					reject(new DOMException("Search cancelled", "AbortError"));
				};
				const timer = setTimeout(() => {
					signal.removeEventListener("abort", abort);
					resolve();
				}, SEARCH_DEBOUNCE_MS);
				signal.addEventListener("abort", abort, { once: true });
			});
			signal.throwIfAborted();
			return invoke("search_parse_and_run", { raw_query: trimmed, limit: 1500 });
		},
		enabled: enabled && Boolean(spacePath && trimmed),
		retry: false,
		staleTime: 0,
	});
	const searchResults = search.data;

	const { titleMatches, contentMatches } = useMemo(() => {
		if (!enabled || !query.trim()) return { titleMatches: [], contentMatches: [] };
		const parsed = parseSearchQueryWithPeople(query.trim(), peopleMentionsEnabled);
		const q = parsed.text.toLowerCase();
		if (parsed.kind === "expression" || parsed.request.tag_only) {
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
		searchError: search.error,
		titleMatches,
		contentMatches,
	};
}
