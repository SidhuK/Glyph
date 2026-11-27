import { parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import type { TaskDatePreset } from "./taskDatePickerModel";

interface TaskDatePresetRowProps {
	id: string;
	preset: TaskDatePreset;
	locale: string;
	active: boolean;
	onHover: () => void;
	onSelect: () => void;
}

const TRAILING_FORMAT: Record<TaskDatePreset["id"], Intl.DateTimeFormatOptions> = {
	query: { year: "numeric" },
	today: { weekday: "short" },
	tomorrow: { weekday: "short" },
	nextWeek: { weekday: "short", month: "short", day: "numeric" },
};

const QUERY_LABEL_FORMAT: Intl.DateTimeFormatOptions = {
	weekday: "long",
	month: "long",
	day: "numeric",
};

export function TaskDatePresetRow({
	id,
	preset,
	locale,
	active,
	onHover,
	onSelect,
}: TaskDatePresetRowProps) {
	const { t } = useTranslation("editor");
	const date = parseISO(preset.isoDate);
	const label =
		preset.id === "query"
			? new Intl.DateTimeFormat(locale, QUERY_LABEL_FORMAT).format(date)
			: t(`taskDatePicker.${preset.id}`);
	const trailing = new Intl.DateTimeFormat(locale, TRAILING_FORMAT[preset.id]).format(date);

	return (
		<div
			id={id}
			role="option"
			aria-selected={active}
			className="glyphMenuItem taskDatePickerPreset"
			data-highlighted={active ? "" : undefined}
			onMouseDown={(event) => event.preventDefault()}
			onPointerMove={() => {
				if (!active) onHover();
			}}
			onClick={onSelect}
		>
			<span className="glyphMenuItemLabel">{label}</span>
			<span className="glyphMenuItemTrailing">{trailing}</span>
		</div>
	);
}
