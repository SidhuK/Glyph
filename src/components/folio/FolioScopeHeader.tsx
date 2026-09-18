import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	ArrangeByLettersAZIcon,
	Calendar03Icon,
	Cancel01Icon,
	Clock01Icon,
	PanelLeftCloseIcon,
	SearchIcon,
} from "@hugeicons/core-free-icons";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { FILE_TREE_SORT_MODES, fileTreeSortLabel } from "../../lib/fileTreeSort";
import { isFileTreeSortMode, type FileTreeSortMode } from "../../lib/settings";
import { basename } from "../../utils/path";
import type { FolioScope } from "./folioScopes";

interface FolioScopeHeaderProps {
	scope: FolioScope;
	searchQuery: string;
	sortMode: FileTreeSortMode;
	onClearScope: () => void;
	onCollapse: () => void;
	onSearchQueryChange: (query: string) => void;
	onSortModeChange: (sortMode: FileTreeSortMode) => void;
}

export const FolioScopeHeader = memo(function FolioScopeHeader({
	scope,
	searchQuery,
	sortMode,
	onClearScope,
	onCollapse,
	onSearchQueryChange,
	onSortModeChange,
}: FolioScopeHeaderProps) {
	const { t } = useTranslation("shell");
	const sortIcon = sortMode.startsWith("name-")
		? ArrangeByLettersAZIcon
		: sortMode.startsWith("created-")
			? Calendar03Icon
			: Clock01Icon;
	const scopeLabel = (() => {
		switch (scope.kind) {
			case "folder":
				return t("folio.scope.folder", { folder: basename(scope.folderPrefix) });
			case "tag":
				return t("folio.scope.tag", { tag: scope.tag.replace(/^#/, "") });
			case "person":
				return t("folio.scope.person", { person: scope.handle.replace(/^@/, "") });
			default:
				return t("folio.scope.all");
		}
	})();

	return (
		<header className="folioNotesHeader">
			<div className="folioNotesScopeRow">
				<span className="folioNotesTitle" title={scopeLabel}>
					{scopeLabel}
				</span>
				{scope.kind !== "all" ? (
					<button
						type="button"
						className="sidebarStackHeaderAction"
						aria-label={t("folio.scope.clear")}
						title={t("folio.scope.clear")}
						onClick={onClearScope}
					>
						<HugeiconsIcon icon={Cancel01Icon} size="var(--icon-sm)" />
					</button>
				) : null}
				<button
					type="button"
					className="sidebarStackHeaderAction"
					aria-label={t("folio.collapse")}
					title={t("folio.collapse")}
					onClick={onCollapse}
				>
					<HugeiconsIcon icon={PanelLeftCloseIcon} size="var(--icon-md)" />
				</button>
			</div>
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
