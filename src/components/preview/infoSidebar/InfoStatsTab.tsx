import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { CalendarAdd01Icon, Clock01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
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
}: InfoStatsTabProps) {
	const { t } = useTranslation("editor");
	const dateDisplayFormat = useDateDisplayFormat();
	const tasksValue =
		taskSummary.total_count > 0
			? `${taskSummary.completed_count.toLocaleString()}/${taskSummary.total_count.toLocaleString()}`
			: "—";
	// Two even rows of three: document counts, then time, tasks and size.
	const statCards = [
		{ key: "words", value: stats.words.toLocaleString() },
		{ key: "characters", value: stats.characters.toLocaleString() },
		{ key: "lines", value: (previewContext?.line_count ?? lineCount).toLocaleString() },
		{ key: "readingTime", value: stats.readingTime },
		{ key: "tasks", value: tasksValue },
		{ key: "size", value: formatFileSize(utf8SizeBytes) },
	] as const;
	const fileRows = [
		{
			key: "modified",
			icon: Clock01Icon,
			value: formatMetadataDate(
				lastSavedMtimeMs
					? new Date(lastSavedMtimeMs).toISOString()
					: (previewContext?.updated ?? null),
				dateDisplayFormat,
			),
		},
		{
			key: "created",
			icon: CalendarAdd01Icon,
			value: formatMetadataDate(previewContext?.created, dateDisplayFormat),
		},
		{ key: "path", icon: Folder01Icon, value: relPath },
	] as const;

	return (
		<>
			<section className="markdownEditorInfoSection">
				<div className="markdownEditorInfoStatGrid">
					{statCards.map((card) => (
						<div key={card.key} className="markdownEditorInfoStatCard">
							<strong>
								{card.key === "tasks" && taskSummary.total_count > 0 ? (
									<TaskProgressIndicator
										summary={taskSummary}
										className="markdownEditorInfoStatProgress"
									/>
								) : null}
								{card.value}
							</strong>
							<span>{t(`infoSidebar.stats.${card.key}`)}</span>
						</div>
					))}
				</div>
			</section>

			<section className="markdownEditorInfoSection">
				<h3 className="markdownEditorInfoSectionLabel">{t("infoSidebar.stats.file")}</h3>
				<div className="markdownEditorInfoRows">
					{fileRows.map((row) => (
						<div key={row.key} className="markdownEditorInfoRow">
							<span className="markdownEditorInfoRowLabel">
								<span className="markdownEditorInfoRowIcon" aria-hidden="true">
									<HugeiconsIcon icon={row.icon} size="var(--icon-sm)" />
								</span>
								{t(`infoSidebar.stats.${row.key}`)}
							</span>
							<span
								className="markdownEditorInfoValue"
								data-truncate={row.key === "path" ? "start" : undefined}
								title={row.value}
							>
								{row.key === "path" ? <span>{row.value}</span> : row.value}
							</span>
						</div>
					))}
				</div>
			</section>
		</>
	);
}
