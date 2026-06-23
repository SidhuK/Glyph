import { Fragment } from "react";
import type { ReactNode } from "react";
import type { RecentFile } from "../../lib/settings";
import type { SearchResult } from "../../lib/tauri";
import { displayFolderFromPath, displayNameFromPath } from "../../utils/path";
import { FileText } from "../Icons";

function HighlightedSnippet({ snippet }: { snippet: string }) {
	const parts = snippet.split(/([⟦⟧])/);
	const out: ReactNode[] = [];
	let inMark = false;
	let cursor = 0;
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
		const key = `${cursor}:${p.slice(0, 8)}`;
		out.push(<Fragment key={key}>{inMark ? <mark>{p}</mark> : p}</Fragment>);
		cursor += p.length;
	}
	return <>{out}</>;
}

interface SearchRowProps {
	title: string;
	path: string;
	snippet?: string;
	index: number;
	isSelected: boolean;
	onMouseEnter: () => void;
	onSelect: () => void;
}

function SearchRow({
	title,
	path,
	snippet,
	index,
	isSelected,
	onMouseEnter,
	onSelect,
}: SearchRowProps) {
	const hasSnippet = Boolean(snippet?.trim());

	return (
		<button
			type="button"
			className="commandPaletteItem commandPaletteSearchRow"
			data-search-index={index}
			data-selected={isSelected}
			data-has-snippet={hasSnippet ? "true" : "false"}
			onMouseEnter={onMouseEnter}
			onMouseDown={(e) => {
				e.preventDefault();
				onSelect();
			}}
		>
			<span className="commandPaletteSearchRowIcon" aria-hidden="true">
				<FileText size="var(--icon-md)" />
			</span>
			<span className="commandPaletteSearchRowContent">
				<span className="commandPaletteResultLine">
					<span className="commandPaletteResultTitle">{title}</span>
					{path ? (
						<>
							<span className="commandPaletteResultLineSep" aria-hidden="true">
								—
							</span>
							<span className="commandPaletteResultPath" title={path}>
								{path}
							</span>
						</>
					) : null}
				</span>
				{hasSnippet ? (
					<span className="commandPaletteResultSnippet">
						<HighlightedSnippet snippet={snippet ?? ""} />
					</span>
				) : null}
			</span>
		</button>
	);
}

interface SearchResultItemProps {
	result: SearchResult;
	index: number;
	isSelected: boolean;
	showSnippet?: boolean;
	onMouseEnter: () => void;
	onSelect: () => void;
}

function SearchResultItem({
	result,
	index,
	isSelected,
	showSnippet = true,
	onMouseEnter,
	onSelect,
}: SearchResultItemProps) {
	return (
		<SearchRow
			title={result.title || displayNameFromPath(result.id)}
			path={displayFolderFromPath(result.id)}
			snippet={showSnippet ? result.snippet : undefined}
			index={index}
			isSelected={isSelected}
			onMouseEnter={onMouseEnter}
			onSelect={onSelect}
		/>
	);
}

interface SearchResultsListProps {
	query: string;
	isSearching: boolean;
	titleMatches: SearchResult[];
	contentMatches: SearchResult[];
	recentFiles: RecentFile[];
	selectedIndex: number;
	onSetSelectedIndex: (index: number) => void;
	onSelectResult: (index: number) => void;
}

export function SearchResultsList({
	query,
	isSearching,
	titleMatches,
	contentMatches,
	recentFiles,
	selectedIndex,
	onSetSelectedIndex,
	onSelectResult,
}: SearchResultsListProps) {
	const trimmed = query.trim();

	if (!trimmed) {
		if (recentFiles.length > 0) {
			return (
				<>
					<div className="commandPaletteGroupLabel">Recently opened</div>
					{recentFiles.map((file, index) => (
						<SearchRow
							key={`${file.spacePath}:${file.path}`}
							title={displayNameFromPath(file.path)}
							path={displayFolderFromPath(file.path)}
							index={index}
							isSelected={index === selectedIndex}
							onMouseEnter={() => onSetSelectedIndex(index)}
							onSelect={() => onSelectResult(index)}
						/>
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
							index={index}
							isSelected={index === selectedIndex}
							showSnippet={false}
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
								index={globalIndex}
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
				!isSearching && <div className="commandPaletteEmpty">No results</div>}
			{isSearching &&
				titleMatches.length === 0 &&
				contentMatches.length === 0 && (
					<div className="commandPaletteEmpty">Searching…</div>
				)}
		</>
	);
}
