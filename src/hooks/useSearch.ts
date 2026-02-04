import { useEffect, useState } from "react";
import type { SearchResult } from "../lib/tauri";
import { invoke } from "../lib/tauri";

export interface UseSearchResult {
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	searchResults: SearchResult[];
	isSearching: boolean;
	searchError: string;
	showSearch: boolean;
	setShowSearch: (show: boolean) => void;
}

export function useSearch(vaultPath: string | null): UseSearchResult {
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState("");
	const [showSearch, setShowSearch] = useState(false);

	useEffect(() => {
		if (!vaultPath) return;
		let cancelled = false;
		if (!searchQuery.trim()) {
			setSearchResults([]);
			setSearchError("");
			return;
		}
		setIsSearching(true);
		setSearchError("");
		const t = window.setTimeout(() => {
			(async () => {
				try {
					const res = await invoke("search", { query: searchQuery });
					if (!cancelled) setSearchResults(res);
				} catch (e) {
					if (!cancelled)
						setSearchError(e instanceof Error ? e.message : String(e));
				} finally {
					if (!cancelled) setIsSearching(false);
				}
			})();
		}, 180);
		return () => {
			cancelled = true;
			window.clearTimeout(t);
		};
	}, [searchQuery, vaultPath]);

	return {
		searchQuery,
		setSearchQuery,
		searchResults,
		isSearching,
		searchError,
		showSearch,
		setShowSearch,
	};
}
