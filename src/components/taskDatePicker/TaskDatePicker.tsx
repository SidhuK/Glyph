import { isSameMonth, parseISO, startOfDay } from "date-fns";
import { type KeyboardEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toIsoDate } from "../../lib/taskFields/naturalDate";
import { buildVisibleWeeks, weekStartsOnForLocale } from "../app/calendar/monthGrid";
import { TaskDatePickerCalendar } from "./TaskDatePickerCalendar";
import { TaskDatePresetRow } from "./TaskDatePresetRow";
import {
	type TaskDatePickerView,
	focusedIsoDate,
	navigateTaskDatePicker,
	taskDatePresets,
} from "./taskDatePickerModel";
import "./taskDatePicker.css";

interface TaskDatePickerProps {
	value: string | null;
	onSelect: (isoDate: string) => void;
	onRemove?: () => void;
	query?: string;
}

function initialView(value: string | null, today: Date): TaskDatePickerView {
	return { focus: { kind: "preset", index: 0 }, month: value ? parseISO(value) : today };
}

function gridEntryDate(value: string | null, today: Date, month: Date): Date {
	const selected = value ? parseISO(value) : null;
	if (selected && isSameMonth(selected, month)) return selected;
	return isSameMonth(today, month) ? today : new Date(month.getFullYear(), month.getMonth(), 1);
}

export function TaskDatePicker({ value, onSelect, onRemove, query }: TaskDatePickerProps) {
	const { t, i18n } = useTranslation("editor");
	const idPrefix = useId();
	const today = startOfDay(new Date());
	const [view, setView] = useState(() => initialView(value, today));
	const locale = i18n.language;
	const weekStartsOn = weekStartsOnForLocale(locale);
	const weeks = buildVisibleWeeks(view.month, weekStartsOn, "month");
	const presets = taskDatePresets(today, query);
	const activeIso = focusedIsoDate(view.focus, presets);
	const presetId = (index: number) => `${idPrefix}-preset-${index}`;
	const dayId = (isoDate: string) => `${idPrefix}-day-${isoDate}`;
	const activeDescendant =
		view.focus.kind === "preset" ? presetId(view.focus.index) : dayId(view.focus.isoDate);

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.target !== event.currentTarget) return;
		if (event.key === "Enter") {
			if (!activeIso) return;
			event.preventDefault();
			onSelect(activeIso);
			return;
		}
		const next = navigateTaskDatePicker({
			key: event.key,
			view,
			presets,
			firstGridDay: weeks[0][0],
			gridEntryDate: gridEntryDate(value, today, view.month),
			weekStartsOn,
		});
		if (!next) return;
		event.preventDefault();
		setView(next);
	};

	return (
		<div
			className="taskDatePicker"
			role="group"
			tabIndex={0}
			aria-label={t("taskDatePicker.label")}
			aria-activedescendant={activeDescendant}
			onKeyDown={handleKeyDown}
		>
			<div className="taskDatePickerPresets" role="listbox">
				{presets.map((preset, index) => (
					<TaskDatePresetRow
						key={preset.id}
						id={presetId(index)}
						preset={preset}
						locale={locale}
						active={view.focus.kind === "preset" && view.focus.index === index}
						onHover={() => setView({ ...view, focus: { kind: "preset", index } })}
						onSelect={() => onSelect(preset.isoDate)}
					/>
				))}
			</div>
			<div className="glyphMenuSeparator" />
			<TaskDatePickerCalendar
				month={view.month}
				weeks={weeks}
				locale={locale}
				weekStartsOn={weekStartsOn}
				todayIso={toIsoDate(today)}
				selectedIso={value}
				focusedIso={view.focus.kind === "day" ? view.focus.isoDate : null}
				dayId={dayId}
				onMonthChange={(month) => setView({ ...view, month })}
				onSelect={onSelect}
				onHoverDay={(isoDate) => {
					if (activeDescendant !== dayId(isoDate)) {
						setView({ ...view, focus: { kind: "day", isoDate } });
					}
				}}
			/>
			{onRemove ? (
				<>
					<div className="glyphMenuSeparator" />
					<button
						type="button"
						className="glyphMenuItem taskDatePickerRemove"
						data-variant="destructive"
						onMouseDown={(event) => event.preventDefault()}
						onClick={onRemove}
					>
						<span className="glyphMenuItemLabel">{t("taskDatePicker.remove")}</span>
					</button>
				</>
			) : null}
		</div>
	);
}
