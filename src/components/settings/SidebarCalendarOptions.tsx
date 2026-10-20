import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useUILayoutContext } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import type { SidebarCalendarDayClick, SidebarCalendarLayout } from "../../lib/settings/model";
import { toast } from "../../lib/toast";
import { SettingsRow, SettingsToggle } from "./SettingsScaffold";
import { SettingsSegmentedPicker } from "./SettingsSegmentedPicker";

const LAYOUTS = ["month", "week"] as const satisfies readonly SidebarCalendarLayout[];
const DAY_CLICKS = ["open", "select"] as const satisfies readonly SidebarCalendarDayClick[];

/** Indented options shown under the Calendar item while it is visible in the sidebar. */
export function SidebarCalendarOptions({ disabled }: { disabled: boolean }) {
	const { t } = useTranslation("settings.sidebar");
	const { sidebarCalendar, setSidebarCalendar } = useUILayoutContext();
	const update = useMutation({
		mutationFn: setSidebarCalendar,
		onError: (error) => {
			toast.error(t("calendarOptions.updateFailed"), {
				description: extractErrorMessage(error),
			});
		},
	});

	const layoutOptions = LAYOUTS.map((value) => ({
		value,
		label: t(`calendarOptions.layout.${value}`),
		description: t(`calendarOptions.layout.${value}`),
	}));
	const dayClickOptions = DAY_CLICKS.map((value) => ({
		value,
		label: t(`calendarOptions.dayClick.${value}`),
		description: t(`calendarOptions.dayClick.${value}`),
	}));

	return (
		<div className="settingsSidebarCalendarOptions">
			<SettingsRow
				label={t("calendarOptions.layout.label")}
				description={t("calendarOptions.layout.description")}
				interactive={false}
			>
				<SettingsSegmentedPicker
					ariaLabel={t("calendarOptions.layout.label")}
					value={sidebarCalendar.layout}
					options={layoutOptions}
					disabled={disabled}
					onChange={(layout) => update.mutate({ layout })}
					renderPreview={() => null}
				/>
			</SettingsRow>
			<SettingsRow
				label={t("calendarOptions.daySummary.label")}
				description={t("calendarOptions.daySummary.description")}
			>
				<SettingsToggle
					checked={sidebarCalendar.showDaySummary}
					disabled={disabled}
					ariaLabel={t("calendarOptions.daySummary.label")}
					onCheckedChange={(showDaySummary) => update.mutate({ showDaySummary })}
				/>
			</SettingsRow>
			<SettingsRow
				label={t("calendarOptions.dayClick.label")}
				description={t("calendarOptions.dayClick.description")}
				interactive={false}
			>
				<SettingsSegmentedPicker
					ariaLabel={t("calendarOptions.dayClick.label")}
					value={sidebarCalendar.dayClick}
					options={dayClickOptions}
					disabled={disabled}
					onChange={(dayClick) => update.mutate({ dayClick })}
					renderPreview={() => null}
				/>
			</SettingsRow>
		</div>
	);
}
