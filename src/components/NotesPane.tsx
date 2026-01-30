import { memo } from "react";
import type { NoteMeta } from "../lib/tauri";

interface NotesPaneProps {
	notes: NoteMeta[];
	activeNoteId: string | null;
	onSelectNote: (id: string) => void;
	onCreateNote: () => void;
	onDeleteNote: (id: string) => void;
}

export const NotesPane = memo(function NotesPane({
	notes,
	activeNoteId,
	onSelectNote,
	onCreateNote,
	onDeleteNote,
}: NotesPaneProps) {
	return (
		<aside className="notesPane">
			<div className="notesPaneHeader">
				<h2 className="notesPaneTitle">Notes</h2>
				<button type="button" onClick={onCreateNote}>
					New
				</button>
			</div>
			<ul className="notesList">
				{notes.map((n) => {
					const isActive = n.id === activeNoteId;
					return (
						<li
							key={n.id}
							className={isActive ? "notesListItem active" : "notesListItem"}
						>
							<button
								type="button"
								className="notesListButton"
								onClick={() => onSelectNote(n.id)}
							>
								<div className="notesListTitle">{n.title || "Untitled"}</div>
								<div className="notesListMeta">{n.updated}</div>
							</button>
							<button
								type="button"
								className="notesListDelete"
								onClick={() => onDeleteNote(n.id)}
								aria-label={`Delete ${n.title}`}
								title="Delete note"
							>
								×
							</button>
						</li>
					);
				})}
			</ul>
		</aside>
	);
});
