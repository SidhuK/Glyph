import { useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "../lib/errorUtils";
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
	const requestIdRef = useRef(0);

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
		const requestId = ++requestIdRef.current;
		const t = window.setTimeout(() => {
			(async () => {
				try {
					const res = await invoke("search", { query: searchQuery });
					if (!cancelled && requestId === requestIdRef.current)
						setSearchResults(res);
				} catch (e) {
					if (!cancelled && requestId === requestIdRef.current)
						setSearchError(extractErrorMessage(e));
				} finally {
					if (!cancelled && requestId === requestIdRef.current)
						setIsSearching(false);
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
