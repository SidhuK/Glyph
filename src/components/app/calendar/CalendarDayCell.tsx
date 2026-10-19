import { type MouseEvent, useEffect, useRef } from "react";
import type { CalendarDayTone } from "../../../lib/calendarActivity";

interface CalendarDayCellProps {
	date: Date;
	dateKey: string;
	label: string;
	tone: CalendarDayTone;
	isSelected: boolean;
	isToday: boolean;
	isOutside: boolean;
	/** The single day reachable by Tab; the rest are arrow-key targets. */
	isTabStop: boolean;
	shouldFocus: boolean;
	onSelect: (date: Date) => void;
	onContextMenu: (event: MouseEvent<HTMLButtonElement>, date: Date) => void;
}

export function CalendarDayCell({
	date,
	dateKey,
	label,
	tone,
	isSelected,
	isToday,
	isOutside,
	isTabStop,
	shouldFocus,
	onSelect,
	onContextMenu,
}: CalendarDayCellProps) {
	const ref = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (shouldFocus) ref.current?.focus();
	}, [shouldFocus]);

	return (
		<td className="calendarDayCell">
			<button
				ref={ref}
				type="button"
				className="calendarDay"
				data-date={dateKey}
				data-selected={isSelected}
				data-today={isToday}
				data-outside={isOutside}
				data-weekend={date.getDay() === 0 || date.getDay() === 6}
				tabIndex={isTabStop ? 0 : -1}
				aria-pressed={isSelected}
				aria-current={isToday ? "date" : undefined}
				aria-label={label}
				onClick={() => onSelect(date)}
				onContextMenu={(event) => onContextMenu(event, date)}
			>
				{date.getDate()}
				<span className="calendarDayMarker" data-tone={tone ?? "none"} />
			</button>
		</td>
	);
}
