import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { getTodayDateString } from "../../../lib/dailyNotes";
import { extractErrorMessage } from "../../../lib/errorUtils";
import { toast } from "../../../lib/toast";
import { SidebarActionButton } from "../sidebar/SidebarActionButton";
import type { OpenPeriodNoteAtDate } from "./useCalendarView";

interface SidebarCalendarRailButtonProps {
	onOpenPeriodNoteAtDate: OpenPeriodNoteAtDate;
}

/** The calendar's rail form: a plain rail icon that opens today's daily note, with the date
 * in its tooltip. CSS shows it only while the sidebar is the rail. */
export function SidebarCalendarRailButton({
	onOpenPeriodNoteAtDate,
}: SidebarCalendarRailButtonProps) {
	const { t, i18n } = useTranslation("shell");
	// Recomputed each render so the label survives a midnight rollover.
	const todayKey = getTodayDateString();
	const label = t("sidebarCalendar.openToday", {
		date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "full" }).format(parseISO(todayKey)),
	});

	const openToday = () => {
		onOpenPeriodNoteAtDate("day", todayKey).catch((error: unknown) => {
			toast.error(t("calendar.openFailed"), { description: extractErrorMessage(error) });
		});
	};

	return (
		<div className="sidebarCalendarRail">
			<SidebarActionButton icon={Calendar03Icon} label={label} onClick={openToday} />
		</div>
	);
}
