import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { weekStartsOnForLocale } from "../calendar/monthGrid";
import { ActivityHeatmapGrid } from "./ActivityHeatmapGrid";
import type { ActivityDay } from "./activityDays";
import { type HeatmapPeriod, buildHeatmap, heatmapPeriods } from "./heatmapModel";
import { useActivityDateLabel } from "./useActivityDateLabel";

const LEGEND_LEVELS = [0, 1, 2, 3, 4] as const;

interface ActivityHeatmapProps {
	days: Map<string, ActivityDay>;
	today: Date;
	selectedDayKey: string | null;
	onSelectDay: (dateKey: string | null) => void;
}

export const ActivityHeatmap = memo(function ActivityHeatmap({
	days,
	today,
	selectedDayKey,
	onSelectDay,
}: ActivityHeatmapProps) {
	const { t, i18n } = useTranslation("shell");
	const [requestedPeriod, setPeriod] = useState<HeatmapPeriod>(null);
	const formatDate = useActivityDateLabel("full");
	const weekStartsOn = weekStartsOnForLocale(i18n.language);
	const periods = useMemo(() => heatmapPeriods(days, today), [days, today]);
	// A year from another space's history falls back to the trailing year.
	const period = periods.includes(requestedPeriod) ? requestedPeriod : null;
	const heatmap = useMemo(
		() => buildHeatmap({ days, period, today, weekStartsOn }),
		[days, period, today, weekStartsOn],
	);
	const periodIndex = periods.indexOf(period);
	const olderPeriod = periods[periodIndex + 1];
	const newerPeriod = periodIndex > 0 ? periods[periodIndex - 1] : undefined;
	const periodLabel =
		period === null
			? t("activity.pastYear")
			: new Intl.DateTimeFormat(i18n.language, { year: "numeric" }).format(new Date(period, 0, 1));

	return (
		<div className="activityHeatmapBlock">
			<div className="activityHeatmapToolbar">
				<p className="activityHeatmapSummary" title={t("activity.summaryHint")}>
					{heatmap.stats.notes === 0
						? t("activity.noActivityInPeriod")
						: `${t("activity.notesCount", { count: heatmap.stats.notes })} · ${t(
								"activity.activeDays",
								{ count: heatmap.stats.activeDays },
							)}`}
				</p>
				<div className="activityHeatmapPeriod">
					<button
						type="button"
						className="calendarNavButton"
						aria-label={t("activity.previousPeriod")}
						disabled={olderPeriod === undefined}
						onClick={() => olderPeriod !== undefined && setPeriod(olderPeriod)}
					>
						<HugeiconsIcon icon={ArrowLeft01Icon} size="var(--icon-md)" />
					</button>
					<span className="activityHeatmapPeriodLabel" aria-live="polite">
						{periodLabel}
					</span>
					<button
						type="button"
						className="calendarNavButton"
						aria-label={t("activity.nextPeriod")}
						disabled={newerPeriod === undefined}
						onClick={() => newerPeriod !== undefined && setPeriod(newerPeriod)}
					>
						<HugeiconsIcon icon={ArrowRight01Icon} size="var(--icon-md)" />
					</button>
				</div>
			</div>
			<div className="activityHeatmapScroller">
				<ActivityHeatmapGrid
					key={period ?? "past"}
					weeks={heatmap.weeks}
					days={days}
					today={today}
					weekStartsOn={weekStartsOn}
					selectedDayKey={selectedDayKey}
					formatDate={formatDate}
					onSelectDay={onSelectDay}
				/>
			</div>
			<div className="activityHeatmapLegend" aria-hidden="true">
				{t("activity.less")}
				{LEGEND_LEVELS.map((level) => (
					<span key={level} className="activityHeatmapLegendCell" data-level={level} />
				))}
				{t("activity.more")}
			</div>
		</div>
	);
});
