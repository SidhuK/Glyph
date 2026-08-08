import { useEffect, useMemo, useRef, useState } from "react";
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
) {
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const requestIdRef = useRef(0);
	const { recentFiles } = useRecentFiles(spacePath, 8);
	const recentPreviewableFiles = useMemo(
		() => recentFiles.filter((file) => isPreviewableNotePath(file.path)),
		[recentFiles],
	);

	useEffect(() => {
		if (!enabled || !spacePath) {
			requestIdRef.current += 1;
			setSearchResults([]);
			setIsSearching(false);
			return;
		}
		if (debounceRef.current) clearTimeout(debounceRef.current);
		const trimmed = query.trim();
		if (!trimmed) {
			requestIdRef.current += 1;
			setSearchResults([]);
			setIsSearching(false);
			return;
		}
		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		setIsSearching(true);
		debounceRef.current = setTimeout(() => {
			void (async () => {
				try {
					const parsed = parseSearchQueryWithPeople(
						trimmed,
						peopleMentionsEnabled,
					);
					let results: SearchResult[];
					try {
						if (peopleMentionsEnabled) {
							results = await invoke("search_parse_and_run", {
								raw_query: trimmed,
								limit: 1500,
							});
						} else {
							throw new Error("people mentions disabled");
						}
					} catch {
						results = await invoke("search_advanced", {
							request: {
								...parsed.request,
								limit: 1500,
							},
						});
					}
					if (requestIdRef.current !== requestId) return;
					setSearchResults(results);
				} catch (error) {
					if (requestIdRef.current !== requestId) return;
					console.error("Command palette search failed", error);
					setSearchResults([]);
				} finally {
					if (requestIdRef.current === requestId) {
						setIsSearching(false);
					}
				}
			})();
		}, 200);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [query, enabled, spacePath, peopleMentionsEnabled]);

	const { titleMatches, contentMatches } = useMemo(() => {
		if (!enabled || !query.trim())
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
	}, [searchResults, query, enabled, peopleMentionsEnabled]);

	return {
		recentFiles: recentPreviewableFiles,
		isSearching,
		titleMatches,
		contentMatches,
	};
}
