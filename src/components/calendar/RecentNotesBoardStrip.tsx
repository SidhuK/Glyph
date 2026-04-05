import { m, useReducedMotion } from "motion/react";
import { formatDatabaseDateTime } from "../../lib/database/config";
import type { CalendarNoteActivityItem } from "../../lib/tauri";
import { formatDatabaseTagLabel } from "../database/databaseTagLabel";
import { springPresets } from "../ui/animations";

interface RecentNotesBoardStripProps {
	notes: CalendarNoteActivityItem[];
	selectedNotePath: string | null;
	onSelectNote: (notePath: string) => void;
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

function notePreview(note: CalendarNoteActivityItem): string | null {
	const preview = (note.preview ?? "").replace(/\s+/g, " ").trim();
	return preview || null;
}

function noteFolderLabel(notePath: string): string {
	const parts = notePath.split("/").filter(Boolean);
	if (parts.length <= 1) return "Workspace root";
	return parts.slice(0, -1).join(" / ");
}

export function RecentNotesBoardStrip({
	notes,
	selectedNotePath,
	onSelectNote,
	onOpenNote,
	onPrefetchNote,
}: RecentNotesBoardStripProps) {
	const shouldReduceMotion = useReducedMotion() ?? false;

	return (
		<div className="calendarRecentStrip">
			<div className="calendarRecentStripScroller">
				{notes.map((note, index) => {
					const title = noteTitle(note);
					const preview = notePreview(note);
					const folderLabel = noteFolderLabel(note.note_path);
					const visibleTags = note.tags.slice(0, 3);
					const extraTagCount = Math.max(
						note.tags.length - visibleTags.length,
						0,
					);

					return (
						<m.button
							key={note.note_path}
							type="button"
							className="databaseBoardCard calendarRecentStripCard"
							data-state={
								selectedNotePath === note.note_path ? "selected" : undefined
							}
							onClick={() => onSelectNote(note.note_path)}
							onMouseEnter={() => onPrefetchNote?.(note.note_path)}
							onFocus={() => onPrefetchNote?.(note.note_path)}
							onDoubleClick={() => onOpenNote(note.note_path)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									onOpenNote(note.note_path);
									return;
								}
								if (event.key === " ") {
									event.preventDefault();
									onSelectNote(note.note_path);
								}
							}}
							initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={
								shouldReduceMotion
									? { duration: 0 }
									: {
											...springPresets.gentle,
											delay: Math.min(index * 0.03, 0.15),
										}
							}
							title="Double-click to open note"
						>
							<div className="databaseBoardCardHead">
								<div className="databaseBoardCardHeaderRow">
									<span className="databaseBoardCardTitle">{title}</span>
									<span className="databaseBoardCardOpenHint">Open</span>
								</div>
								{preview ? (
									<div className="databaseBoardCardPreview">{preview}</div>
								) : null}
							</div>
							{visibleTags.length > 0 ? (
								<div className="databaseBoardCardTags calendarRecentStripTags">
									{visibleTags.map((tag) => (
										<span
											key={`${note.note_path}:${tag}`}
											className="databaseBoardTag"
											title={formatDatabaseTagLabel(tag)}
										>
											{formatDatabaseTagLabel(tag)}
										</span>
									))}
									{extraTagCount > 0 ? (
										<span className="databaseBoardTag is-muted">
											+{extraTagCount}
										</span>
									) : null}
								</div>
							) : null}
							<div className="databaseBoardCardFooter">
								<span className="databaseBoardCardPath" title={folderLabel}>
									{folderLabel}
								</span>
								<span className="databaseBoardCardTimestamp">
									{formatDatabaseDateTime(note.updated)}
								</span>
							</div>
						</m.button>
					);
				})}
			</div>
		</div>
	);
}
