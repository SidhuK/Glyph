import { useTranslation } from "react-i18next";
import { statusTextStyle } from "../../lib/statusProperties";
import type { EditorTextColor } from "../editor/textColors";
import { StatusRingIcon } from "./StatusRingIcon";
import { statusDisplayLabel } from "./propertyOptionLabels";

interface StatusPropertyPillProps {
	value: string | null | undefined;
	colors?: Record<string, EditorTextColor>;
	className?: string;
}

export function StatusPropertyPill({ value, colors = {}, className }: StatusPropertyPillProps) {
	const { t } = useTranslation("shell");
	const label = statusDisplayLabel(value, t);
	if (!label) return null;
	return (
		<span
			className={["propertyValueText", className].filter(Boolean).join(" ")}
			data-property-kind="status"
			style={statusTextStyle(value, colors)}
			title={label}
		>
			<StatusRingIcon value={value} className="propertyValueTextIcon" />
			<span>{label}</span>
		</span>
	);
}
