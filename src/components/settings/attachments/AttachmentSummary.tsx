import { useTranslation } from "react-i18next";
import { formatBytes } from "./attachmentFormat";
import type { AttachmentTotals } from "./useAttachmentFilters";

interface AttachmentSummaryProps {
	all: AttachmentTotals;
	unused: AttachmentTotals;
}

export function AttachmentSummary({ all, unused }: AttachmentSummaryProps) {
	const { t, i18n } = useTranslation("settings.general");

	if (unused.count === 0) {
		return <span className="attachmentSummaryTitle">{t("attachments.summary.clear")}</span>;
	}

	return (
		<div className="attachmentSummary">
			<div className="attachmentSummaryHeadline">
				<span className="attachmentSummaryFigure">{formatBytes(unused.bytes, i18n.language)}</span>
				<span className="attachmentSummaryTitle">{t("attachments.summary.reclaimable")}</span>
			</div>
			<div className="attachmentSummaryFacts">
				{t("attachments.summary.facts", { unused: unused.count, total: all.count })}
			</div>
		</div>
	);
}
