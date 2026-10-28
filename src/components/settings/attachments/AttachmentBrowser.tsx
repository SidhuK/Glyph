import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../../lib/errorUtils";
import type { AttachmentEntry } from "../../../lib/tauri";
import { Button } from "../../ui/shadcn/button";
import { SettingsSection } from "../SettingsScaffold";
import { AttachmentList } from "./AttachmentList";
import { AttachmentListHeader } from "./AttachmentListHeader";
import { AttachmentSummary } from "./AttachmentSummary";
import { AttachmentToolbar } from "./AttachmentToolbar";
import { AttachmentTrashOutcome } from "./AttachmentTrashOutcome";
import { formatBytes } from "./attachmentFormat";
import { useAttachmentFilters } from "./useAttachmentFilters";
import { useAttachmentScan } from "./useAttachmentScan";

const NO_ATTACHMENTS: readonly AttachmentEntry[] = [];
/** Native alerts grow with their text, so only the first few names are listed. */
const TRASH_PREVIEW_LIMIT = 5;

export function AttachmentBrowser() {
	const { t, i18n } = useTranslation("settings.general");
	const { spacePath, scan, trash, fileAction } = useAttachmentScan();
	const filters = useAttachmentFilters(scan.data?.attachments ?? NO_ATTACHMENTS);
	const error = scan.error ?? trash.error ?? fileAction.error;

	const confirmTrash = async () => {
		const selected = filters.selected;
		const listed = selected.slice(0, TRASH_PREVIEW_LIMIT).map((entry) => entry.name);
		const hidden = selected.length - listed.length;
		if (hidden > 0) listed.push(t("attachments.confirm.more", { count: hidden }));
		const { confirm } = await import("@tauri-apps/plugin-dialog");
		const confirmed = await confirm(
			[
				t("attachments.confirm.description", {
					size: formatBytes(filters.selectedTotals.bytes, i18n.language),
				}),
				listed.join("\n"),
			].join("\n\n"),
			{
				title: t("attachments.confirm.title", { count: selected.length }),
				kind: "warning",
				okLabel: t("attachments.confirm.action"),
				cancelLabel: t("attachments.confirm.cancel"),
			},
		);
		if (!confirmed) return;
		trash.mutate(
			selected.map((entry) => entry.rel_path),
			{ onSuccess: () => filters.clearSelection() },
		);
	};

	if (spacePath === null) {
		return (
			<SettingsSection title={t("attachments.storageTitle")}>
				<p className="settingsEmpty attachmentEmpty">{t("attachments.noSpace")}</p>
			</SettingsSection>
		);
	}

	const rescanLabel = scan.isFetching ? t("attachments.scanning") : t("attachments.rescan");
	const rescanButton = (
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			title={rescanLabel}
			aria-label={rescanLabel}
			disabled={scan.isFetching}
			onClick={() => {
				trash.reset();
				void scan.refetch();
			}}
		>
			<HugeiconsIcon
				icon={ArrowReloadHorizontalIcon}
				size="var(--icon-md)"
				className={scan.isFetching ? "attachmentSpin" : undefined}
			/>
		</Button>
	);

	return (
		<>
			<SettingsSection title={t("attachments.storageTitle")} aside={rescanButton}>
				<div className="attachmentBand">
					{scan.data ? (
						<AttachmentSummary all={filters.allTotals} unused={filters.unusedTotals} />
					) : (
						<p className="settingsEmpty">{t("attachments.scanning")}</p>
					)}
					{error ? <div className="settingsError">{extractErrorMessage(error)}</div> : null}
					{trash.data ? <AttachmentTrashOutcome result={trash.data} /> : null}
				</div>
			</SettingsSection>

			<SettingsSection title={t("attachments.filesTitle")} description={t("attachments.footnote")}>
				<div className="attachmentBrowser">
					<AttachmentToolbar filters={filters} />
					<AttachmentListHeader
						filters={filters}
						trashPending={trash.isPending}
						onTrash={() => void confirmTrash()}
					/>
					{scan.isPending ? null : filters.visible.length === 0 ? (
						<p className="settingsEmpty attachmentEmpty">
							{filters.usage === "unused" && filters.query.trim() === ""
								? t("attachments.emptyUnused")
								: t("attachments.emptyFiltered")}
						</p>
					) : (
						<AttachmentList
							entries={filters.visible}
							selectedPaths={filters.selectedPaths}
							onToggle={filters.toggle}
							onFileAction={fileAction.mutate}
						/>
					)}
				</div>
			</SettingsSection>
		</>
	);
}
