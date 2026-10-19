import { useTranslation } from "react-i18next";
import { useUILayoutContext } from "../../contexts";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";
import { CalendarView } from "./calendar/CalendarView";
import type { OpenPeriodNoteAtDate } from "./calendar/useCalendarView";

interface CalendarPaletteProps {
	open: boolean;
	onClose: () => void;
	onOpenNote: (path: string) => void;
	onOpenPeriodNoteAtDate: OpenPeriodNoteAtDate;
}

/** The sidebar calendar in a dialog: full month with the day summary, closing on open. */
export function CalendarPalette({
	open,
	onClose,
	onOpenNote,
	onOpenPeriodNoteAtDate,
}: CalendarPaletteProps) {
	const { t } = useTranslation("shell");
	const { sidebarCalendar } = useUILayoutContext();

	const handleOpenPeriodNote: OpenPeriodNoteAtDate = (kind, date) => {
		onClose();
		return onOpenPeriodNoteAtDate(kind, date);
	};

	const handleOpenNote = (path: string) => {
		onClose();
		onOpenNote(path);
	};

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent
				className="calendarPalette top-[46%] gap-0 border-none p-0 sm:max-w-[320px]"
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">{t("calendar.title")}</DialogTitle>
				<CalendarView
					layout="month"
					dayClick={sidebarCalendar.dayClick}
					showDaySummary
					onOpenPeriodNoteAtDate={handleOpenPeriodNote}
					onOpenNote={handleOpenNote}
				/>
			</DialogContent>
		</Dialog>
	);
}
