import { Fragment } from "react";
import type { ReactNode } from "react";
import type { SearchResult } from "../../lib/tauri";

function renderSnippet(snippet: string): ReactNode[] {
	const parts = snippet.split(/([⟦⟧])/);
	const out: ReactNode[] = [];
	let inMark = false;
	for (let i = 0; i < parts.length; i++) {
		const p = parts[i];
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
			<Fragment key={`${i}-${p.slice(0, 8)}`}>
				{inMark ? <mark>{p}</mark> : p}
			</Fragment>,
		);
	}
	return out;
}

interface SearchResultItemProps {
	result: SearchResult;
	isSelected: boolean;
	onMouseEnter: () => void;
	onSelect: () => void;
}

export function SearchResultItem({
	result,
	isSelected,
	onMouseEnter,
	onSelect,
}: SearchResultItemProps) {
	return (
		<div
			className="commandPaletteItem commandPaletteResultItem"
			data-selected={isSelected}
			onMouseEnter={onMouseEnter}
			onMouseDown={(e) => {
				e.preventDefault();
				onSelect();
			}}
		>
			<div className="commandPaletteResultContent">
				<div className="commandPaletteResultTitle">
					{result.title || "Untitled"}
				</div>
				<div className="commandPaletteResultSnippet mono">{result.id}</div>
				<div className="commandPaletteResultSnippet">
					{renderSnippet(result.snippet)}
				</div>
			</div>
		</div>
	);
}

interface SearchResultsListProps {
	query: string;
	isSearching: boolean;
	titleMatches: SearchResult[];
	contentMatches: SearchResult[];
	recentNotes: SearchResult[];
	selectedIndex: number;
	onSetSelectedIndex: (index: number) => void;
	onSelectResult: (index: number) => void;
}

export function SearchResultsList({
	query,
	isSearching,
	titleMatches,
	contentMatches,
	recentNotes,
	selectedIndex,
	onSetSelectedIndex,
	onSelectResult,
}: SearchResultsListProps) {
	const trimmed = query.trim();

	if (!trimmed) {
		if (recentNotes.length > 0) {
			return (
				<>
					<div className="commandPaletteGroupLabel">Recent</div>
					{recentNotes.map((r, index) => (
						<div
							key={r.id}
							className="commandPaletteItem"
							data-selected={index === selectedIndex}
							onMouseEnter={() => onSetSelectedIndex(index)}
							onMouseDown={(e) => {
								e.preventDefault();
								onSelectResult(index);
							}}
						>
							<span>{r.title || "Untitled"}</span>
						</div>
					))}
				</>
			);
		}
		return (
			<div className="commandPaletteEmpty">Type to search your notes…</div>
		);
	}

	return (
		<>
			{titleMatches.length > 0 && (
				<>
					<div className="commandPaletteGroupLabel">
						{trimmed.startsWith("#") ? "Tagged Notes" : "Notes"}
					</div>
					{titleMatches.map((r, index) => (
						<SearchResultItem
							key={r.id}
							result={r}
							isSelected={index === selectedIndex}
							onMouseEnter={() => onSetSelectedIndex(index)}
							onSelect={() => onSelectResult(index)}
						/>
					))}
				</>
			)}
			{contentMatches.length > 0 && (
				<>
					<div className="commandPaletteGroupLabel">Content</div>
					{contentMatches.map((r, index) => {
						const globalIndex = titleMatches.length + index;
						return (
							<SearchResultItem
								key={r.id}
								result={r}
								isSelected={globalIndex === selectedIndex}
								onMouseEnter={() => onSetSelectedIndex(globalIndex)}
								onSelect={() => onSelectResult(globalIndex)}
							/>
						);
					})}
				</>
			)}
			{titleMatches.length === 0 &&
				contentMatches.length === 0 &&
				!isSearching && (
					<div className="commandPaletteEmpty">No results</div>
				)}
			{isSearching &&
				titleMatches.length === 0 &&
				contentMatches.length === 0 && (
					<div className="commandPaletteEmpty">Searching…</div>
				)}
		</>
	);
}
