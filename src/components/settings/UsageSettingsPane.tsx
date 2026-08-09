import { defineChart, dot } from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts-scales/band";
import { scaleLinear } from "@tanstack/charts-scales/linear";
import { pie, polar, radialArc } from "@tanstack/charts/polar";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { useSpace } from "../../contexts";
import { type UsageInsights, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";

const usageInsightsQueryKey = (spacePath: string) =>
	["usage-insights", spacePath] as const;
const numberFormat = new Intl.NumberFormat();
const coverageCellIds = Array.from(
	{ length: 50 },
	(_, index) => `coverage-${index}`,
);

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

function dateHeatmap(insights: UsageInsights) {
	const end = new Date();
	end.setHours(0, 0, 0, 0);
	const start = new Date(end);
	start.setDate(start.getDate() - start.getDay() - 77);
	const counts = new Map(
		insights.activity.map((day) => [day.date, day.created + day.lastEdited]),
	);
	return Array.from({ length: 84 }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		const key = [
			date.getFullYear(),
			String(date.getMonth() + 1).padStart(2, "0"),
			String(date.getDate()).padStart(2, "0"),
		].join("-");
		return { key, count: counts.get(key) ?? 0 };
	});
}

function UsageActivityHeatmap({ insights }: { insights: UsageInsights }) {
	const { t } = useTranslation("settings.general");
	const cells = useMemo(() => dateHeatmap(insights), [insights]);
	const maximum = Math.max(...cells.map((cell) => cell.count), 1);
	return (
		<div className="usageHeatmap" aria-label={t("usage.activity")}>
			<div className="usageHeatmapDays" aria-hidden="true">
				<span>{t("usage.mon")}</span>
				<span>{t("usage.wed")}</span>
				<span>{t("usage.fri")}</span>
			</div>
			<div className="usageHeatmapGrid">
				{cells.map((cell) => (
					<span
						className="usageHeatmapCell"
						key={cell.key}
						data-level={
							cell.count === 0
								? 0
								: Math.min(4, Math.ceil((cell.count / maximum) * 4))
						}
						title={`${cell.key}: ${numberFormat.format(cell.count)}`}
					/>
				))}
			</div>
			<div className="usageHeatmapMonths" aria-hidden="true">
				<span>{t("usage.lastTwelveWeeks")}</span>
				<span>{t("usage.thisWeek")}</span>
			</div>
		</div>
	);
}

function UsageTagDotPlot({
	rows,
	label,
}: {
	rows: readonly { label: string; value: number }[];
	label: string;
}) {
	const definition = useMemo(
		() =>
			defineChart({
				tooltip: { use: tooltip },
				marks: [
					dot(rows, {
						x: "value",
						y: "label",
						r: "value",
						rScale: (value) => Math.max(4, Math.min(15, Math.sqrt(value) * 2)),
						fill: "var(--status-info-fg)",
					}),
				],
				y: { scale: () => scaleBand<string>().padding(0.22) },
				x: {
					scale: scaleLinear,
					nice: true,
					grid: true,
					axis: { label },
				},
			}),
		[label, rows],
	);
	return <Chart definition={definition} height={230} ariaLabel={label} />;
}

function TaskCompletionDonut({
	completed,
	open,
}: {
	completed: number;
	open: number;
}) {
	const { t } = useTranslation("settings.general");
	const rows = useMemo(
		() => [
			{ state: "done", value: completed },
			{ state: "open", value: open },
		],
		[completed, open],
	);
	const slices = useMemo(
		() => pie(rows, { value: "value", gapAngle: 0.04 }),
		[rows],
	);
	const definition = useMemo(
		() =>
			defineChart({
				tooltip: { use: tooltip },
				marks: [
					polar({
						radiusRatio: 0.9,
						marks: [
							radialArc(slices, {
								innerRadius: ({ radius }) => radius * 0.62,
								cornerRadius: 2,
								color: "state",
								key: "state",
							}),
						],
					}),
				],
				color: {
					domain: ["done", "open"],
					range: ["var(--status-success-fg)", "var(--bg-primary)"],
				},
			}),
		[slices],
	);
	const completion =
		completed + open === 0 ? 0 : completed / (completed + open);
	return (
		<div className="usageTaskDonut">
			<Chart
				definition={definition}
				height={154}
				ariaLabel={t("usage.tasks")}
			/>
			<div className="usageDonutValue" aria-hidden="true">
				<strong>{`${Math.round(completion * 100)}%`}</strong>
				<span>{t("usage.completed")}</span>
			</div>
			<div className="usageDonutLegend">
				<span className="usageDonutDone">{t("usage.done")}</span>
				<span className="usageDonutOpen">{t("usage.open")}</span>
			</div>
		</div>
	);
}

function NetworkCoverage({
	connected,
	total,
}: { connected: number; total: number }) {
	const { t } = useTranslation("settings.general");
	const ratio = total === 0 ? 0 : connected / total;
	const filled = Math.round(ratio * 50);
	return (
		<div className="usageCoverage" aria-label={`${Math.round(ratio * 100)}%`}>
			<div className="usageCoverageHeader">
				<strong>{`${Math.round(ratio * 100)}%`}</strong>
				<span>{t("usage.noteCoverage")}</span>
			</div>
			<div className="usageCoverageGrid" aria-hidden="true">
				{coverageCellIds.map((id, index) => (
					<span data-filled={index < filled} key={id} />
				))}
			</div>
		</div>
	);
}

function UsageFolderTreemap({
	rows,
	label,
}: {
	rows: readonly { name: string; size: number }[];
	label: string;
}) {
	return (
		<div className="usageFolderTiles" aria-label={label}>
			{rows.map((row, index) => (
				<div
					className="usageFolderTile"
					key={row.name}
					data-rank={index}
					title={`${row.name}: ${numberFormat.format(row.size)}`}
				>
					<span>{row.name}</span>
					<small>{numberFormat.format(row.size)}</small>
				</div>
			))}
		</div>
	);
}

function UsageTaskDensityChart({
	rows,
	label,
	notesLabel,
	tasksLabel,
	tasksTooltipLabel,
}: {
	rows: readonly {
		name: string;
		notes: number;
		tasks: number;
		completed: number;
	}[];
	label: string;
	notesLabel: string;
	tasksLabel: string;
	tasksTooltipLabel: string;
}) {
	const definition = useMemo(
		() =>
			defineChart({
				tooltip: {
					use: tooltip,
					format: (point) =>
						`${point.datum.name}: ${numberFormat.format(point.datum.tasks)} ${tasksTooltipLabel}`,
				},
				marks: [
					dot(rows, {
						x: "notes",
						y: "tasks",
						r: "completed",
						rScale: (value) => Math.max(5, Math.min(17, Math.sqrt(value) + 5)),
						fill: "var(--status-warning-fg)",
					}),
				],
				x: {
					scale: scaleLinear,
					nice: true,
					grid: true,
					axis: { label: notesLabel },
				},
				y: {
					scale: scaleLinear,
					nice: true,
					grid: true,
					axis: { label: tasksLabel },
				},
			}),
		[notesLabel, rows, tasksLabel, tasksTooltipLabel],
	);
	return <Chart definition={definition} height={210} ariaLabel={label} />;
}

export function UsageSettingsPane() {
	const { t } = useTranslation("settings.general");
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();
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
					notes: folder.noteCount,
					tasks: folder.taskTotal,
					completed: folder.taskCompleted,
				})) ?? [],
		[insights?.folders, t],
	);

	useTauriEvent("notes:external_changed", () => {
		if (spacePath) {
			void queryClient.invalidateQueries({ queryKey });
		}
	});
	useTauriEvent("space:fs_changed", () => {
		if (spacePath) {
			void queryClient.invalidateQueries({ queryKey });
		}
	});

	if (insightsQuery.isLoading) {
		return <div className="settingsPane usagePane">{t("usage.loading")}</div>;
	}
	if (insightsQuery.error || !insights) {
		return (
			<div className="settingsPane usagePane settingsError">
				{t("usage.error")}
			</div>
		);
	}

	const openTasks = Math.max(0, insights.taskTotal - insights.taskCompleted);
	const completion =
		insights.taskTotal === 0
			? 0
			: (insights.taskCompleted / insights.taskTotal) * 100;

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
					<UsageActivityHeatmap insights={insights} />
				</UsagePanel>

				<UsagePanel
					title={t("usage.taskHealth")}
					className="usageTaskPanel"
					searchId="usage-tasks"
				>
					<div className="usageTaskSummary">
						<Stat
							label={t("usage.open")}
							value={numberFormat.format(openTasks)}
						/>
						<Stat
							label={t("usage.done")}
							value={numberFormat.format(insights.taskCompleted)}
						/>
						<Stat
							label={t("usage.completed")}
							value={`${completion.toFixed(0)}%`}
						/>
					</div>
					<TaskCompletionDonut
						completed={insights.taskCompleted}
						open={openTasks}
					/>
				</UsagePanel>

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
					<NetworkCoverage
						connected={Math.max(
							0,
							insights.noteCount - insights.isolatedNoteCount,
						)}
						total={insights.noteCount}
					/>
				</UsagePanel>

				<UsagePanel
					title={t("usage.topFolders")}
					className="usageRankingPanel usageFoldersPanel"
				>
					<div className="usageCharts">
						{folderRows.length ? (
							<UsageFolderTreemap
								rows={folderRows}
								label={t("usage.folders")}
							/>
						) : (
							<p className="usageEmpty">{t("usage.noData")}</p>
						)}
					</div>
				</UsagePanel>

				<UsagePanel title={t("usage.topTags")} className="usageRankingPanel">
					<div className="usageCharts">
						{tagRows.length ? (
							<UsageTagDotPlot rows={tagRows} label={t("usage.tags")} />
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
								notesLabel={t("usage.notesInFolder")}
								tasksLabel={t("usage.tasksInFolder")}
								tasksTooltipLabel={t("usage.tasks")}
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
