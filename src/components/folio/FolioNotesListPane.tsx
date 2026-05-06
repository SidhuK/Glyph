import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFileTreeContext, useUILayoutContext } from "../../contexts";
import { useTaskProgressIndicatorSetting } from "../../hooks/useTaskProgressIndicatorSetting";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { extractErrorMessage } from "../../lib/errorUtils";
import { prefetchNote } from "../../lib/navigationPrefetch";
import type { FileTreeAppearance } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { basename } from "../../utils/path";
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
	const { itemAppearance, setItemAppearance } = useFileTreeContext();
	const {
		notes,
		filesTruncated,
		isLoading,
		error,
		title,
		nonMarkdownFileLimit,
		missingFolder,
	} = useFolioNotes(folioScope);
	const [searchQuery, setSearchQuery] = useState("");
	const [sortMode, setSortMode] = useState<FolioNotesSortMode>("alphabetical");
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [taskSummaryRefreshKey, setTaskSummaryRefreshKey] = useState(0);
	const paneRef = useRef<HTMLElement | null>(null);
	const visibleNotes = useMemo(
		() =>
			notes
				.filter((note) => noteMatchesFilter(note, searchQuery))
				.slice()
				.sort((left, right) => compareNotes(left, right, sortMode)),
		[notes, searchQuery, sortMode],
	);
	const selectedIndex = useMemo(
		() =>
			activeTabPath
				? visibleNotes.findIndex((note) => note.note_path === activeTabPath)
				: -1,
		[activeTabPath, visibleNotes],
	);
	const showTaskProgressIndicator = useTaskProgressIndicatorSetting(null);
	const taskSummaryPaths = useMemo(
		() =>
			visibleNotes
				.filter((note) => note.is_markdown)
				.map((note) => note.note_path),
		[visibleNotes],
	);
	const taskSummariesByPath = useTaskSummariesForPaths(
		taskSummaryPaths,
		showTaskProgressIndicator,
		taskSummaryRefreshKey,
	);

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
		if (missingFolder) {
			return (
				<div className="folioNotesState">
					Set a folder in Settings to browse this scope.
				</div>
			);
		}
		if (isLoading) {
			return <div className="folioNotesState">Loading notes…</div>;
		}
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
					{visibleNotes.map((note) => (
						<FolioNoteListItem
							key={note.note_path}
							note={note}
							selected={activeTabPath === note.note_path}
							onOpen={openNote}
							onOpenInNewTab={openNoteInNewTab}
							onPrefetch={prefetchNote}
							onRename={onRenameFile ? renameNote : undefined}
							onDelete={deleteNote}
							onFocus={focusPane}
							isRenaming={
								Boolean(onRenameFile) && renamingPath === note.note_path
							}
							onCommitRename={commitRename}
							onCancelRename={cancelRename}
							appearance={itemAppearance[note.note_path] ?? null}
							onChangeAppearance={changeAppearance}
							taskSummary={
								showTaskProgressIndicator && note.is_markdown
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
				}
			}}
		>
			<FolioScopeHeader
				title={title}
				count={visibleNotes.length}
				searchQuery={searchQuery}
				sortMode={sortMode}
				onSearchQueryChange={setSearchQuery}
				onSortModeChange={setSortMode}
			/>
			{body}
		</aside>
	);
});
