import { useEffect, useRef, useState } from "react";
import { trackSearchExecuted } from "../lib/analytics";
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

export function useSearch(spacePath: string | null): UseSearchResult {
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState("");
	const [showSearch, setShowSearch] = useState(false);
	const requestIdRef = useRef(0);

	useEffect(() => {
		if (!spacePath) return;
		let cancelled = false;
		if (!searchQuery.trim()) {
			setSearchResults([]);
			setSearchError("");
			setIsSearching(false);
			return;
		}
		setIsSearching(true);
		setSearchError("");
		const requestId = ++requestIdRef.current;
		const t = window.setTimeout(() => {
			(async () => {
				try {
					const res = await invoke("search", { query: searchQuery });
					if (!cancelled && requestId === requestIdRef.current) {
						setSearchResults(res);
						void trackSearchExecuted({
							query: searchQuery,
							resultCount: res.length,
						});
					}
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
	}, [searchQuery, spacePath]);

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
