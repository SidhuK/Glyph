import {
	ArrangeByLettersAZIcon,
	Calendar03Icon,
	Clock01Icon,
	SearchIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import type { FolioNotesSortMode } from "./folioScopes";

interface FolioScopeHeaderProps {
	searchQuery: string;
	sortMode: FolioNotesSortMode;
	onSearchQueryChange: (query: string) => void;
	onSortModeChange: (sortMode: FolioNotesSortMode) => void;
}

export const FolioScopeHeader = memo(function FolioScopeHeader({
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
			<div className="folioNotesControls">
				<label className="folioNotesSearch">
					<HugeiconsIcon
						icon={SearchIcon}
						size="var(--icon-md)"
						strokeWidth={0.9}
					/>
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
					<HugeiconsIcon
						icon={sortIcon}
						size="var(--icon-md)"
						strokeWidth={1}
					/>
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
