import { useVirtualizer } from "@tanstack/react-virtual";
import {
	type CSSProperties,
	memo,
	useCallback,
	useDeferredValue,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext, useUILayoutContext } from "../../contexts";
import { useVirtualLoadMore } from "../../hooks/useLoadMoreTriggers";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { extractErrorMessage } from "../../lib/errorUtils";
import { prefetchNote } from "../../lib/navigationPrefetch";
import type { FileTreeSortMode } from "../../lib/settings";
import {
	DEFAULT_TAG_ICON_NAME,
	resolveTagIconName,
	tagIconOverridesFromAppearance,
} from "../../lib/tagIcons";
import type { FileTreeAppearance } from "../../lib/tauri";
import { toast } from "../../lib/toast";
import { isDeleteKey, isEditableTarget } from "../../utils/keyboard";
import { isMarkdownPath, parentDir } from "../../utils/path";
import { AppearancePicker } from "../AppearancePicker";
import { EDITOR_TEXT_COLORS, isEditorTextColor } from "../editor/textColors";
import { Button } from "../ui/shadcn/button";
import { FolioNoteListItem } from "./FolioNoteListItem";
import { FolioScopeHeader } from "./FolioScopeHeader";
import { type FolioItem, useFolioNotes } from "./useFolioNotes";

interface FolioNotesListPaneProps {
	activeTabPath: string | null;
	onOpenFile: (relPath: string) => Promise<void>;
	onOpenFileInNewTab: (relPath: string) => Promise<void>;
	onNavigateBreadcrumbPath?: (dirPath: string) => void;
	onRenameFile?: (relPath: string, nextName: string) => Promise<string | null>;
	onDeleteFile: (relPath: string) => Promise<boolean>;
	onNewFileInDir: (dirPath: string) => Promise<string | null>;
	onCreateFromTemplateInDir: (dirPath: string) => void;
	onRequestCreateFolder: (dirPath: string) => void;
	onDuplicateFile: (path: string) => Promise<string | null>;
}

const FOLIO_NOTE_ROW_ESTIMATE = 104;
const FOLIO_FILE_ROW_ESTIMATE = 42;

function sqliteNoCase(value: string): string {
	return value.replace(/[A-Z]/g, (character) => character.toLowerCase());
}

function compareSqliteNoCase(left: string, right: string): number {
	const normalizedLeft = sqliteNoCase(left);
	const normalizedRight = sqliteNoCase(right);
	if (normalizedLeft < normalizedRight) return -1;
	if (normalizedLeft > normalizedRight) return 1;
	return 0;
}

function timestampMs(value: string | null): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

function compareNullableDates(
	left: string | null,
	right: string | null,
	direction: "asc" | "desc",
): number {
	const leftMs = timestampMs(left);
	const rightMs = timestampMs(right);
	if (leftMs === null && rightMs === null) return 0;
	if (leftMs === null) return 1;
	if (rightMs === null) return -1;
	return direction === "desc" ? rightMs - leftMs : leftMs - rightMs;
}

function compareTitles(left: FolioItem, right: FolioItem): number {
	const leftTitle = left.title.trim() || left.note_path;
	const rightTitle = right.title.trim() || right.note_path;
	return (
		compareSqliteNoCase(leftTitle, rightTitle) ||
		compareSqliteNoCase(left.note_path, right.note_path)
	);
}

function compareNotes(left: FolioItem, right: FolioItem, sortMode: FileTreeSortMode): number {
	switch (sortMode) {
		case "name-desc":
			return -compareTitles(left, right);
		case "modified-desc":
			return (
				compareNullableDates(left.updated, right.updated, "desc") || compareTitles(left, right)
			);
		case "modified-asc":
			return compareNullableDates(left.updated, right.updated, "asc") || compareTitles(left, right);
		case "created-desc":
			return (
				compareNullableDates(left.created, right.created, "desc") || compareTitles(left, right)
			);
		case "created-asc":
			return compareNullableDates(left.created, right.created, "asc") || compareTitles(left, right);
		default:
			return compareTitles(left, right);
	}
}

export const FolioNotesListPane = memo(function FolioNotesListPane({
	activeTabPath,
	onOpenFile,
	onOpenFileInNewTab,
	onNavigateBreadcrumbPath,
	onRenameFile,
	onDeleteFile,
	onNewFileInDir,
	onCreateFromTemplateInDir,
	onRequestCreateFolder,
	onDuplicateFile,
}: FolioNotesListPaneProps) {
	const { t } = useTranslation("shell");
	const { folioScope, folioSortMode, setFolioScope, setFolioSortMode } = useUILayoutContext();
	const { beautifulTags, itemAppearance, setActiveDirPath, setItemAppearance, tagAppearance } =
		useFileTreeContext();
	const [searchQuery, setSearchQuery] = useState("");
	const deferredSearchQuery = useDeferredValue(searchQuery);
	const {
		notes,
		filesTruncated,
		error,
		nonMarkdownFileLimit,
		hasNextPage,
		isFetchingNextPage,
		isLoading,
		fetchNextPage,
	} = useFolioNotes(folioScope, folioSortMode, deferredSearchQuery);
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [appearancePickerPath, setAppearancePickerPath] = useState<string | null>(null);
	const paneRef = useRef<HTMLElement | null>(null);
	const listRef = useRef<HTMLUListElement | null>(null);
	const sortedNotes = useMemo(
		() => [...notes].sort((left, right) => compareNotes(left, right, folioSortMode)),
		[folioSortMode, notes],
	);
	const selectedIndex = useMemo(
		() => (activeTabPath ? sortedNotes.findIndex((note) => note.note_path === activeTabPath) : -1),
		[activeTabPath, sortedNotes],
	);
	const taskSummaryPaths = useMemo(
		() => sortedNotes.filter((note) => note.is_markdown).map((note) => note.note_path),
		[sortedNotes],
	);
	const taskSummariesByPath = useTaskSummariesForPaths(taskSummaryPaths, true);
	const tagIconOverrides = useMemo(
		() => tagIconOverridesFromAppearance(tagAppearance),
		[tagAppearance],
	);
	const iconNameForTag = useCallback(
		(tag: string) =>
			beautifulTags
				? resolveTagIconName(tag, tagIconOverrides, beautifulTags)
				: DEFAULT_TAG_ICON_NAME,
		[beautifulTags, tagIconOverrides],
	);
	const rowVirtualizer = useVirtualizer<HTMLElement, HTMLLIElement>({
		count: sortedNotes.length,
		estimateSize: (index) => {
			const note = sortedNotes[index];
			if (note && !note.is_markdown) return FOLIO_FILE_ROW_ESTIMATE;
			return FOLIO_NOTE_ROW_ESTIMATE;
		},
		getScrollElement: () => listRef.current,
		getItemKey: (index) => sortedNotes[index]?.note_path ?? index,
		overscan: 4,
	});
	const virtualItems = rowVirtualizer.getVirtualItems();
	useVirtualLoadMore({
		hasMore: hasNextPage,
		isLoading: isFetchingNextPage,
		onLoadMore: fetchNextPage,
		virtualItems,
		totalItems: sortedNotes.length,
		remainingItems: 4,
	});

	const focusPane = useCallback(() => {
		requestAnimationFrame(() => paneRef.current?.focus({ preventScroll: true }));
	}, []);
	const scrollNoteIntoView = useCallback(
		(path: string) => {
			const index = sortedNotes.findIndex((note) => note.note_path === path);
			if (index < 0) return;
			rowVirtualizer.scrollToIndex(index, { align: "auto" });
		},
		[rowVirtualizer, sortedNotes],
	);
	const openNote = useCallback(
		(path: string) => {
			void onOpenFile(path);
			focusPane();
		},
		[focusPane, onOpenFile],
	);
	const openNoteInNewTab = useCallback(
		(path: string) => {
			void onOpenFileInNewTab(path);
		},
		[onOpenFileInNewTab],
	);
	const showNoteInFolder = useCallback(
		(path: string) => {
			const folder = parentDir(path);
			setFolioScope(folder ? { kind: "folder", folderPrefix: folder } : { kind: "all" });
			(onNavigateBreadcrumbPath ?? setActiveDirPath)(folder);
		},
		[onNavigateBreadcrumbPath, setActiveDirPath, setFolioScope],
	);
	const renameNote = useCallback((path: string) => {
		setRenamingPath(path);
	}, []);
	const cancelRename = useCallback(() => {
		setRenamingPath(null);
	}, []);
	const commitRename = useCallback(
		async (path: string, nextName: string) => {
			if (!onRenameFile) return false;
			const renamed = await onRenameFile?.(path, nextName);
			if (renamed) {
				setRenamingPath(null);
				return true;
			}
			return false;
		},
		[onRenameFile],
	);
	const duplicateFile = useCallback(
		async (path: string) => {
			const duplicatedPath = await onDuplicateFile(path);
			if (duplicatedPath) setRenamingPath(duplicatedPath);
		},
		[onDuplicateFile],
	);
	const deleteNote = useCallback(
		async (path: string) => {
			const item = notes.find((note) => note.note_path === path);
			const isMarkdown = item?.is_markdown ?? isMarkdownPath(path);
			const { confirm } = await import("@tauri-apps/plugin-dialog");
			const confirmed = await confirm(
				isMarkdown ? t("folio.delete.confirmNote") : t("folio.delete.confirmFile"),
				{
					title: t("folio.delete.title"),
					okLabel: t("folio.delete.confirm"),
					cancelLabel: t("folio.delete.cancel"),
				},
			);
			if (!confirmed) return;
			await onDeleteFile(path);
		},
		[notes, onDeleteFile, t],
	);
	const changeAppearance = useCallback(
		async (path: string, appearance: FileTreeAppearance) => {
			try {
				await setItemAppearance(path, appearance);
			} catch (error) {
				toast.error(t("fileTree.appearance.updateFailed"), {
					description: extractErrorMessage(error),
				});
			}
		},
		[setItemAppearance, t],
	);
	const pickerAppearance = appearancePickerPath
		? (itemAppearance[appearancePickerPath] ?? null)
		: null;
	const pickerColor =
		pickerAppearance?.color && isEditorTextColor(pickerAppearance.color)
			? pickerAppearance.color
			: null;
	const pickerIcon = pickerAppearance?.icon ?? null;
	const updatePickerAppearance = useCallback(
		(nextAppearance: FileTreeAppearance) => {
			if (!appearancePickerPath) return;
			void changeAppearance(appearancePickerPath, {
				...itemAppearance[appearancePickerPath],
				...nextAppearance,
			});
		},
		[appearancePickerPath, changeAppearance, itemAppearance],
	);
	const openAdjacentNote = useCallback(
		(direction: 1 | -1) => {
			if (!sortedNotes.length || selectedIndex < 0) return;
			const nextIndex = (selectedIndex + direction + sortedNotes.length) % sortedNotes.length;
			const nextNote = sortedNotes[nextIndex];
			if (!nextNote) return;
			scrollNoteIntoView(nextNote.note_path);
			openNote(nextNote.note_path);
		},
		[openNote, scrollNoteIntoView, selectedIndex, sortedNotes],
	);

	const body = (() => {
		if (isLoading) {
			return <div className="folioNotesState">{t("calendar.loading")}</div>;
		}
		if (error) {
			return (
				<div className="folioNotesState">
					{t("calendar.loadFailed", { message: extractErrorMessage(error) })}
				</div>
			);
		}
		if (!sortedNotes.length) {
			return (
				<div className="folioNotesState">
					{searchQuery.trim() ? t("folio.emptySearch") : t("folio.empty")}
				</div>
			);
		}
		return (
			<>
				{filesTruncated ? (
					<div className="folioNotesState">
						{t("folio.filesTruncated", {
							count: nonMarkdownFileLimit.toLocaleString(),
						})}
					</div>
				) : null}
				<ul
					ref={listRef}
					className="folioNotesList is-virtualized"
					style={
						{
							"--folio-virtual-height": `${rowVirtualizer.getTotalSize()}px`,
						} as CSSProperties
					}
				>
					{virtualItems.map((virtualRow) => {
						const note = sortedNotes[virtualRow.index];
						if (!note) return null;
						const virtualStyle = {
							transform: `translateY(${virtualRow.start}px)`,
						};
						return (
							<FolioNoteListItem
								key={virtualRow.key}
								virtualIndex={virtualRow.index}
								ref={(node) => rowVirtualizer.measureElement(node)}
								className="folioNotesVirtualRow"
								style={virtualStyle}
								note={note}
								selected={activeTabPath === note.note_path}
								onOpen={openNote}
								onOpenInNewTab={openNoteInNewTab}
								onShowInFolder={showNoteInFolder}
								onPrefetch={prefetchNote}
								onRename={onRenameFile ? renameNote : undefined}
								onDelete={deleteNote}
								onDuplicate={duplicateFile}
								onNewFileInDir={onNewFileInDir}
								onCreateFromTemplateInDir={onCreateFromTemplateInDir}
								onRequestCreateFolder={onRequestCreateFolder}
								onFocus={focusPane}
								isRenaming={Boolean(onRenameFile) && renamingPath === note.note_path}
								onCommitRename={commitRename}
								onCancelRename={cancelRename}
								appearance={itemAppearance[note.note_path] ?? null}
								onOpenAppearancePicker={setAppearancePickerPath}
								iconNameForTag={iconNameForTag}
								taskSummary={
									note.is_markdown ? (taskSummariesByPath?.[note.note_path] ?? null) : null
								}
							/>
						);
					})}
				</ul>
				{hasNextPage ? (
					<Button
						type="button"
						className="mx-3 mb-2 mt-1"
						variant="ghost"
						size="sm"
						disabled={isFetchingNextPage}
						onClick={() => void fetchNextPage()}
					>
						{isFetchingNextPage ? t("folio.loadingMore") : t("folio.loadMore")}
					</Button>
				) : null}
			</>
		);
	})();

	return (
		<aside
			ref={paneRef}
			className="folioNotesPane"
			aria-label={t("folio.listAria")}
			aria-busy={isLoading || isFetchingNextPage}
			tabIndex={-1}
			onKeyDown={(event) => {
				if (isEditableTarget(event.target)) return;
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					openAdjacentNote(event.key === "ArrowDown" ? 1 : -1);
					return;
				}
				if (event.key === "Enter") {
					event.preventDefault();
					const note = selectedIndex >= 0 ? sortedNotes[selectedIndex] : null;
					if (note) openNote(note.note_path);
					return;
				}
				if (isDeleteKey(event)) {
					const row =
						event.target instanceof HTMLElement
							? event.target.closest<HTMLElement>("[data-folio-note-path]")
							: null;
					const pathFromFocusedRow = event.currentTarget.contains(row)
						? row?.dataset.folioNotePath
						: null;
					const selectedNote = selectedIndex >= 0 ? sortedNotes[selectedIndex] : null;
					const path = pathFromFocusedRow ?? selectedNote?.note_path;
					if (!path) return;
					event.preventDefault();
					void deleteNote(path);
				}
			}}
		>
			<AppearancePicker
				title={t("fileTree.appearance.title")}
				open={appearancePickerPath !== null}
				onOpenChange={(open) => {
					if (!open) setAppearancePickerPath(null);
				}}
				iconValue={pickerIcon}
				defaultIconName="document"
				showDefaultIcon
				onIconChange={(icon) => {
					updatePickerAppearance({
						icon,
					});
				}}
				showColors
				colorValue={pickerColor}
				colorOptions={EDITOR_TEXT_COLORS}
				onColorChange={(color) => {
					updatePickerAppearance({
						color,
					});
				}}
			/>
			<FolioScopeHeader
				searchQuery={searchQuery}
				sortMode={folioSortMode}
				onSearchQueryChange={setSearchQuery}
				onSortModeChange={setFolioSortMode}
			/>
			{body}
		</aside>
	);
});
