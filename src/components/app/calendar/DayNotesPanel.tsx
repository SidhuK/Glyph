import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Calendar03Icon, NoteIcon } from "@hugeicons/core-free-icons";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PERIOD_KINDS, type PeriodKind } from "../../../lib/periodNotes";
import type { CalendarDateNote } from "../../../lib/tauri";

interface DayNotesPanelProps {
	selectedDate: Date;
	locale: string;
	notes: CalendarDateNote[];
	isLoading: boolean;
	errorMessage: string | null;
	canOpenDatedNotes: boolean;
	onOpenPeriodNote: (kind: PeriodKind) => void;
	onOpenNote: (path: string) => void;
}

function folderOf(path: string): string | null {
	const separator = path.lastIndexOf("/");
	return separator > 0 ? path.slice(0, separator) : null;
}

function NoteRow({
	note,
	onOpen,
}: {
	note: CalendarDateNote;
	onOpen: (path: string) => void;
}) {
	const isDaily = note.kinds.includes("daily");
	const folder = folderOf(note.path);

	return (
		<li>
			<button
				type="button"
				className="calendarNoteRow"
				onClick={() => onOpen(note.path)}
			>
				<span className="calendarNoteIcon" data-daily={isDaily}>
					<HugeiconsIcon
						icon={isDaily ? Calendar03Icon : NoteIcon}
						size="var(--icon-md)"
					/>
				</span>
				<span className="calendarNoteText">
					<span className="calendarNoteTitle">{note.title}</span>
					{folder ? <span className="calendarNoteFolder">{folder}</span> : null}
				</span>
			</button>
		</li>
	);
}

export function DayNotesPanel({
	selectedDate,
	locale,
	notes,
	isLoading,
	errorMessage,
	canOpenDatedNotes,
	onOpenPeriodNote,
	onOpenNote,
}: DayNotesPanelProps) {
	const { t } = useTranslation("shell");

	const heading = useMemo(
		() =>
			new Intl.DateTimeFormat(locale, {
				weekday: "long",
				month: "long",
				day: "numeric",
			}).format(selectedDate),
		[locale, selectedDate],
	);

	const summary = isLoading
		? t("calendar.loading")
		: errorMessage
			? t("calendar.loadFailedShort")
			: notes.length > 0
				? t("calendar.noteCount", { count: notes.length })
				: null;

	return (
		<section className="calendarNotes">
			<header className="calendarNotesHeader">
				<div className="calendarNotesHeading">
					<h3 className="calendarNotesTitle">{heading}</h3>
					{summary ? <p className="calendarNotesSummary">{summary}</p> : null}
				</div>
				{canOpenDatedNotes ? (
					<div className="calendarPeriodNoteActions">
						{PERIOD_KINDS.map((kind) => (
							<button
								key={kind}
								type="button"
								className="calendarDailyNoteButton"
								onClick={() => onOpenPeriodNote(kind)}
							>
								{t(`calendar.openPeriodNote.${kind}`)}
							</button>
						))}
					</div>
				) : null}
			</header>

			<div className="calendarNotesBody">
				{isLoading ? (
					<ul className="calendarNotesList" aria-hidden="true">
						{[0, 1, 2].map((row) => (
							<li key={row} className="calendarNoteSkeleton" />
						))}
					</ul>
				) : errorMessage ? (
					<p className="calendarNotesMessage" role="alert">
						{t("calendar.loadFailed", { message: errorMessage })}
					</p>
				) : notes.length > 0 ? (
					<ul className="calendarNotesList">
						{notes.map((note) => (
							<NoteRow key={note.path} note={note} onOpen={onOpenNote} />
						))}
					</ul>
				) : (
					<p className="calendarNotesEmpty">{t("calendar.noNotes")}</p>
				)}
			</div>
		</section>
	);
}
