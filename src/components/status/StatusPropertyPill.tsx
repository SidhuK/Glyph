import { statusLabel, statusTextStyle } from "../../lib/statusProperties";
import type { EditorTextColor } from "../editor/textColors";
import { StatusRingIcon } from "./StatusRingIcon";

interface StatusPropertyPillProps {
	value: string | null | undefined;
	colors?: Record<string, EditorTextColor>;
	className?: string;
}

export function StatusPropertyPill({ value, colors = {}, className }: StatusPropertyPillProps) {
	const label = statusLabel(value);
	if (!label) return null;
	return (
		<span
			className={["propertyValueText", className].filter(Boolean).join(" ")}
			style={statusTextStyle(value, colors)}
			title={label}
		>
			<StatusRingIcon value={value} className="propertyValueTextIcon" />
			<span>{label}</span>
		</span>
	);
}
