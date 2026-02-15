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
		if (debounceRef.current) clearTimeout(debounceRef.current);
		const trimmed = query.trim();
		if (!trimmed) {
			setSearchResults([]);
			setIsSearching(false);
			return;
		}
		setIsSearching(true);
		const parsed = parseSearchQuery(trimmed);
		debounceRef.current = setTimeout(() => {
			(parsed.tags.length > 0
				? invoke("search_with_tags", {
						tags: parsed.tags,
						query: parsed.text || null,
					})
				: invoke("search", { query: trimmed })
			)
				.then((results) => {
					setSearchResults(results);
				})
				.catch(() => {
					setSearchResults([]);
				})
				.finally(() => {
					setIsSearching(false);
				});
		}, 200);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [query, activeTab]);

	const { titleMatches, contentMatches } = useMemo(() => {
		if (activeTab !== "search" || !query.trim())
			return { titleMatches: [], contentMatches: [] };
		const q = query.trim().toLowerCase();
		const title: SearchResult[] = [];
		const content: SearchResult[] = [];
		for (const r of searchResults) {
			if (r.title.toLowerCase().includes(q)) {
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
