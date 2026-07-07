import { useVirtualizer } from "@tanstack/react-virtual";
import {
	type CSSProperties,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useFileTreeContext, useUILayoutContext } from "../../contexts";

import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { extractErrorMessage } from "../../lib/errorUtils";
import { prefetchNote } from "../../lib/navigationPrefetch";
import {
	DEFAULT_TAG_ICON_NAME,
	resolveTagIconName,
	tagIconOverridesFromAppearance,
} from "../../lib/tagIcons";
import type { FileTreeAppearance } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { isDeleteKey } from "../../utils/keyboard";
import { basename } from "../../utils/path";
import { AppearancePicker } from "../AppearancePicker";
import { EDITOR_TEXT_COLORS, isEditorTextColor } from "../editor/textColors";
import { FolioNoteListItem } from "./FolioNoteListItem";
import { FolioScopeHeader } from "./FolioScopeHeader";
import type { FolioNotesSortMode } from "./folioScopes";
import { type FolioItem, useFolioNotes } from "./useFolioNotes";

interface FolioNotesListPaneProps {
	activeTabPath: string | null;
	onOpenFile: (relPath: string) => Promise<void>;
	onOpenFileInNewTab: (relPath: string) => Promise<void>;
	onRenameFile?: (relPath: string, nextName: string) => Promise<string | null>;
	onDeleteFile: (relPath: string) => Promise<boolean>;
}

const FOLIO_SORT_MODE_STORAGE_KEY = "glyph.folio.sortMode";
const FOLIO_NOTE_ROW_ESTIMATE = 104;
const FOLIO_FILE_ROW_ESTIMATE = 42;
type FolioVirtualRow = {
	id: string;
	kind: "note";
	note: FolioItem;
};

function isFolioNotesSortMode(value: unknown): value is FolioNotesSortMode {
	return value === "alphabetical" || value === "edited" || value === "created";
}

function readStoredFolioSortMode(): FolioNotesSortMode {
	if (typeof window === "undefined") return "alphabetical";
	try {
		const value = window.localStorage.getItem(FOLIO_SORT_MODE_STORAGE_KEY);
		return isFolioNotesSortMode(value) ? value : "alphabetical";
	} catch {
		return "alphabetical";
	}
}

function writeStoredFolioSortMode(sortMode: FolioNotesSortMode) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(FOLIO_SORT_MODE_STORAGE_KEY, sortMode);
	} catch {
		// Best-effort UI persistence.
	}
}

function noteTitle(note: FolioItem): string {
	const fallback = basename(note.note_path);
	return (
		note.title.trim() ||
		(note.is_markdown ? fallback.replace(/\.md$/i, "") : fallback)
	);
}

function noteMatchesFilter(note: FolioItem, query: string): boolean {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return true;
	const haystack = [noteTitle(note), note.preview, note.note_path, ...note.tags]
		.join(" ")
		.toLowerCase();
	return haystack.includes(normalized);
}

function timestampMs(value: string | null): number | null {
	if (!value) return null;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

function compareNullableDates(
	left: string | null,
	right: string | null,
): number {
	const leftMs = timestampMs(left);
	const rightMs = timestampMs(right);
	if (leftMs === null && rightMs === null) return 0;
	if (leftMs === null) return 1;
	if (rightMs === null) return -1;
	return rightMs - leftMs;
}

function compareTitles(left: FolioItem, right: FolioItem): number {
	return (
		noteTitle(left).localeCompare(noteTitle(right), undefined, {
			sensitivity: "base",
			numeric: true,
		}) || left.note_path.localeCompare(right.note_path)
	);
}

function compareNotes(
	left: FolioItem,
	right: FolioItem,
	sortMode: FolioNotesSortMode,
): number {
	if (sortMode === "edited") {
		return (
			compareNullableDates(left.updated, right.updated) ||
			compareTitles(left, right)
		);
	}
	if (sortMode === "created") {
		return (
			compareNullableDates(left.created, right.created) ||
			compareTitles(left, right)
		);
	}
	return compareTitles(left, right);
}

function isFolioHeaderControl(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLSelectElement ||
		target instanceof HTMLTextAreaElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}

export const FolioNotesListPane = memo(function FolioNotesListPane({
	activeTabPath,
	onOpenFile,
	onOpenFileInNewTab,
	onRenameFile,
	onDeleteFile,
}: FolioNotesListPaneProps) {
	const { folioScope } = useUILayoutContext();
	const { beautifulTags, itemAppearance, setItemAppearance, tagAppearance } =
		useFileTreeContext();
	const { notes, filesTruncated, error, nonMarkdownFileLimit } =
		useFolioNotes(folioScope);
	const [searchQuery, setSearchQuery] = useState("");
	const [sortMode, setSortMode] = useState<FolioNotesSortMode>(
		readStoredFolioSortMode,
	);
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [appearancePickerPath, setAppearancePickerPath] = useState<
		string | null
	>(null);
	const [taskSummaryRefreshKey, setTaskSummaryRefreshKey] = useState(0);
	const paneRef = useRef<HTMLElement | null>(null);
	const listRef = useRef<HTMLUListElement | null>(null);
	const visibleNotes = useMemo(
		() =>
			notes
				.filter((note) => noteMatchesFilter(note, searchQuery))
				.slice()
				.sort((left, right) => compareNotes(left, right, sortMode)),
		[notes, searchQuery, sortMode],
	);
	const virtualRows = useMemo<FolioVirtualRow[]>(
		() =>
			visibleNotes.map((note) => ({
				id: `note:${note.note_path}`,
				kind: "note",
				note,
			})),
		[visibleNotes],
	);
	const selectedIndex = useMemo(
		() =>
			activeTabPath
				? visibleNotes.findIndex((note) => note.note_path === activeTabPath)
				: -1,
		[activeTabPath, visibleNotes],
	);
	const selectedVirtualIndex = useMemo(
		() =>
			activeTabPath
				? virtualRows.findIndex((row) => row.note.note_path === activeTabPath)
				: -1,
		[activeTabPath, virtualRows],
	);
	const taskSummaryPaths = useMemo(
		() =>
			visibleNotes
				.filter((note) => note.is_markdown)
				.map((note) => note.note_path),
		[visibleNotes],
	);
	const taskSummariesByPath = useTaskSummariesForPaths(
		taskSummaryPaths,
		true,
		taskSummaryRefreshKey,
	);
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
		count: virtualRows.length,
		estimateSize: (index) => {
			const row = virtualRows[index];
			if (row && !row.note.is_markdown) return FOLIO_FILE_ROW_ESTIMATE;
			return FOLIO_NOTE_ROW_ESTIMATE;
		},
		getScrollElement: () => listRef.current,
		getItemKey: (index) => virtualRows[index]?.id ?? index,
		overscan: 4,
	});
	const virtualItems = rowVirtualizer.getVirtualItems();

	useTauriEvent("notes:external_changed", (payload) => {
		if (!payload.rel_path || !taskSummaryPaths.includes(payload.rel_path))
			return;
		setTaskSummaryRefreshKey((key) => key + 1);
	});
	const focusPane = useCallback(() => {
		requestAnimationFrame(() =>
			paneRef.current?.focus({ preventScroll: true }),
		);
	}, []);
	const changeSortMode = useCallback((nextSortMode: FolioNotesSortMode) => {
		setSortMode(nextSortMode);
		writeStoredFolioSortMode(nextSortMode);
	}, []);
	const scrollNoteIntoView = useCallback(
		(path: string) => {
			const index = virtualRows.findIndex((row) => row.note.note_path === path);
			if (index < 0) return;
			rowVirtualizer.scrollToIndex(index, { align: "auto" });
		},
		[rowVirtualizer, virtualRows],
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
	const deleteNote = useCallback(
		async (path: string) => {
			const { confirm } = await import("@tauri-apps/plugin-dialog");
			const confirmed = await confirm("Delete this note?", {
				title: "Confirm delete",
				okLabel: "Delete",
				cancelLabel: "Cancel",
			});
			if (!confirmed) return;
			await onDeleteFile(path);
		},
		[onDeleteFile],
	);
	const changeAppearance = useCallback(
		async (path: string, appearance: FileTreeAppearance) => {
			try {
				await setItemAppearance(path, appearance);
			} catch (error) {
				console.error(
					"Failed to update folio file appearance",
					extractErrorMessage(error),
				);
			}
		},
		[setItemAppearance],
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
				...(itemAppearance[appearancePickerPath] ?? {}),
				...nextAppearance,
			});
		},
		[appearancePickerPath, changeAppearance, itemAppearance],
	);
	const openAdjacentNote = useCallback(
		(direction: 1 | -1) => {
			if (!visibleNotes.length || selectedIndex < 0) return;
			const nextIndex =
				(selectedIndex + direction + visibleNotes.length) % visibleNotes.length;
			const nextNote = visibleNotes[nextIndex];
			if (!nextNote) return;
			scrollNoteIntoView(nextNote.note_path);
			openNote(nextNote.note_path);
		},
		[openNote, scrollNoteIntoView, selectedIndex, visibleNotes],
	);

	useEffect(() => {
		if (!activeTabPath) return;
		if (selectedVirtualIndex < 0) return;
		rowVirtualizer.scrollToIndex(selectedVirtualIndex, { align: "auto" });
	}, [activeTabPath, rowVirtualizer, selectedVirtualIndex]);

	const body = (() => {
		if (error) {
			return (
				<div className="folioNotesState">
					Could not load notes:{" "}
					{error instanceof Error ? error.message : String(error)}
				</div>
			);
		}
		if (!visibleNotes.length) {
			return (
				<div className="folioNotesState">
					{searchQuery.trim() ? "No matching notes." : "No notes found."}
				</div>
			);
		}
		return (
			<>
				{filesTruncated ? (
					<div className="folioNotesState">
						Showing the first {nonMarkdownFileLimit.toLocaleString()} files.
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
						const row = virtualRows[virtualRow.index];
						if (!row) return null;
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
								note={row.note}
								selected={activeTabPath === row.note.note_path}
								onOpen={openNote}
								onOpenInNewTab={openNoteInNewTab}
								onPrefetch={prefetchNote}
								onRename={onRenameFile ? renameNote : undefined}
								onDelete={deleteNote}
								onFocus={focusPane}
								isRenaming={
									Boolean(onRenameFile) && renamingPath === row.note.note_path
								}
								onCommitRename={commitRename}
								onCancelRename={cancelRename}
								appearance={itemAppearance[row.note.note_path] ?? null}
								onOpenAppearancePicker={setAppearancePickerPath}
								iconNameForTag={iconNameForTag}
								taskSummary={
									row.note.is_markdown
										? (taskSummariesByPath?.[row.note.note_path] ?? null)
										: null
								}
							/>
						);
					})}
				</ul>
			</>
		);
	})();

	return (
		<aside
			ref={paneRef}
			className="folioNotesPane"
			aria-label="Notes list"
			tabIndex={-1}
			onKeyDown={(event) => {
				if (isFolioHeaderControl(event.target)) return;
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					event.preventDefault();
					openAdjacentNote(event.key === "ArrowDown" ? 1 : -1);
					return;
				}
				if (event.key === "Enter") {
					event.preventDefault();
					const note = selectedIndex >= 0 ? visibleNotes[selectedIndex] : null;
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
					const selectedNote =
						selectedIndex >= 0 ? visibleNotes[selectedIndex] : null;
					const path = pathFromFocusedRow ?? selectedNote?.note_path;
					if (!path) return;
					event.preventDefault();
					void deleteNote(path);
				}
			}}
		>
			<AppearancePicker
				title="Choose file appearance"
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
				sortMode={sortMode}
				onSearchQueryChange={setSearchQuery}
				onSortModeChange={changeSortMode}
			/>
			{body}
		</aside>
	);
});
