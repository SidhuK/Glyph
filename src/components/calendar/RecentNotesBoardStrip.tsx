import type { CalendarNoteActivityItem } from "../../lib/tauri";
import { FileText } from "../Icons";

interface RecentNotesBoardStripProps {
	notes: CalendarNoteActivityItem[];
	onOpenNote: (notePath: string) => void;
	onPrefetchNote?: (notePath: string) => void;
}

function fileTitleFromPath(notePath: string): string {
	const base = notePath.split("/").pop() ?? notePath;
	return base.replace(/\.md$/i, "");
}

function noteTitle(note: CalendarNoteActivityItem): string {
	const title = note.title.trim();
	return title || fileTitleFromPath(note.note_path);
}

export function RecentNotesBoardStrip({
	notes,
	onOpenNote,
	onPrefetchNote,
}: RecentNotesBoardStripProps) {
	return (
		<ul className="calendarRecentList">
			{notes.length === 0 ? (
				<li className="calendarRecentListEmpty">No notes for this day</li>
			) : null}
			{notes.map((note) => {
				const title = noteTitle(note);

				return (
					<li key={note.note_path} className="calendarRecentListRow">
						<button
							type="button"
							className="commandPaletteItem commandPaletteRecentItem calendarRecentListItem"
							onClick={() => onOpenNote(note.note_path)}
							onMouseEnter={() => onPrefetchNote?.(note.note_path)}
							onFocus={() => onPrefetchNote?.(note.note_path)}
							title="Open note"
						>
							<div className="commandPaletteRecentIcon">
								<FileText size={14} />
							</div>
							<div className="commandPaletteRecentContent">
								<span className="commandPaletteResultTitle">{title}</span>
							</div>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
