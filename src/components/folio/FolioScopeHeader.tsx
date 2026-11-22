import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowDown01Icon, Edit04Icon } from "@hugeicons/core-free-icons";
import type { TFunction } from "i18next";
import { type RefObject, memo } from "react";
import { useTranslation } from "react-i18next";
import { useSpace, useUILayoutContext } from "../../contexts";
import type { FileTreeSortMode } from "../../lib/settings";
import { basename } from "../../utils/path";
import { formatDatabaseTagLabel } from "../database/databaseTagLabel";
import { FileTreeSortMenu } from "../filetree/FileTreeSortMenu";
import { FolioFilterField } from "./FolioFilterField";
import { keepKeysOutOfFolioList } from "./folioListKeys";
import type { FolioScope } from "./folioScopes";

interface FolioScopeHeaderProps {
	count: number | null;
	searchInputRef: RefObject<HTMLInputElement | null>;
	searchQuery: string;
	sortMode: FileTreeSortMode;
	onSearchQueryChange: (query: string) => void;
	onSortModeChange: (sortMode: FileTreeSortMode) => void;
	onNewNote: (dirPath: string) => void;
}

function sortFieldLabel(sortMode: FileTreeSortMode, t: TFunction<"shell">): string {
	if (sortMode.startsWith("name-")) return t("folio.sortBy.name");
	if (sortMode.startsWith("created-")) return t("folio.sortBy.created");
	return t("folio.sortBy.modified");
}

function scopeTitle(scope: FolioScope, inboxFolder: string, t: TFunction<"shell">): string {
	switch (scope.kind) {
		case "folder":
			if (!scope.folderPrefix) return t("sidebar.allNotes");
			if (scope.folderPrefix === inboxFolder) return t("sidebar.inbox");
			return basename(scope.folderPrefix);
		case "tag":
			return `#${formatDatabaseTagLabel(scope.tag)}`;
		case "person":
			return `@${scope.handle.replace(/^@/, "")}`;
		default:
			return t("sidebar.allNotes");
	}
}

export const FolioScopeHeader = memo(function FolioScopeHeader({
	count,
	searchInputRef,
	searchQuery,
	sortMode,
	onSearchQueryChange,
	onSortModeChange,
	onNewNote,
}: FolioScopeHeaderProps) {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const { folioScope, defaultNewNoteFolder, settingsSpacePath } = useUILayoutContext();
	const inboxFolder = settingsSpacePath === spacePath ? (defaultNewNoteFolder ?? "") : "";
	const newNoteFolder = folioScope.kind === "folder" ? folioScope.folderPrefix : inboxFolder;
	const newNoteTitle = newNoteFolder
		? t("sidebar.newNoteInFolder", { folder: newNoteFolder })
		: t("sidebar.newNoteInRoot");

	return (
		<header className="folioNotesHeader">
			<div className="folioNotesTitleRow">
				<h2 className="folioNotesTitle">
					<span className="folioNotesTitleText">{scopeTitle(folioScope, inboxFolder, t)}</span>
					{count === null ? null : (
						<span className="folioNotesCount">{count.toLocaleString()}</span>
					)}
				</h2>
				<FileTreeSortMenu
					sortMode={sortMode}
					onSortModeChange={onSortModeChange}
					triggerClassName="folioNotesSort"
					triggerContent={
						<>
							<span>{sortFieldLabel(sortMode, t)}</span>
							<HugeiconsIcon icon={ArrowDown01Icon} size="var(--icon-xs)" aria-hidden="true" />
						</>
					}
				/>
				<button
					type="button"
					className="folioNotesNewNote"
					onKeyDown={keepKeysOutOfFolioList}
					onClick={() => onNewNote(newNoteFolder)}
					title={newNoteTitle}
					aria-label={t("sidebar.newNote")}
				>
					<HugeiconsIcon icon={Edit04Icon} size="var(--icon-md)" aria-hidden="true" />
				</button>
			</div>
			<FolioFilterField
				inputRef={searchInputRef}
				query={searchQuery}
				onQueryChange={onSearchQueryChange}
			/>
		</header>
	);
});
