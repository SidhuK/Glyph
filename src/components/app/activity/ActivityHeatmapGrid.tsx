import type { Day } from "date-fns";
import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent } from "../../ui/shadcn/popover";
import { dateForNavigationKey, weekdayLabels } from "../calendar/monthGrid";
import { ActivityHeatmapDayPreview } from "./ActivityHeatmapDayPreview";
import { type ActivityDay, activityDateKey } from "./activityDays";
import type { HeatmapCell, HeatmapWeek } from "./heatmapModel";

/** Weeks run left to right, so horizontal arrows step a week and vertical arrows step a day. */
const HEATMAP_TO_CALENDAR_KEY: Record<string, string> = {
	ArrowLeft: "ArrowUp",
	ArrowRight: "ArrowDown",
	ArrowUp: "ArrowLeft",
	ArrowDown: "ArrowRight",
};

/** Mon, Wed and Fri, as `Date#getDay()` numbers. */
const LABELED_WEEKDAYS = new Set([1, 3, 5]);

const focusElement = (node: HTMLElement | null) => node?.focus();

interface ActivityHeatmapGridProps {
	weeks: HeatmapWeek[];
	days: Map<string, ActivityDay>;
	today: Date;
	weekStartsOn: Day;
	selectedDayKey: string | null;
	formatDate: (date: Date) => string;
	onSelectDay: (dateKey: string | null) => void;
}

export function ActivityHeatmapGrid({
	weeks,
	days,
	today,
	weekStartsOn,
	selectedDayKey,
	formatDate,
	onSelectDay,
}: ActivityHeatmapGridProps) {
	const { t, i18n } = useTranslation("shell");
	const [focusedKey, setFocusedKey] = useState<string | null>(null);
	const [preview, setPreview] = useState<{ cell: HeatmapCell; anchor: HTMLElement } | null>(null);
	const weekdays = useMemo(
		() => weekdayLabels(i18n.language, weekStartsOn),
		[i18n.language, weekStartsOn],
	);
	const monthFormatter = useMemo(
		() => new Intl.DateTimeFormat(i18n.language, { month: "short" }),
		[i18n.language],
	);
	const { cellsByKey, lastKey } = useMemo(() => {
		const cells = new Map<string, { cell: HeatmapCell; label: string }>();
		let last: string | null = null;
		for (const week of weeks) {
			for (const cell of week.days) {
				if (!cell) continue;
				const label = t("activity.daySummary", { count: cell.count, date: formatDate(cell.date) });
				cells.set(cell.dateKey, { cell, label });
				last = cell.dateKey;
			}
		}
		return { cellsByKey: cells, lastKey: last };
	}, [weeks, formatDate, t]);

	const todayKey = activityDateKey(today);
	const tabStopKey = [focusedKey, selectedDayKey, todayKey, lastKey].find(
		(key) => key !== null && cellsByKey.has(key),
	);

	const cellFromEvent = (event: React.SyntheticEvent) =>
		event.target instanceof HTMLElement
			? (cellsByKey.get(event.target.dataset.date ?? "")?.cell ?? null)
			: null;

	const showPreview = (event: React.SyntheticEvent) => {
		const cell = cellFromEvent(event);
		if (cell && event.target instanceof HTMLElement) setPreview({ cell, anchor: event.target });
		// Gaps between cells hit the grid itself; keep the preview so it doesn't flicker.
		else if (event.target !== event.currentTarget) setPreview(null);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		const cell = cellFromEvent(event);
		if (!cell) return;
		if (event.key === "Escape") {
			setPreview(null);
			onSelectDay(null);
			return;
		}
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			if (cell.count > 0) onSelectDay(cell.dateKey);
			return;
		}
		const key = HEATMAP_TO_CALENDAR_KEY[event.key] ?? event.key;
		const next = dateForNavigationKey(key, cell.date, weekStartsOn);
		if (!next) return;
		event.preventDefault();
		const nextKey = activityDateKey(next);
		if (cellsByKey.has(nextKey)) setFocusedKey(nextKey);
	};

	return (
		<Popover
			open={preview !== null}
			// The grid owns open state; outside-press and focus-out dismissal would race arrow-key moves.
			onOpenChange={(open, details) => {
				if (open || details.reason !== "escape-key") {
					details.cancel();
					return;
				}
				setPreview(null);
			}}
		>
			<div
				role="grid"
				aria-label={t("activity.recentActivity")}
				className="activityHeatmapGrid"
				style={{
					gridTemplateColumns: `auto repeat(${weeks.length}, var(--activity-heatmap-cell))`,
				}}
				onKeyDown={handleKeyDown}
				onPointerOver={showPreview}
				onPointerLeave={() => setPreview(null)}
				onFocus={(event) => {
					showPreview(event);
					const cell = cellFromEvent(event);
					if (cell) setFocusedKey(cell.dateKey);
				}}
				onBlur={(event) => {
					const next = event.relatedTarget;
					if (!(next instanceof Node) || !event.currentTarget.contains(next)) setPreview(null);
				}}
				onClick={(event) => {
					const cell = cellFromEvent(event);
					if (cell && cell.count > 0) onSelectDay(cell.dateKey);
				}}
			>
				<div className="activityHeatmapRow" aria-hidden="true">
					<span />
					{weeks.map((week) => (
						<span key={week.key} className="activityHeatmapMonth">
							{week.monthStart ? monthFormatter.format(week.monthStart) : ""}
						</span>
					))}
				</div>
				{weekdays.map((weekday, row) => (
					<div key={weekday.long} role="row" className="activityHeatmapRow">
						<span role="rowheader" className="activityHeatmapWeekday" aria-label={weekday.long}>
							{LABELED_WEEKDAYS.has((weekStartsOn + row) % 7) ? weekday.short : ""}
						</span>
						{weeks.map((week) => {
							const cell = week.days[row];
							if (!cell) {
								return <span key={week.key} role="gridcell" className="activityHeatmapPad" />;
							}
							return (
								<HeatmapDayCell
									key={cell.dateKey}
									cell={cell}
									label={cellsByKey.get(cell.dateKey)?.label ?? ""}
									isSelected={cell.dateKey === selectedDayKey}
									isToday={cell.dateKey === todayKey}
									isTabStop={cell.dateKey === tabStopKey}
									shouldFocus={cell.dateKey === focusedKey}
								/>
							);
						})}
					</div>
				))}
			</div>
			{preview ? (
				<PopoverContent
					anchor={preview.anchor}
					side="top"
					sideOffset={6}
					collisionPadding={12}
					className="activityHeatmapPreview"
					initialFocus={false}
					finalFocus={false}
				>
					<ActivityHeatmapDayPreview
						day={days.get(preview.cell.dateKey)}
						dateLabel={formatDate(preview.cell.date)}
					/>
				</PopoverContent>
			) : null}
		</Popover>
	);
}

interface HeatmapDayCellProps {
	cell: HeatmapCell;
	label: string;
	isSelected: boolean;
	isToday: boolean;
	isTabStop: boolean;
	shouldFocus: boolean;
}

const HeatmapDayCell = memo(function HeatmapDayCell({
	cell,
	label,
	isSelected,
	isToday,
	isTabStop,
	shouldFocus,
}: HeatmapDayCellProps) {
	return (
		<div
			ref={shouldFocus ? focusElement : undefined}
			role="gridcell"
			className="activityHeatmapCell"
			data-date={cell.dateKey}
			data-level={cell.level}
			data-selectable={cell.count > 0 || undefined}
			data-today={isToday || undefined}
			aria-selected={isSelected}
			aria-current={isToday ? "date" : undefined}
			aria-label={label}
			tabIndex={isTabStop ? 0 : -1}
		/>
	);
});
