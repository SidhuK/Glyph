import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	ArrangeByLettersAZIcon,
	Calendar03Icon,
	Clock01Icon,
	SearchIcon,
} from "@hugeicons/core-free-icons";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { FILE_TREE_SORT_MODES, fileTreeSortLabel } from "../../lib/fileTreeSort";
import { isFileTreeSortMode, type FileTreeSortMode } from "../../lib/settings";

interface FolioScopeHeaderProps {
	searchQuery: string;
	sortMode: FileTreeSortMode;
	onSearchQueryChange: (query: string) => void;
	onSortModeChange: (sortMode: FileTreeSortMode) => void;
}

export const FolioScopeHeader = memo(function FolioScopeHeader({
	searchQuery,
	sortMode,
	onSearchQueryChange,
	onSortModeChange,
}: FolioScopeHeaderProps) {
	const { t } = useTranslation("shell");
	const sortIcon = sortMode.startsWith("name-")
		? ArrangeByLettersAZIcon
		: sortMode.startsWith("created-")
			? Calendar03Icon
			: Clock01Icon;

	return (
		<header className="folioNotesHeader">
			<div className="folioNotesControls">
				<label className="folioNotesSearch">
					<HugeiconsIcon icon={SearchIcon} size="var(--icon-md)" />
					<input
						type="text"
						inputMode="search"
						value={searchQuery}
						placeholder={t("folio.filter")}
						aria-label={t("folio.filter")}
						onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
					/>
				</label>
				<label className="folioNotesSort">
					<HugeiconsIcon icon={sortIcon} size="var(--icon-md)" />
					<select
						className="folioNotesSortSelect"
						value={sortMode}
						aria-label={t("sidebar.sortNotes")}
						onChange={(event) => {
							const mode = event.currentTarget.value;
							if (isFileTreeSortMode(mode)) onSortModeChange(mode);
						}}
					>
						{FILE_TREE_SORT_MODES.map((mode) => (
							<option key={mode} value={mode}>
								{fileTreeSortLabel(mode)}
							</option>
						))}
					</select>
				</label>
			</div>
		</header>
	);
});
