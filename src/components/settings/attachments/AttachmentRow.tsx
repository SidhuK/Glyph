import { FolderOpenIcon, LinkSquare01Icon, Note01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { type AttachmentEntry, spaceAssetUrl } from "../../../lib/tauri";
import { Button } from "../../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/shadcn/popover";
import { attachmentKindIcon, formatBytes, hasThumbnail, parentFolder } from "./attachmentFormat";
import { isUnused } from "./useAttachmentFilters";
import type { AttachmentFileAction } from "./useAttachmentScan";

interface AttachmentRowProps {
	entry: AttachmentEntry;
	selected: boolean;
	/** Status is noise when every visible row is unused, so the Unused tab hides it. */
	showStatus: boolean;
	onToggle: (path: string) => void;
	onFileAction: (action: AttachmentFileAction) => void;
}

function UsedInPopover({ notes }: { notes: readonly string[] }) {
	const { t } = useTranslation("settings.general");
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button type="button" className="attachmentUsedTrigger">
					<HugeiconsIcon icon={Note01Icon} size="var(--icon-xs)" aria-hidden="true" />
					{t("developer.attachments.usedIn", { count: notes.length })}
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="attachmentUsedPopover">
				<div className="attachmentUsedTitle">{t("developer.attachments.referencedBy")}</div>
				<ul className="attachmentUsedList">
					{notes.map((note) => (
						<li key={note} title={note}>
							{note}
						</li>
					))}
				</ul>
			</PopoverContent>
		</Popover>
	);
}

export const AttachmentRow = memo(function AttachmentRow({
	entry,
	selected,
	showStatus,
	onToggle,
	onFileAction,
}: AttachmentRowProps) {
	const { t, i18n } = useTranslation("settings.general");
	const unused = isUnused(entry);
	const folder = parentFolder(entry.rel_path) || t("developer.attachments.spaceRoot");
	// Truncate only the stem so the extension stays visible on long hashed names.
	const dot = entry.name.lastIndexOf(".");
	const stem = dot > 0 ? entry.name.slice(0, dot) : entry.name;
	const extension = dot > 0 ? entry.name.slice(dot) : "";

	const body = (
		<>
			<span className="attachmentThumb" aria-hidden="true">
				{hasThumbnail(entry.kind, extension) ? (
					<img src={spaceAssetUrl(entry.rel_path)} alt="" loading="lazy" decoding="async" />
				) : (
					<HugeiconsIcon icon={attachmentKindIcon(entry.kind)} size="var(--icon-md)" />
				)}
			</span>
			<span className="attachmentRowCopy">
				<span className="attachmentRowName" title={entry.rel_path}>
					<span className="attachmentRowStem">{stem}</span>
					{extension}
				</span>
				<span className="attachmentRowPath">
					<span className="attachmentRowFolder">{folder}</span>
					{showStatus && unused ? (
						<span className="attachmentUnusedMark">{t("developer.attachments.unusedBadge")}</span>
					) : null}
					{unused ? null : <UsedInPopover notes={entry.referenced_by} />}
				</span>
			</span>
		</>
	);

	return (
		<div className="attachmentRow" data-selected={selected || undefined}>
			{unused ? (
				<label className="attachmentRowMain" data-selectable="">
					<input
						type="checkbox"
						checked={selected}
						onChange={() => onToggle(entry.rel_path)}
						aria-label={t("developer.attachments.selectFile", { name: entry.name })}
					/>
					{body}
				</label>
			) : (
				<div className="attachmentRowMain">
					<span className="attachmentRowCheckSpacer" aria-hidden="true" />
					{body}
				</div>
			)}
			<span className="attachmentColumnSize">{formatBytes(entry.size, i18n.language)}</span>
			<div className="attachmentRowActions">
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					title={t("developer.attachments.open")}
					aria-label={t("developer.attachments.openFile", { name: entry.name })}
					onClick={() => onFileAction({ kind: "open", path: entry.rel_path })}
				>
					<HugeiconsIcon icon={LinkSquare01Icon} />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					title={t("developer.attachments.reveal")}
					aria-label={t("developer.attachments.revealFile", { name: entry.name })}
					onClick={() => onFileAction({ kind: "reveal", path: entry.rel_path })}
				>
					<HugeiconsIcon icon={FolderOpenIcon} />
				</Button>
			</div>
		</div>
	);
});
