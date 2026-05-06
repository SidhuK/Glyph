import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUILayoutContext } from "../../contexts";
import { useTaskProgressIndicatorSetting } from "../../hooks/useTaskProgressIndicatorSetting";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { prefetchNote } from "../../lib/navigationPrefetch";
import type { AllDocsItem } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { basename } from "../../utils/path";
import { FolioNoteListItem } from "./FolioNoteListItem";
import { FolioScopeHeader } from "./FolioScopeHeader";
import type { FolioNotesSortMode } from "./folioScopes";
import { useFolioNotes } from "./useFolioNotes";

interface FolioNotesListPaneProps {
	activeTabPath: string | null;
	onOpenFile: (relPath: string) => Promise<void>;
	onOpenFileInNewTab: (relPath: string) => Promise<void>;
	onRenameFile?: (relPath: string, nextName: string) => Promise<string | null>;
	onDeleteFile: (relPath: string) => Promise<boolean>;
}

function noteTitle(note: AllDocsItem): string {
	return note.title.trim() || basename(note.note_path).replace(/\.md$/i, "");
}

function noteMatchesFilter(note: AllDocsItem, query: string): boolean {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return true;
	const haystack = [noteTitle(note), note.preview, note.note_path, ...note.tags]
		.join(" ")
		.toLowerCase();
	return haystack.includes(normalized);
}

function compareNotes(
	left: AllDocsItem,
	right: AllDocsItem,
	sortMode: FolioNotesSortMode,
): number {
	if (sortMode === "edited") {
		return Date.parse(right.updated) - Date.parse(left.updated);
	}
	if (sortMode === "created") {
		return Date.parse(right.created) - Date.parse(left.created);
	}
	return (
		noteTitle(left).localeCompare(noteTitle(right), undefined, {
			sensitivity: "base",
			numeric: true,
		}) || left.note_path.localeCompare(right.note_path)
	);
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
	const { notes, isLoading, error, title, missingFolder } =
		useFolioNotes(folioScope);
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
		() => visibleNotes.map((note) => note.note_path),
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
			<ul className="folioNotesList">
				{visibleNotes.map((note) => (
					<FolioNoteListItem
						key={note.note_path}
						note={note}
						selected={activeTabPath === note.note_path}
						onOpen={openNote}
						onOpenInNewTab={openNoteInNewTab}
						onPrefetch={prefetchNote}
						onRename={renameNote}
						onDelete={deleteNote}
						onFocus={focusPane}
						isRenaming={renamingPath === note.note_path}
						onCommitRename={commitRename}
						onCancelRename={cancelRename}
						taskSummary={
							showTaskProgressIndicator
								? (taskSummariesByPath[note.note_path] ?? null)
								: null
						}
					/>
				))}
			</ul>
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
