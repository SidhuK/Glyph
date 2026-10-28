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
					aria-label={t("attachments.selectAllUnused")}
					onChange={(event) => filters.setAllSelected(event.target.checked)}
				/>
				<span>
					{active
						? t("attachments.selectedSummary", {
								count: filters.selectedTotals.count,
								size: formatBytes(filters.selectedTotals.bytes, i18n.language),
							})
						: t("attachments.columns.name")}
				</span>
			</label>
			{active ? (
				<div className="attachmentListHeaderActions">
					<Button type="button" variant="ghost" size="sm" onClick={filters.clearSelection}>
						{t("attachments.clearSelection")}
					</Button>
					<Button
						type="button"
						variant="destructive"
						size="sm"
						disabled={trashPending}
						onClick={onTrash}
					>
						{t("attachments.moveToTrash")}
					</Button>
				</div>
			) : (
				<span className="attachmentColumnSize">{t("attachments.columns.size")}</span>
			)}
		</div>
	);
}
