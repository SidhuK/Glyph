import { Fragment, memo, useCallback } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type { SearchResult } from "../lib/tauri";

interface SearchPaneProps {
	query: string;
	results: SearchResult[];
	isSearching: boolean;
	error: string;
	onChangeQuery: (next: string) => void;
	onSelectNote: (id: string) => void;
}

export const SearchPane = memo(function SearchPane({
	query,
	results,
	isSearching,
	error,
	onChangeQuery,
	onSelectNote,
}: SearchPaneProps) {
	const onChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => onChangeQuery(e.target.value),
		[onChangeQuery],
	);

	const showResults = query.trim().length > 0;

	const renderSnippet = useCallback((snippet: string) => {
		// Backend uses `⟦` and `⟧` markers around matches.
		const parts = snippet.split(/([⟦⟧])/);
		const out: ReactNode[] = [];
		let inMark = false;
		let key = 0;
		for (const p of parts) {
			if (!p) continue;
			if (p === "⟦") {
				inMark = true;
				continue;
			}
			if (p === "⟧") {
				inMark = false;
				continue;
			}
			out.push(
				<Fragment key={key++}>{inMark ? <mark>{p}</mark> : p}</Fragment>,
			);
		}
		return out;
	}, []);

	return (
		<section className="searchPane">
			<div className="searchHeader">
				<div className="searchTitle">Search</div>
				{isSearching ? <div className="searchStatus">Searching…</div> : null}
			</div>
			<div className="searchBody">
				<input
					value={query}
					onChange={onChange}
					placeholder="Search notes…"
					className="searchInput"
					autoCorrect="off"
					autoCapitalize="off"
					spellCheck={false}
				/>
			</div>

			{error ? <div className="searchError">{error}</div> : null}

			{showResults ? (
				<ul className="searchResults">
					{!results.length && !isSearching ? (
						<li className="searchEmpty">No results</li>
					) : null}
					{results.map((r) => (
						<li key={r.id} className="searchResult">
							<button
								type="button"
								className="searchResultButton"
								onClick={() => onSelectNote(r.id)}
							>
								<div className="searchResultTitle">{r.title || "Untitled"}</div>
								<div className="searchResultSnippet">
									{renderSnippet(r.snippet)}
								</div>
							</button>
						</li>
					))}
				</ul>
			) : null}
		</section>
	);
});
