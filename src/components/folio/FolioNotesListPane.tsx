import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useUILayoutContext } from "../../contexts";
import { prefetchNote } from "../../lib/navigationPrefetch";
import type { AllDocsItem } from "../../lib/tauri";
import { basename } from "../../utils/path";
import { FolioNoteListItem } from "./FolioNoteListItem";
import { FolioScopeHeader } from "./FolioScopeHeader";
import { useFolioNotes } from "./useFolioNotes";

interface FolioNotesListPaneProps {
	activeTabPath: string | null;
	onOpenFile: (relPath: string) => Promise<void>;
	onOpenFileInNewTab: (relPath: string) => Promise<void>;
	onRenameFile: (relPath: string, nextName: string) => Promise<string | null>;
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
	const paneRef = useRef<HTMLElement | null>(null);
	const visibleNotes = useMemo(
		() => notes.filter((note) => noteMatchesFilter(note, searchQuery)),
		[notes, searchQuery],
	);
	const selectedIndex = useMemo(
		() =>
			activeTabPath
				? visibleNotes.findIndex((note) => note.note_path === activeTabPath)
				: -1,
		[activeTabPath, visibleNotes],
	);
	const focusPane = useCallback(() => {
		requestAnimationFrame(() =>
			paneRef.current?.focus({ preventScroll: true }),
		);
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
	const renameNote = useCallback(
		(path: string) => {
			const currentName = basename(path);
			const nextName = window.prompt("Rename note", currentName);
			if (!nextName || nextName.trim() === currentName) return;
			const trimmed = nextName.trim();
			const normalizedName =
				currentName.toLowerCase().endsWith(".md") &&
				!trimmed.toLowerCase().endsWith(".md")
					? `${trimmed}.md`
					: trimmed;
			void onRenameFile(path, normalizedName);
		},
		[onRenameFile],
	);
	const deleteNote = useCallback(
		(path: string) => {
			void onDeleteFile(path);
		},
		[onDeleteFile],
	);
	const openAdjacentNote = useCallback(
		(direction: 1 | -1) => {
			if (!visibleNotes.length || selectedIndex < 0) return;
			const nextIndex =
				(selectedIndex + direction + visibleNotes.length) % visibleNotes.length;
			const nextNote = visibleNotes[nextIndex];
			if (nextNote) openNote(nextNote.note_path);
		},
		[openNote, selectedIndex, visibleNotes],
	);

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
				if (event.target instanceof HTMLInputElement) return;
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
				onSearchQueryChange={setSearchQuery}
			/>
			{body}
		</aside>
	);
});
