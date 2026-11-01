import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	ArrangeByLettersAZIcon,
	Calendar03Icon,
	Cancel01Icon,
	Clock01Icon,
	SearchIcon,
} from "@hugeicons/core-free-icons";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { FileTreeSortMode } from "../../lib/settings";
import { FileTreeSortMenu } from "../filetree/FileTreeSortMenu";

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
					<HugeiconsIcon icon={SearchIcon} size="var(--icon-sm)" />
					<input
						type="text"
						inputMode="search"
						value={searchQuery}
						placeholder={t("folio.filter")}
						aria-label={t("folio.filter")}
						spellCheck={false}
						autoComplete="off"
						onKeyDown={(event) => {
							if (event.key !== "Escape" || !searchQuery) return;
							event.preventDefault();
							onSearchQueryChange("");
						}}
						onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
					/>
					{searchQuery ? (
						<button
							type="button"
							className="folioNotesSearchClear"
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => onSearchQueryChange("")}
							title={t("folio.clearFilter")}
							aria-label={t("folio.clearFilter")}
						>
							<HugeiconsIcon icon={Cancel01Icon} size="var(--icon-xs)" />
						</button>
					) : null}
				</label>
				<FileTreeSortMenu
					sortMode={sortMode}
					onSortModeChange={onSortModeChange}
					triggerClassName="folioNotesSort"
					icon={sortIcon}
					iconSize="var(--icon-md)"
				/>
			</div>
		</header>
	);
});
