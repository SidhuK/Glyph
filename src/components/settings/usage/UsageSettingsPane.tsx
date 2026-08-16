import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useSpace } from "../../../contexts";
import { invoke } from "../../../lib/tauri";
import {
	NetworkCoverageMosaic,
	TaskCompletionDonut,
	UsageActivityHeatmap,
	UsageFolderStream,
	UsageFolderTreemap,
	UsageTagWaffle,
	UsageTaskDensityChart,
} from "./usageCharts";

const usageInsightsQueryKey = (spacePath: string) =>
	["usage-insights", spacePath] as const;
const numberFormat = new Intl.NumberFormat();

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${numberFormat.format(bytes)} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[unitIndex]}`;
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="usageStat">
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function UsagePanel({
	title,
	children,
	className,
	searchId,
}: {
	title: string;
	children: ReactNode;
	className?: string;
	searchId?: string;
}) {
	return (
		<section
			className={["usagePanel", className].filter(Boolean).join(" ")}
			data-settings-search-id={searchId}
		>
			<header className="usagePanelHeader">
				<h3>{title}</h3>
			</header>
			{children}
		</section>
	);
}

export function UsageSettingsPane() {
	const { t } = useTranslation("settings.general");
	const { spacePath } = useSpace();
	const queryKey = usageInsightsQueryKey(spacePath ?? "__no-space__");
	const insightsQuery = useQuery({
		queryKey,
		queryFn: () => invoke("usage_insights"),
		enabled: Boolean(spacePath),
	});
	const insights = insightsQuery.data;
	const folderRows = useMemo(
		() =>
			insights?.folders.slice(0, 8).map((folder) => ({
				name: folder.name === "/" ? t("usage.rootFolder") : folder.name,
				size: folder.noteCount,
			})) ?? [],
		[insights?.folders, t],
	);
	const tagRows = useMemo(
		() =>
			insights?.tags.map((tag) => ({
				label: `#${tag.tag}`,
				value: tag.noteCount,
			})) ?? [],
		[insights?.tags],
	);
	const taskDensityRows = useMemo(
		() =>
			insights?.folders
				.filter((folder) => folder.taskTotal > 0)
				.slice(0, 8)
				.map((folder) => ({
					name: folder.name === "/" ? t("usage.rootFolder") : folder.name,
					tasks: folder.taskTotal,
					completed: folder.taskCompleted,
				})) ?? [],
		[insights?.folders, t],
	);

	if (insightsQuery.isLoading) {
		return <div className="settingsPane usagePane">{t("usage.loading")}</div>;
	}
	if (!spacePath) {
		return <div className="settingsPane usagePane">{t("usage.noSpace")}</div>;
	}
	if (insightsQuery.error || !insights) {
		return (
			<div className="settingsPane usagePane settingsError">
				{t("usage.error")}
			</div>
		);
	}

	const openTasks = Math.max(0, insights.taskTotal - insights.taskCompleted);
	const folderWeekFolders = new Set(
		insights.folderWeeks.map((row) => row.folder),
	);
	const showFolderStream =
		folderWeekFolders.size >= 2 &&
		insights.folderWeeks.some((row) => row.count > 0);

	return (
		<div className="settingsPane usagePane">
			<div className="usageDashboard">
				<UsagePanel
					title={t("usage.overview")}
					className="usageOverviewPanel"
					searchId="usage-insights"
				>
					<div className="usageStats">
						<Stat
							label={t("usage.notes")}
							value={numberFormat.format(insights.noteCount)}
						/>
						<Stat
							label={t("usage.storage")}
							value={formatBytes(insights.totalFileBytes)}
						/>
						<Stat
							label={t("usage.dailyNotes")}
							value={numberFormat.format(insights.dailyNotesCount)}
						/>
						<Stat
							label={t("usage.tasks")}
							value={numberFormat.format(insights.taskTotal)}
						/>
						<Stat
							label={t("usage.activeDays")}
							value={numberFormat.format(insights.activeDayCount)}
						/>
						<Stat
							label={t("usage.longestStreak")}
							value={numberFormat.format(insights.longestActivityStreak)}
						/>
					</div>
				</UsagePanel>

				<UsagePanel
					title={t("usage.activity")}
					className="usageActivityPanel"
					searchId="usage-activity"
				>
					<div className="usageCharts">
						<UsageActivityHeatmap insights={insights} />
					</div>
				</UsagePanel>

				<UsagePanel
					title={t("usage.taskHealth")}
					className="usageTaskPanel"
					searchId="usage-tasks"
				>
					<TaskCompletionDonut
						completed={insights.taskCompleted}
						open={openTasks}
					/>
				</UsagePanel>

				{showFolderStream ? (
					<UsagePanel
						title={t("usage.folderActivity")}
						className="usageFolderStreamPanel"
						searchId="usage-folder-activity"
					>
						<div className="usageCharts">
							<UsageFolderStream
								rows={insights.folderWeeks}
								otherLabel={t("usage.otherFolder")}
							/>
						</div>
					</UsagePanel>
				) : null}

				<UsagePanel
					title={t("usage.library")}
					className="usageLibraryPanel"
					searchId="usage-library"
				>
					<div className="usageStats">
						<Stat
							label={t("usage.links")}
							value={numberFormat.format(insights.linkCount)}
						/>
						<Stat
							label={t("usage.isolated")}
							value={numberFormat.format(insights.isolatedNoteCount)}
						/>
						<Stat
							label={t("usage.tags")}
							value={numberFormat.format(insights.tagCount)}
						/>
					</div>
					<div className="usageCharts">
						<NetworkCoverageMosaic
							folders={insights.folders.slice(0, 8).map((folder) => ({
								name: folder.name === "/" ? t("usage.rootFolder") : folder.name,
								noteCount: folder.noteCount,
								isolatedNoteCount: folder.isolatedNoteCount,
							}))}
						/>
					</div>
				</UsagePanel>

				<UsagePanel title={t("usage.topFolders")} className="usageRankingPanel">
					<div className="usageCharts">
						{folderRows.length ? (
							<UsageFolderTreemap
								rows={folderRows}
								label={t("usage.folders")}
								valueLabel={t("usage.notes")}
							/>
						) : (
							<p className="usageEmpty">{t("usage.noData")}</p>
						)}
					</div>
				</UsagePanel>

				<UsagePanel title={t("usage.topTags")} className="usageRankingPanel">
					<div className="usageCharts">
						{tagRows.length ? (
							<UsageTagWaffle rows={tagRows} label={t("usage.tags")} />
						) : (
							<p className="usageEmpty">{t("usage.noData")}</p>
						)}
					</div>
				</UsagePanel>

				<UsagePanel
					title={t("usage.taskDensity")}
					className="usageTaskDensityPanel"
				>
					<div className="usageCharts">
						{taskDensityRows.length ? (
							<UsageTaskDensityChart
								rows={taskDensityRows}
								label={t("usage.taskDensity")}
								doneLabel={t("usage.done")}
								openLabel={t("usage.open")}
							/>
						) : (
							<p className="usageEmpty">{t("usage.noTasks")}</p>
						)}
					</div>
				</UsagePanel>
			</div>
		</div>
	);
}
