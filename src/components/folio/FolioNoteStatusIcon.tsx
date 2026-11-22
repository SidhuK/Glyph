import { useTranslation } from "react-i18next";
import { statusToneStyle } from "../../lib/statusProperties";
import { StatusIcon } from "../status/StatusIcon";
import { statusDisplayLabel } from "../status/propertyOptionLabels";

export function FolioNoteStatusIcon({ status }: { status: string | null | undefined }) {
	const { t } = useTranslation("shell");
	const label = statusDisplayLabel(status, t);
	if (!label) return null;
	return (
		<span
			className="folioNoteStatus"
			role="img"
			aria-label={label}
			title={label}
			style={statusToneStyle(status)}
		>
			<StatusIcon value={status} className="folioNoteStatusIcon" />
		</span>
	);
}
