import { PinIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileTreeContext, useUILayoutContext } from "../../contexts";

import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	loadAllDocs,
	navigationQueryKeys,
	prefetchNote,
} from "../../lib/navigationPrefetch";
import {
	DEFAULT_TAG_ICON_NAME,
	resolveTagIconName,
	tagIconOverridesFromAppearance,
} from "../../lib/tagIcons";
import type { AllDocsItem, FileTreeAppearance } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { isDeleteKey } from "../../utils/keyboard";
import { basename, isMarkdownPath } from "../../utils/path";
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

function normalizePinnedPath(path: string): string {
	return path
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

function titleFromPinnedPath(path: string): string {
	const name = basename(path);
	return isMarkdownPath(path) ? name.replace(/\.md$/i, "") : name;
}

function allDocsItemToFolioItem(item: AllDocsItem): FolioItem {
	return {
		...item,
		note_path: normalizePinnedPath(item.note_path),
		created: item.created || null,
		updated: item.updated || null,
		is_markdown: true,
	};
}

function fallbackPinnedItem(path: string): FolioItem {
	return {
		note_path: path,
		title: titleFromPinnedPath(path),
		preview: "",
		created: null,
		updated: null,
		tags: [],
		people: [],
		is_markdown: isMarkdownPath(path),
	};
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
	const {
		beautifulTags,
		itemAppearance,
		setItemAppearance,
		pinnedFiles,
		togglePinnedFile,
		tagAppearance,
	} = useFileTreeContext();
	const queryClient = useQueryClient();
	const { notes, filesTruncated, error, nonMarkdownFileLimit } =
		useFolioNotes(folioScope);
	const normalizedPinnedFiles = useMemo(
		() =>
			pinnedFiles
				.map(normalizePinnedPath)
				.filter((path, index, paths) => path && paths.indexOf(path) === index),
		[pinnedFiles],
	);
	const hasPinnedMarkdownFiles = useMemo(
		() => normalizedPinnedFiles.some(isMarkdownPath),
		[normalizedPinnedFiles],
	);
	const pinnedMarkdownQuery = useQuery({
		queryKey: navigationQueryKeys.allDocsList(null),
		queryFn: () => loadAllDocs(null),
		enabled: hasPinnedMarkdownFiles,
	});
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
	const pinnedPathSet = useMemo(
		() => new Set(normalizedPinnedFiles),
		[normalizedPinnedFiles],
	);
	const notesByPath = useMemo(
		() =>
			new Map(
				notes.map(
					(note) => [normalizePinnedPath(note.note_path), note] as const,
				),
			),
		[notes],
	);
	const allDocsByPath = useMemo(
		() =>
			new Map(
				(pinnedMarkdownQuery.data ?? []).map(
					(note) =>
						[
							normalizePinnedPath(note.note_path),
							allDocsItemToFolioItem(note),
						] as const,
				),
			),
		[pinnedMarkdownQuery.data],
	);
	const visiblePinnedNotes = useMemo(
		() =>
			normalizedPinnedFiles
				.map(
					(path) =>
						notesByPath.get(path) ??
						allDocsByPath.get(path) ??
						fallbackPinnedItem(path),
				)
				.filter((note) => noteMatchesFilter(note, searchQuery)),
		[allDocsByPath, normalizedPinnedFiles, notesByPath, searchQuery],
	);
	const visibleRegularNotes = useMemo(
		() =>
			notes
				.filter(
					(note) => !pinnedPathSet.has(normalizePinnedPath(note.note_path)),
				)
				.filter((note) => noteMatchesFilter(note, searchQuery))
				.slice()
				.sort((left, right) => compareNotes(left, right, sortMode)),
		[notes, pinnedPathSet, searchQuery, sortMode],
	);
	const visibleNotes = useMemo(
		() => [...visiblePinnedNotes, ...visibleRegularNotes],
		[visiblePinnedNotes, visibleRegularNotes],
	);
	const selectedIndex = useMemo(
		() =>
			activeTabPath
				? visibleNotes.findIndex((note) => note.note_path === activeTabPath)
				: -1,
		[activeTabPath, visibleNotes],
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

	useTauriEvent("notes:external_changed", (payload) => {
		if (hasPinnedMarkdownFiles) {
			void queryClient.invalidateQueries({
				queryKey: navigationQueryKeys.allDocsList(null),
			});
		}
		if (!payload.rel_path || !taskSummaryPaths.includes(payload.rel_path))
			return;
		setTaskSummaryRefreshKey((key) => key + 1);
	});
	useTauriEvent("space:fs_changed", () => {
		if (!hasPinnedMarkdownFiles) return;
		void queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.allDocsList(null),
		});
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
	const scrollNoteIntoView = useCallback((path: string) => {
		requestAnimationFrame(() => {
			const rows =
				paneRef.current?.querySelectorAll<HTMLElement>(
					"[data-folio-note-path]",
				) ?? [];
			for (const row of rows) {
				if (row.dataset.folioNotePath !== path) continue;
				row.scrollIntoView?.({ block: "nearest" });
				return;
			}
		});
	}, []);
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
	const togglePinnedNote = useCallback(
		async (path: string) => {
			try {
				await togglePinnedFile(path);
			} catch (error) {
				console.error("Failed to toggle pinned folio file", error);
			}
		},
		[togglePinnedFile],
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
		scrollNoteIntoView(activeTabPath);
	}, [activeTabPath, scrollNoteIntoView]);

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
				<ul className="folioNotesList">
					{visiblePinnedNotes.length > 0 ? (
						<li className="folioNotesPinnedHeading">
							<HugeiconsIcon
								icon={PinIcon}
								size="var(--icon-sm)"
								strokeWidth={1}
							/>
							<span>Pinned</span>
						</li>
					) : null}
					{visiblePinnedNotes.map((note) => (
						<FolioNoteListItem
							key={note.note_path}
							note={note}
							selected={activeTabPath === note.note_path}
							isPinned
							onOpen={openNote}
							onOpenInNewTab={openNoteInNewTab}
							onPrefetch={prefetchNote}
							onRename={onRenameFile ? renameNote : undefined}
							onDelete={deleteNote}
							onTogglePinned={togglePinnedNote}
							onFocus={focusPane}
							isRenaming={
								Boolean(onRenameFile) && renamingPath === note.note_path
							}
							onCommitRename={commitRename}
							onCancelRename={cancelRename}
							appearance={itemAppearance[note.note_path] ?? null}
							onOpenAppearancePicker={setAppearancePickerPath}
							iconNameForTag={iconNameForTag}
							taskSummary={
								note.is_markdown
									? (taskSummariesByPath[note.note_path] ?? null)
									: null
							}
						/>
					))}
					{visiblePinnedNotes.length > 0 && visibleRegularNotes.length > 0 ? (
						<li className="folioNotesPinnedDivider" aria-hidden="true" />
					) : null}
					{visibleRegularNotes.map((note) => (
						<FolioNoteListItem
							key={note.note_path}
							note={note}
							selected={activeTabPath === note.note_path}
							isPinned={false}
							onOpen={openNote}
							onOpenInNewTab={openNoteInNewTab}
							onPrefetch={prefetchNote}
							onRename={onRenameFile ? renameNote : undefined}
							onDelete={deleteNote}
							onTogglePinned={togglePinnedNote}
							onFocus={focusPane}
							isRenaming={
								Boolean(onRenameFile) && renamingPath === note.note_path
							}
							onCommitRename={commitRename}
							onCancelRename={cancelRename}
							appearance={itemAppearance[note.note_path] ?? null}
							onOpenAppearancePicker={setAppearancePickerPath}
							iconNameForTag={iconNameForTag}
							taskSummary={
								note.is_markdown
									? (taskSummariesByPath[note.note_path] ?? null)
									: null
							}
						/>
					))}
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
