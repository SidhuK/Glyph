import { Delete02Icon, FileAttachmentIcon, HardDriveIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/shadcn/button";
import { formatBytes } from "./attachmentFormat";
import type { AttachmentFilters } from "./useAttachmentFilters";

interface AttachmentListHeaderProps {
	filters: AttachmentFilters;
	trashPending: boolean;
	onTrash: () => void;
}

export function AttachmentListHeader({
	filters,
	trashPending,
	onTrash,
}: AttachmentListHeaderProps) {
	const { t, i18n } = useTranslation("settings.general");
	const active = filters.selected.length > 0;

	return (
		<div className="attachmentListHeader" data-active={active || undefined}>
			<label className="attachmentListHeaderMain">
				<input
					type="checkbox"
					checked={filters.allSelected}
					disabled={!filters.hasSelectable}
					aria-label={t("developer.attachments.selectAllUnused")}
					onChange={(event) => filters.setAllSelected(event.target.checked)}
				/>
				{active ? (
					<span>
						{t("developer.attachments.selectedSummary", {
							count: filters.selectedTotals.count,
							size: formatBytes(filters.selectedTotals.bytes, i18n.language),
						})}
					</span>
				) : (
					<span className="attachmentColumnIcon">
						<HugeiconsIcon icon={FileAttachmentIcon} size="var(--icon-sm)" aria-hidden="true" />
						<span>{t("developer.attachments.columns.name")}</span>
					</span>
				)}
			</label>
			{active ? (
				<div className="attachmentListHeaderActions">
					<Button type="button" variant="ghost" size="sm" onClick={filters.clearSelection}>
						{t("developer.attachments.clearSelection")}
					</Button>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						disabled={trashPending}
						onClick={onTrash}
					>
						<HugeiconsIcon icon={Delete02Icon} />
						{t("developer.attachments.moveToTrash")}
					</Button>
				</div>
			) : (
				<span className="attachmentColumnSize attachmentColumnIcon">
					<HugeiconsIcon icon={HardDriveIcon} size="var(--icon-sm)" aria-hidden="true" />
					<span>{t("developer.attachments.columns.size")}</span>
				</span>
			)}
		</div>
	);
}
