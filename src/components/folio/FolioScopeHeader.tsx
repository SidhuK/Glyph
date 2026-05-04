import {
	ArrangeByLettersAZIcon,
	Calendar03Icon,
	Clock01Icon,
	SearchIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";

type FolioNotesSortMode = "alphabetical" | "edited" | "created";

interface FolioScopeHeaderProps {
	title: string;
	count: number;
	searchQuery: string;
	sortMode: FolioNotesSortMode;
	onSearchQueryChange: (query: string) => void;
	onSortModeChange: (sortMode: FolioNotesSortMode) => void;
}

export const FolioScopeHeader = memo(function FolioScopeHeader({
	title,
	count,
	searchQuery,
	sortMode,
	onSearchQueryChange,
	onSortModeChange,
}: FolioScopeHeaderProps) {
	const sortIcon =
		sortMode === "alphabetical"
			? ArrangeByLettersAZIcon
			: sortMode === "created"
				? Calendar03Icon
				: Clock01Icon;

	return (
		<header className="folioNotesHeader">
			<div className="folioNotesTitleRow">
				<h2 className="folioNotesTitle">{title}</h2>
				<span className="folioNotesCount">
					{count} {count === 1 ? "note" : "notes"}
				</span>
			</div>
			<div className="folioNotesControls">
				<label className="folioNotesSearch">
					<HugeiconsIcon icon={SearchIcon} size={14} strokeWidth={0.9} />
					<input
						type="text"
						inputMode="search"
						value={searchQuery}
						placeholder="Filter notes"
						aria-label="Filter notes"
						onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
					/>
				</label>
				<label className="folioNotesSort">
					<HugeiconsIcon icon={sortIcon} size={14} strokeWidth={1} />
					<select
						className="folioNotesSortSelect"
						value={sortMode}
						aria-label="Sort notes"
						onChange={(event) => {
							const value = event.currentTarget.value;
							onSortModeChange(
								value === "edited" || value === "created"
									? value
									: "alphabetical",
							);
						}}
					>
						<option value="alphabetical">Alphabetically</option>
						<option value="edited">Edited</option>
						<option value="created">Created</option>
					</select>
				</label>
			</div>
		</header>
	);
});
