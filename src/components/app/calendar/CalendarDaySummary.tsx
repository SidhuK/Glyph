import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Calendar03Icon, NoteIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { isSameDay } from "date-fns";
import { useTranslation } from "react-i18next";
import { useUILayoutContext } from "../../../contexts";
import { useCalendarDayNotes } from "./useCalendarQueries";

interface CalendarDaySummaryProps {
	selectedKey: string;
	selectedDate: Date;
	today: Date;
	locale: string;
	/** From the month activity, so the row is right before the day's notes load. */
	hasDailyNoteActivity: boolean;
	onOpenDailyNote: () => void;
	onOpenNote: (path: string) => void;
}

/** Selected day at a glance: its daily note and the other notes created or edited that day. */
export function CalendarDaySummary({
	selectedKey,
	selectedDate,
	today,
	locale,
	hasDailyNoteActivity,
	onOpenDailyNote,
	onOpenNote,
}: CalendarDaySummaryProps) {
	const { t } = useTranslation("shell");
	const { dailyNotesFolder } = useUILayoutContext();
	const { notes, isPending, errorMessage } = useCalendarDayNotes(selectedKey);
	const dailyNote = notes.find((note) => note.kinds.includes("daily"));
	const otherNotes = notes.filter((note) => note !== dailyNote);
	const hasDailyNote = dailyNote !== undefined || hasDailyNoteActivity;
	const dateLabel = new Intl.DateTimeFormat(locale, {
		weekday: "long",
		month: "short",
		day: "numeric",
	}).format(selectedDate);

	return (
		<section className="calendarSummary" aria-label={dateLabel}>
			<header className="calendarSummaryDate">
				{isSameDay(selectedDate, today) ? t("calendar.todayDate", { date: dateLabel }) : dateLabel}
			</header>
			{dailyNotesFolder ? (
				<button
					type="button"
					className="calendarRow"
					data-kind={hasDailyNote ? "daily" : "create"}
					onClick={onOpenDailyNote}
				>
					<span className="calendarRowIcon" aria-hidden="true">
						<HugeiconsIcon
							icon={hasDailyNote ? Calendar03Icon : PlusSignIcon}
							size="var(--icon-xs)"
						/>
					</span>
					<span className="calendarRowText">
						{hasDailyNote ? (dailyNote?.title ?? selectedKey) : t("calendar.createDailyNote")}
					</span>
				</button>
			) : (
				<p
					className="calendarMessage calendarSummarySlot"
					title={t("calendar.dailyNotesNotConfigured")}
				>
					{t("calendar.dailyNotesNotConfigured")}
				</p>
			)}
			{/* Fixed at two rows (scrolling past that) so the card keeps its size from day to day. */}
			<div className="calendarSummaryNotes">
				{isPending ? (
					<p className="calendarMessage">{t("calendar.loading")}</p>
				) : errorMessage ? (
					<p className="calendarMessage" role="alert">
						{t("calendar.loadFailed", { message: errorMessage })}
					</p>
				) : otherNotes.length === 0 ? (
					<p className="calendarMessage">{t("calendar.noOtherNotes")}</p>
				) : (
					<ul className="calendarSummaryList">
						{otherNotes.map((note) => (
							<li key={note.path}>
								<button
									type="button"
									className="calendarRow"
									title={note.path}
									onClick={() => onOpenNote(note.path)}
								>
									<span className="calendarRowIcon" aria-hidden="true">
										<HugeiconsIcon icon={NoteIcon} size="var(--icon-xs)" />
									</span>
									<span className="calendarRowText">{note.title}</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</section>
	);
}
