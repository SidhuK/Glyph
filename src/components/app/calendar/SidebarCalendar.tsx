import { useMutation } from "@tanstack/react-query";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useUILayoutContext } from "../../../contexts";
import { extractErrorMessage } from "../../../lib/errorUtils";
import { showNativeContextMenu } from "../../../lib/nativeContextMenu";
import { DURABLE_SETTINGS } from "../../../lib/settings/definitions";
import type { SidebarCalendarLayout } from "../../../lib/settings/model";
import { toast } from "../../../lib/toast";
import { CalendarView } from "./CalendarView";
import type { OpenPeriodNoteAtDate } from "./useCalendarView";

interface SidebarCalendarProps {
	onOpenPeriodNoteAtDate: OpenPeriodNoteAtDate;
	onOpenFile: (relPath: string) => void;
}

/** Calendar section pinned below the sidebar's file tree. */
export function SidebarCalendar({ onOpenPeriodNoteAtDate, onOpenFile }: SidebarCalendarProps) {
	const { t } = useTranslation("shell");
	const { sidebarCalendar: settings, setSidebarCalendar, sidebarVisibility } = useUILayoutContext();
	const reportUpdateFailure = (error: unknown) =>
		toast.error(t("sidebarCalendar.updateFailed"), { description: extractErrorMessage(error) });
	const setLayout = useMutation({
		mutationFn: (layout: SidebarCalendarLayout) => setSidebarCalendar({ layout }),
		onError: reportUpdateFailure,
	});
	const setCollapsed = useMutation({
		mutationFn: (collapsed: boolean) => setSidebarCalendar({ collapsed }),
		onError: reportUpdateFailure,
	});
	const hideCalendar = useMutation({
		mutationFn: () =>
			DURABLE_SETTINGS.sidebarVisibility.write({ ...sidebarVisibility, calendar: false }),
		onError: reportUpdateFailure,
	});

	const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
		const isWeek = settings.layout === "week";
		void showNativeContextMenu(event, [
			{
				label: isWeek
					? t("sidebarCalendar.menu.showMonth")
					: t("sidebarCalendar.menu.showWeekStrip"),
				action: () => setLayout.mutate(isWeek ? "month" : "week"),
			},
			{ type: "separator" },
			{ label: t("sidebarCalendar.menu.hide"), action: () => hideCalendar.mutate() },
		]).catch((error: unknown) => {
			console.error("Failed to show sidebar calendar context menu", error);
		});
	};

	return (
		<section
			className="sidebarCalendar"
			aria-label={t("sidebar.calendar")}
			onContextMenu={handleContextMenu}
		>
			<CalendarView
				layout={settings.layout}
				dayClick={settings.dayClick}
				showDaySummary={settings.showDaySummary}
				onOpenPeriodNoteAtDate={onOpenPeriodNoteAtDate}
				onOpenNote={onOpenFile}
				onShowMonth={() => setLayout.mutate("month")}
				collapse={{
					collapsed: settings.collapsed,
					onCollapsedChange: (collapsed) => setCollapsed.mutate(collapsed),
				}}
			/>
		</section>
	);
}
