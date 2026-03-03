import { Fragment } from "react";
import type { ReactNode } from "react";
import type { RecentFile } from "../../lib/settings";
import type { SearchResult } from "../../lib/tauri";
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

interface SearchResultItemProps {
	result: SearchResult;
	index: number;
	isSelected: boolean;
	onMouseEnter: () => void;
	onSelect: () => void;
}

export function SearchResultItem({
	result,
	index,
	isSelected,
	onMouseEnter,
	onSelect,
}: SearchResultItemProps) {
	return (
		<button
			type="button"
			className="commandPaletteItem commandPaletteResultItem"
			data-search-index={index}
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
					<HighlightedSnippet snippet={result.snippet} />
				</div>
			</div>
		</button>
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

function recentDisplayName(relPath: string): string {
	const fileName = relPath.split("/").pop() ?? relPath;
	if (!fileName || fileName.startsWith(".")) return fileName || relPath;
	const withoutExt = fileName.replace(/\.[^./]+$/, "");
	return withoutExt || fileName;
}

function recentDisplayFolder(relPath: string): string {
	const parts = relPath.split("/").filter(Boolean);
	if (parts.length <= 1) return "";
	return `${parts.slice(0, -1).join("/")}/`;
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
						<button
							key={`${file.spacePath}:${file.path}`}
							type="button"
							className="commandPaletteItem commandPaletteRecentItem"
							data-search-index={index}
							data-selected={index === selectedIndex}
							onMouseEnter={() => onSetSelectedIndex(index)}
							onMouseDown={(e) => {
								e.preventDefault();
								onSelectResult(index);
							}}
						>
							<div className="commandPaletteRecentIcon">
								<FileText size={14} />
							</div>
							<div className="commandPaletteRecentContent">
								<span className="commandPaletteResultTitle">
									{recentDisplayName(file.path)}
								</span>
								<span className="commandPaletteRecentSeparator" aria-hidden>
									-
								</span>
								<span className="commandPaletteRecentPath mono">
									{recentDisplayFolder(file.path) || file.path}
								</span>
							</div>
						</button>
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
