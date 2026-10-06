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
	const filtersActive = filters.query.trim() !== "" || filters.kind !== "any";

	const confirmTrash = async () => {
		const selected = filters.selected;
		const listed = selected.slice(0, TRASH_PREVIEW_LIMIT).map((entry) => entry.name);
		const hidden = selected.length - listed.length;
		if (hidden > 0) listed.push(t("developer.attachments.confirm.more", { count: hidden }));
		const { confirm } = await import("@tauri-apps/plugin-dialog");
		const confirmed = await confirm(
			[
				t("developer.attachments.confirm.description", {
					size: formatBytes(filters.selectedTotals.bytes, i18n.language),
				}),
				listed.join("\n"),
			].join("\n\n"),
			{
				title: t("developer.attachments.confirm.title", { count: selected.length }),
				kind: "warning",
				okLabel: t("developer.attachments.confirm.action"),
				cancelLabel: t("developer.attachments.confirm.cancel"),
			},
		);
		if (!confirmed) return;
		trash.mutate(
			selected.map((entry) => entry.rel_path),
			{ onSuccess: () => filters.clearSelection() },
		);
	};

	const rescanLabel = scan.isFetching
		? t("developer.attachments.scanning")
		: t("developer.attachments.rescan");
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
				size="var(--icon-lg)"
				className={scan.isFetching ? "attachmentSpin" : undefined}
			/>
		</Button>
	);

	return (
		<SettingsSection
			title={t("developer.attachments.title")}
			description={t("developer.attachments.description")}
			aside={spacePath === null ? null : rescanButton}
		>
			{spacePath === null ? (
				<p className="settingsEmpty attachmentEmpty">{t("developer.attachments.noSpace")}</p>
			) : (
				<div className="attachmentBrowser">
					<div className="attachmentBand">
						{scan.data ? (
							<AttachmentSummary
								all={filters.allTotals}
								unused={filters.unusedTotals}
								noteCount={scan.data.note_count}
							/>
						) : (
							<div className="attachmentSummary">
								<span className="attachmentSummaryTitle">
									{t("developer.attachments.scanning")}
								</span>
							</div>
						)}
						{error ? <div className="settingsError">{extractErrorMessage(error)}</div> : null}
						{trash.data ? <AttachmentTrashOutcome result={trash.data} /> : null}
					</div>

					<div className="attachmentBand attachmentBandToolbar">
						<AttachmentToolbar filters={filters} />
					</div>

					<AttachmentListHeader
						filters={filters}
						trashPending={trash.isPending}
						onTrash={() => void confirmTrash()}
					/>

					{scan.isPending ? null : filters.visible.length === 0 ? (
						<p className="settingsEmpty attachmentEmpty">
							{filters.usage === "unused" && !filtersActive
								? t("developer.attachments.emptyUnused")
								: t("developer.attachments.emptyFiltered")}
						</p>
					) : (
						<AttachmentList
							entries={filters.visible}
							selectedPaths={filters.selectedPaths}
							showStatus={filters.usage === "all"}
							onToggle={filters.toggle}
							onFileAction={fileAction.mutate}
						/>
					)}

					<p className="attachmentFootnote">{t("developer.attachments.footnote")}</p>
				</div>
			)}
		</SettingsSection>
	);
}
