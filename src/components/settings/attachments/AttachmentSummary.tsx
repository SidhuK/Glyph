import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "./attachmentFormat";
import type { AttachmentTotals } from "./useAttachmentFilters";

interface AttachmentSummaryProps {
	all: AttachmentTotals;
	unused: AttachmentTotals;
	noteCount: number;
}

export function AttachmentSummary({ all, unused, noteCount }: AttachmentSummaryProps) {
	const { t, i18n } = useTranslation("settings.general");

	if (unused.count === 0) {
		return (
			<div className="attachmentSummary" data-state="clear">
				<div className="attachmentSummaryHeadline">
					<HugeiconsIcon icon={CheckmarkCircle02Icon} size="var(--icon-lg)" aria-hidden="true" />
					<span className="attachmentSummaryTitle">{t("developer.attachments.summary.clear")}</span>
				</div>
				<div className="attachmentSummaryFacts">
					{t("developer.attachments.summary.clearFacts", { total: all.count, notes: noteCount })}
				</div>
			</div>
		);
	}

	const share = all.bytes > 0 ? Math.max(2, Math.round((unused.bytes / all.bytes) * 100)) : 0;
	return (
		<div className="attachmentSummary">
			<div className="attachmentSummaryHeadline">
				<span className="attachmentSummaryFigure">{formatBytes(unused.bytes, i18n.language)}</span>
				<span className="attachmentSummaryTitle">
					{t("developer.attachments.summary.reclaimable")}
				</span>
			</div>
			<div className="attachmentSummaryMeter" aria-hidden="true">
				<span style={{ width: `${share}%` }} />
			</div>
			<div className="attachmentSummaryFacts">
				{t("developer.attachments.summary.facts", {
					unused: unused.count,
					total: all.count,
					size: formatBytes(all.bytes, i18n.language),
					notes: noteCount,
				})}
			</div>
		</div>
	);
}
