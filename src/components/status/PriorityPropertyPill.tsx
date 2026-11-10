import { useTranslation } from "react-i18next";
import { priorityTextStyle } from "../../lib/priorityProperties";
import { DatabasePriorityBars } from "./DatabasePriorityBars";
import { priorityDisplayLabel } from "./propertyOptionLabels";

interface PriorityPropertyPillProps {
	value: string | null | undefined;
	className?: string;
}

/** A priority value with the board's bar glyph, shared by the table, picker and inspector. */
export function PriorityPropertyPill({ value, className }: PriorityPropertyPillProps) {
	const { t } = useTranslation("shell");
	const label = priorityDisplayLabel(value, t);
	if (!label) return null;
	return (
		<span
			className={["propertyValueText", className].filter(Boolean).join(" ")}
			style={priorityTextStyle(value)}
			title={label}
		>
			<DatabasePriorityBars value={value} className="propertyValueTextIcon" />
			<span>{label}</span>
		</span>
	);
}
