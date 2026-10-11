import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Clock01Icon, TextAlignLeftIcon, TextFontIcon, TextIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { useDateDisplayFormat } from "../../../contexts";
import {
	type DateDisplayFormat,
	formatDisplayDate,
	formatLocalClockTime,
	parseDisplayDateInput,
} from "../../../lib/dateDisplayFormat";
import type { NoteTaskSummary, WorkspaceDatabasePreviewContext } from "../../../lib/tauri";
import { TaskProgressIndicator } from "../../checklists/TaskProgressIndicator";

interface InfoStatsTabProps {
	relPath: string;
	stats: {
		words: number;
		characters: number;
		readingTime: string;
	};
	taskSummary: NoteTaskSummary;
	previewContext: WorkspaceDatabasePreviewContext | null;
	lastSavedMtimeMs: number | null;
	lineCount: number;
	utf8SizeBytes: number;
	saveLabel: string;
}

function formatMetadataDate(
	value: string | null | undefined,
	dateFormat: DateDisplayFormat,
): string {
	if (!value) return "—";
	const parsed = parseDisplayDateInput(value);
	if (!parsed) return value;
	return formatDisplayDate(parsed, dateFormat, {
		time: formatLocalClockTime(parsed),
	});
}

function formatFileSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "—";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let size = bytes;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex += 1;
	}
	const fractionDigits = unitIndex === 0 ? 0 : size >= 100 ? 0 : size >= 10 ? 1 : 2;
	return `${size.toLocaleString(undefined, {
		maximumFractionDigits: fractionDigits,
	})} ${units[unitIndex]}`;
}

export function InfoStatsTab({
	relPath,
	stats,
	taskSummary,
	previewContext,
	lastSavedMtimeMs,
	lineCount,
	utf8SizeBytes,
	saveLabel,
}: InfoStatsTabProps) {
	const { t } = useTranslation("editor");
	const dateDisplayFormat = useDateDisplayFormat();
	const statCards = [
		{ key: "words", icon: TextFontIcon, value: stats.words.toLocaleString() },
		{ key: "characters", icon: TextIcon, value: stats.characters.toLocaleString() },
		{
			key: "lines",
			icon: TextAlignLeftIcon,
			value: (previewContext?.line_count ?? lineCount).toLocaleString(),
		},
		{ key: "readingTime", icon: Clock01Icon, value: stats.readingTime },
	] as const;

	return (
		<>
			<section className="markdownEditorInfoSection">
				<div className="markdownEditorInfoStatGrid">
					{statCards.map((card) => (
						<div key={card.key} className="markdownEditorInfoStatCard">
							<HugeiconsIcon
								className="markdownEditorInfoStatIcon"
								icon={card.icon}
								size="var(--icon-sm)"
								aria-hidden="true"
							/>
							<strong>{card.value}</strong>
							<span>{t(`infoSidebar.stats.${card.key}`)}</span>
						</div>
					))}
				</div>
				{taskSummary.total_count > 0 ? (
					<div className="markdownEditorInfoCard markdownEditorInfoTaskSummary">
						<TaskProgressIndicator summary={taskSummary} />
						<span>{t("infoSidebar.stats.tasks")}</span>
						<strong>
							{t("infoSidebar.stats.tasksDone", {
								completed: taskSummary.completed_count.toLocaleString(),
								total: taskSummary.total_count.toLocaleString(),
							})}
						</strong>
					</div>
				) : null}
			</section>

			<section className="markdownEditorInfoSection">
				<h3 className="markdownEditorInfoSectionLabel">{t("infoSidebar.stats.file")}</h3>
				<div className="markdownEditorInfoCard markdownEditorInfoRows">
					<div className="markdownEditorInfoRow">
						<span>{t("infoSidebar.stats.modified")}</span>
						<span className="markdownEditorInfoValue">
							{formatMetadataDate(
								lastSavedMtimeMs
									? new Date(lastSavedMtimeMs).toISOString()
									: (previewContext?.updated ?? null),
								dateDisplayFormat,
							)}
						</span>
					</div>
					<div className="markdownEditorInfoRow">
						<span>{t("infoSidebar.stats.created")}</span>
						<span className="markdownEditorInfoValue">
							{formatMetadataDate(previewContext?.created, dateDisplayFormat)}
						</span>
					</div>
					<div className="markdownEditorInfoRow">
						<span>{t("infoSidebar.stats.path")}</span>
						<span className="markdownEditorInfoValue">{relPath}</span>
					</div>
					<div className="markdownEditorInfoRow">
						<span>{t("infoSidebar.stats.size")}</span>
						<span className="markdownEditorInfoValue">{formatFileSize(utf8SizeBytes)}</span>
					</div>
					<div className="markdownEditorInfoRow">
						<span>{t("infoSidebar.stats.saveStatus")}</span>
						<span className="markdownEditorInfoValue">{saveLabel}</span>
					</div>
				</div>
			</section>
		</>
	);
}
