import { useTranslation } from "react-i18next";
import { statusToneStyle } from "../../lib/statusProperties";
import type { EditorTextColor } from "../editor/textColors";
import { StatusIcon } from "../status/StatusIcon";
import { statusDisplayLabel } from "../status/propertyOptionLabels";

interface FolioNoteStatusIconProps {
	status: string | null | undefined;
	colors: Record<string, EditorTextColor>;
}

export function FolioNoteStatusIcon({ status, colors }: FolioNoteStatusIconProps) {
	const { t } = useTranslation("shell");
	const label = statusDisplayLabel(status, t);
	if (!label) return null;
	return (
		<span
			className="folioNoteStatus"
			role="img"
			aria-label={label}
			title={label}
			style={statusToneStyle(status, colors)}
		>
			<StatusIcon value={status} className="folioNoteStatusIcon" />
		</span>
	);
}
