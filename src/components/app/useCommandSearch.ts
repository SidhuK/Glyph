import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SearchResult } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { type Tab, parseSearchQuery } from "./commandPaletteHelpers";

export function useCommandSearch(
	open: boolean,
	activeTab: Tab,
	query: string,
	vaultPath: string | null,
) {
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [recentNotes, setRecentNotes] = useState<SearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!open || !vaultPath) return;
		invoke("recent_notes", { limit: 8 })
			.then(setRecentNotes)
			.catch(() => setRecentNotes([]));
	}, [open, vaultPath]);

	useEffect(() => {
		if (activeTab !== "search") return;
		if (!vaultPath) {
			setSearchResults([]);
			setIsSearching(false);
			return;
		}
		if (debounceRef.current) clearTimeout(debounceRef.current);
		const trimmed = query.trim();
		if (!trimmed) {
			setSearchResults([]);
			setIsSearching(false);
			return;
		}
		setIsSearching(true);
		debounceRef.current = setTimeout(() => {
			const parsed = parseSearchQuery(trimmed);
			invoke("search_parse_and_run", {
				raw_query: trimmed,
				limit: 1500,
			})
				.then((results) => {
					setSearchResults(results);
				})
				.catch(() =>
					invoke("search_advanced", {
						request: {
							...parsed.request,
							limit: 1500,
						},
					})
						.then((results) => {
							setSearchResults(results);
						})
						.catch(() => {
							setSearchResults([]);
						}),
				)
				.finally(() => {
					setIsSearching(false);
				})
				.catch(() => {
					setIsSearching(false);
				});
		}, 200);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [query, activeTab, vaultPath]);

	const { titleMatches, contentMatches } = useMemo(() => {
		if (activeTab !== "search" || !query.trim())
			return { titleMatches: [], contentMatches: [] };
		const parsed = parseSearchQuery(query.trim());
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
	}, [searchResults, query, activeTab]);

	const reset = useCallback(() => {
		setSearchResults([]);
		setRecentNotes([]);
		setIsSearching(false);
	}, []);

	return {
		searchResults,
		recentNotes,
		isSearching,
		titleMatches,
		contentMatches,
		reset,
	};
}
