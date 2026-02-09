import { memo } from "react";
import type { NoteMeta } from "../lib/tauri";
import { FileText, Plus, Trash2 } from "./Icons";
import { Button } from "./ui/shadcn/button";

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
				<h2 className="notesPaneTitle">
					<FileText size={14} />
					Notes
				</h2>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					onClick={onCreateNote}
					title="New note"
				>
					<Plus size={16} />
				</Button>
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
								<Trash2 size={14} />
							</button>
						</li>
					);
				})}
			</ul>
		</aside>
	);
});
