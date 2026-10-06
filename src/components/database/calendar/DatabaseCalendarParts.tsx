import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { useDraggable, useDroppable } from "@dnd-kit/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { MouseEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CalendarMode } from "../../../lib/database/calendar";
import type { DatabaseRow } from "../../../lib/database/types";
import { DATABASE_BOARD_CARD_SENSORS } from "../DatabaseBoardViews";

const CALENDAR_CARD_TYPE = "database-calendar-card";

interface CalendarHeaderProps {
	title: string;
	mode: CalendarMode;
	onModeChange: (mode: CalendarMode) => void;
	onShift: (delta: number) => void;
	onToday: () => void;
}

export function DatabaseCalendarHeader({
	title,
	mode,
	onModeChange,
	onShift,
	onToday,
}: CalendarHeaderProps) {
	const { t } = useTranslation("shell");
	return (
		<header className="databaseCalendarHeader">
			<h2 className="databaseCalendarTitle">{title}</h2>
			<div className="databaseCalendarControls">
				<div className="databaseCalendarModes" role="radiogroup">
					{(["month", "week"] as const).map((entry) => (
						<button
							key={entry}
							type="button"
							role="radio"
							aria-checked={mode === entry}
							className="databaseCalendarModeButton"
							data-active={mode === entry ? "true" : undefined}
							onClick={() => onModeChange(entry)}
						>
							{t(`collections.calendar.${entry}`)}
						</button>
					))}
				</div>
				<button type="button" className="calendarTodayButton" onClick={onToday}>
					{t("calendar.today")}
				</button>
				<button
					type="button"
					className="calendarNavButton"
					aria-label={t(`collections.calendar.previous_${mode}`)}
					onClick={() => onShift(-1)}
				>
					<HugeiconsIcon icon={ArrowLeft01Icon} size="var(--icon-lg)" />
				</button>
				<button
					type="button"
					className="calendarNavButton"
					aria-label={t(`collections.calendar.next_${mode}`)}
					onClick={() => onShift(1)}
				>
					<HugeiconsIcon icon={ArrowRight01Icon} size="var(--icon-lg)" />
				</button>
			</div>
		</header>
	);
}

interface CalendarDayProps {
	dateKey: string;
	dayNumber: number;
	label: string;
	isToday: boolean;
	isOutside: boolean;
	onCreate: () => void;
	children: ReactNode;
}

export function DatabaseCalendarDay({
	dateKey,
	dayNumber,
	label,
	isToday,
	isOutside,
	onCreate,
	children,
}: CalendarDayProps) {
	const { t } = useTranslation("shell");
	const { ref, isDropTarget } = useDroppable({
		id: `calendar-day:${dateKey}`,
		data: { dateKey },
		accept: CALENDAR_CARD_TYPE,
	});
	return (
		<div
			ref={ref}
			role="gridcell"
			aria-label={label}
			className="databaseCalendarDay"
			data-today={isToday ? "true" : undefined}
			data-outside={isOutside ? "true" : undefined}
			data-drop-target={isDropTarget ? "true" : undefined}
		>
			<div className="databaseCalendarDayNumber">{dayNumber}</div>
			<div className="databaseCalendarDayEntries">{children}</div>
			<button
				type="button"
				className="databaseCalendarDayCreate"
				aria-label={t("collections.calendar.newOnDay", { date: label })}
				title={t("collections.calendar.newOnDay", { date: label })}
				onClick={onCreate}
			/>
		</div>
	);
}

interface CalendarCardProps {
	row: DatabaseRow;
	dragId: string;
	title: string;
	groupLabel: string | null;
	continued: boolean;
	selected: boolean;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
	onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
}

export function DatabaseCalendarCard({
	row,
	dragId,
	title,
	groupLabel,
	continued,
	selected,
	onSelectRow,
	onOpenRow,
	onContextMenu,
}: CalendarCardProps) {
	const { t } = useTranslation("shell");
	const { ref, isDragging } = useDraggable({
		id: dragId,
		type: CALENDAR_CARD_TYPE,
		sensors: DATABASE_BOARD_CARD_SENSORS,
		data: { notePath: row.note_path },
	});
	return (
		<button
			ref={ref}
			type="button"
			className="databaseCalendarCard"
			data-state={selected ? "selected" : undefined}
			data-dragging={isDragging ? "true" : undefined}
			data-continued={continued ? "true" : undefined}
			title={t("collections.card.openHint")}
			onClick={() => onSelectRow(row.note_path)}
			onDoubleClick={() => onOpenRow(row.note_path)}
			onContextMenu={onContextMenu}
			onKeyDown={(event) => {
				if (event.key !== "Enter") return;
				event.preventDefault();
				onOpenRow(row.note_path);
			}}
		>
			<span className="databaseCalendarCardTitle">{title}</span>
			{groupLabel ? <span className="databaseCalendarCardGroup">{groupLabel}</span> : null}
		</button>
	);
}
