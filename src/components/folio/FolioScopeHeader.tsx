import { SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";

interface FolioScopeHeaderProps {
	title: string;
	count: number;
	searchQuery: string;
	onSearchQueryChange: (query: string) => void;
}

export const FolioScopeHeader = memo(function FolioScopeHeader({
	title,
	count,
	searchQuery,
	onSearchQueryChange,
}: FolioScopeHeaderProps) {
	return (
		<header className="folioNotesHeader">
			<div className="folioNotesTitleRow">
				<h2 className="folioNotesTitle">{title}</h2>
				<span className="folioNotesCount">
					{count} {count === 1 ? "note" : "notes"}
				</span>
			</div>
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
		</header>
	);
});
