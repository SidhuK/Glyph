import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRecentFiles } from "../../hooks/useRecentFiles";
import { loadSettings } from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import type { SearchResult } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { isMarkdownPath } from "../../utils/path";
import { type Tab, parseSearchQueryWithPeople } from "./commandPaletteHelpers";

export function useCommandSearch(
	open: boolean,
	activeTab: Tab,
	query: string,
	spacePath: string | null,
) {
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [peopleMentionsEnabled, setPeopleMentionsEnabled] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const requestIdRef = useRef(0);
	const { recentFiles, refreshRecentFiles } = useRecentFiles(spacePath, 8);
	const recentMarkdownFiles = useMemo(
		() => recentFiles.filter((file) => isMarkdownPath(file.path)),
		[recentFiles],
	);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setPeopleMentionsEnabled(settings.editor.enablePeopleMentionsAsTags);
			})
			.catch(() => {
				if (cancelled) return;
				setPeopleMentionsEnabled(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.editor?.enablePeopleMentionsAsTags === "boolean") {
			setPeopleMentionsEnabled(payload.editor.enablePeopleMentionsAsTags);
		}
	});

	useEffect(() => {
		if (!open || !spacePath) return;
		void refreshRecentFiles();
	}, [open, spacePath, refreshRecentFiles]);

	useEffect(() => {
		if (activeTab !== "search") return;
		if (!spacePath) {
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
	}, [query, activeTab, spacePath, peopleMentionsEnabled]);

	const { titleMatches, contentMatches } = useMemo(() => {
		if (activeTab !== "search" || !query.trim())
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
		for (const r of searchResults) {
			if (!q || r.title.toLowerCase().includes(q)) {
				title.push(r);
			} else {
				content.push(r);
			}
		}
		return { titleMatches: title, contentMatches: content };
	}, [searchResults, query, activeTab, peopleMentionsEnabled]);

	const reset = useCallback(() => {
		requestIdRef.current += 1;
		setSearchResults([]);
		setIsSearching(false);
	}, []);

	return {
		searchResults,
		recentFiles: recentMarkdownFiles,
		isSearching,
		titleMatches,
		contentMatches,
		reset,
	};
}
