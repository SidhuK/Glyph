import {
	areaY,
	barX,
	cell,
	colorGradientLegend,
	colorLegend,
	defineChart,
	mosaicY,
	rect,
	stack,
	waffleY,
} from "@tanstack/charts";
import { scaleBand } from "@tanstack/charts-scales/band";
import { scaleLinear } from "@tanstack/charts-scales/linear";
import { treemap } from "@tanstack/charts/hierarchy/treemap";
import { polar, radialBarAngle, radialText } from "@tanstack/charts/polar";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { scaleSequential, scaleUtc } from "d3-scale";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { UsageFolderWeek, UsageInsights } from "../../../lib/tauri";

const numberFormat = new Intl.NumberFormat();
const activityDayCount = 84;
const stackedRadialStart = Math.PI / 2;
const stackedRadialEnd = -Math.PI / 2;
const otherFolderId = "__other__";
const streamFills = [
	"var(--accent-color)",
	"var(--status-info-fg)",
	"var(--status-success-fg)",
	"var(--status-warning-fg)",
	"color-mix(in srgb, var(--accent-color) 62%, var(--text-primary))",
	"color-mix(in srgb, var(--status-info-fg) 55%, var(--text-primary))",
	"color-mix(in srgb, var(--status-success-fg) 50%, var(--bg-primary))",
	"color-mix(in srgb, var(--text-secondary) 45%, var(--bg-primary))",
] as const;
const taskOpenFill =
	"color-mix(in srgb, var(--accent-color) 34%, var(--bg-primary))";

type NamedCount = { label: string; value: number };
type FolderSize = { name: string; size: number };
type ConnectionFolder = {
	name: string;
	noteCount: number;
	isolatedNoteCount: number;
};
type TaskDensityRow = {
	name: string;
	tasks: number;
	completed: number;
};
type FolderTaskShare = {
	name: string;
	status: string;
	count: number;
};
type ActivityCell = {
	key: string;
	week: number;
	weekday: string;
	count: number;
};

function percentTick(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function parseIsoDateUtc(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (
		!Number.isFinite(year) ||
		!Number.isFinite(month) ||
		!Number.isFinite(day)
	) {
		return null;
	}
	return new Date(Date.UTC(year, month - 1, day));
}

function weekdayLabels(
	locale: string,
): [string, string, string, string, string, string, string] {
	const format = new Intl.DateTimeFormat(locale, {
		weekday: "short",
		timeZone: "UTC",
	});
	return [
		format.format(new Date(Date.UTC(2025, 0, 5))),
		format.format(new Date(Date.UTC(2025, 0, 6))),
		format.format(new Date(Date.UTC(2025, 0, 7))),
		format.format(new Date(Date.UTC(2025, 0, 8))),
		format.format(new Date(Date.UTC(2025, 0, 9))),
		format.format(new Date(Date.UTC(2025, 0, 10))),
		format.format(new Date(Date.UTC(2025, 0, 11))),
	];
}

function activityMix(t: number): string {
	const pct = 8 + Math.round(Math.max(0, Math.min(1, t)) * 92);
	return `color-mix(in srgb, var(--accent-color) ${pct}%, var(--bg-primary))`;
}

function activityCells(
	insights: UsageInsights,
	weekdays: readonly string[],
): ActivityCell[] {
	const end = new Date();
	end.setHours(0, 0, 0, 0);
	const start = new Date(end);
	start.setDate(start.getDate() - start.getDay() - 77);
	const counts = new Map(
		insights.activity.map((day) => [day.date, day.created + day.lastEdited]),
	);
	return Array.from({ length: activityDayCount }, (_, index) => {
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		const key = [
			date.getFullYear(),
			String(date.getMonth() + 1).padStart(2, "0"),
			String(date.getDate()).padStart(2, "0"),
		].join("-");
		return {
			key,
			week: Math.floor(index / 7),
			weekday: weekdays[index % 7],
			count: counts.get(key) ?? 0,
		};
	});
}

export function UsageActivityHeatmap({
	insights,
}: { insights: UsageInsights }) {
	const { i18n, t } = useTranslation("settings.general");
	const weekdays = useMemo(
		() => weekdayLabels(i18n.resolvedLanguage ?? i18n.language),
		[i18n.language, i18n.resolvedLanguage],
	);
	const rows = useMemo(
		() => activityCells(insights, weekdays),
		[insights, weekdays],
	);
	const weekLabel = t("usage.weekAxis");
	const legendLabel = t("usage.activity");
	const definition = useMemo(
		() =>
			defineChart({
				tooltip: {
					use: tooltip,
					format: (point) =>
						`${point.datum.key}: ${numberFormat.format(point.datum.count)}`,
				},
				marks: [
					cell(rows, {
						x: "week",
						y: "weekday",
						color: "count",
						key: "key",
						inset: 1,
						radius: 2,
					}),
				],
				x: {
					scale: () =>
						scaleBand<number>().paddingInner(0.06).paddingOuter(0.03),
					axis: {
						label: weekLabel,
						ticks: {
							format: (week) => t("usage.weekTick", { week: week + 1 }),
						},
					},
				},
				y: {
					scale: () =>
						scaleBand<string>()
							.domain(weekdays)
							.paddingInner(0.06)
							.paddingOuter(0.03),
				},
				color: {
					scale: () => scaleSequential(activityMix),
					legend: colorGradientLegend({
						label: legendLabel,
						steps: 6,
						format: (value) => numberFormat.format(Math.round(value)),
					}),
				},
			}),
		[legendLabel, rows, t, weekLabel, weekdays],
	);
	return (
		<Chart
			definition={definition}
			height={248}
			ariaLabel={t("usage.activity")}
		/>
	);
}

export function UsageFolderStream({
	rows,
	otherLabel,
}: {
	rows: readonly UsageFolderWeek[];
	otherLabel: string;
}) {
	const { i18n, t } = useTranslation("settings.general");
	const locale = i18n.resolvedLanguage ?? i18n.language;
	const weekLabel = t("usage.weekAxis");
	const notesLabel = t("usage.notesCreated");
	const prepared = useMemo(() => {
		const points: { week: Date; folder: string; count: number }[] = [];
		for (const row of rows) {
			const week = parseIsoDateUtc(row.week);
			if (!week) continue;
			const folder =
				row.folder === "/"
					? t("usage.rootFolder")
					: row.folder === otherFolderId
						? otherLabel
						: row.folder;
			points.push({ week, folder, count: row.count });
		}
		return points;
	}, [otherLabel, rows, t]);
	const folderNames = useMemo(() => {
		const names: string[] = [];
		for (const row of prepared) {
			if (!names.includes(row.folder)) names.push(row.folder);
		}
		return names;
	}, [prepared]);
	const definition = useMemo(
		() =>
			defineChart({
				tooltip: {
					use: tooltip,
					format: (point) =>
						`${point.datum.folder}: ${numberFormat.format(point.datum.count)}`,
				},
				marks: [
					areaY(prepared, {
						x: "week",
						y: "count",
						z: "folder",
						color: "folder",
						key: (datum) => `${datum.folder}:${datum.week.toISOString()}`,
						layout: stack({ offset: "wiggle", order: "inside-out" }),
						fillOpacity: 0.85,
					}),
				],
				x: {
					scale: scaleUtc,
					axis: {
						label: weekLabel,
						ticks: {
							format: (value) => {
								if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
									return "";
								}
								return new Intl.DateTimeFormat(locale, {
									month: "short",
									day: "numeric",
									timeZone: "UTC",
								}).format(value);
							},
						},
					},
				},
				y: {
					scale: scaleLinear,
					grid: true,
					axis: { label: notesLabel },
				},
				color: {
					domain: folderNames,
					range: streamFills.slice(0, Math.max(folderNames.length, 1)),
					legend: colorLegend({ label: t("usage.folders") }),
				},
			}),
		[folderNames, locale, notesLabel, prepared, t, weekLabel],
	);
	if (folderNames.length < 2) {
		return <p className="usageEmpty">{t("usage.noData")}</p>;
	}
	return (
		<Chart
			definition={definition}
			height={248}
			ariaLabel={t("usage.folderActivity")}
		/>
	);
}

export function TaskCompletionDonut({
	completed,
	open,
}: {
	completed: number;
	open: number;
}) {
	const { t } = useTranslation("settings.general");
	const doneLabel = t("usage.done");
	const openLabel = t("usage.open");
	const completedLabel = t("usage.completed");
	const total = completed + open;
	const domainMax = Math.max(total, 1);
	const percent =
		total === 0 ? "0%" : `${Math.round((completed / total) * 100)}%`;
	const rows = useMemo(() => {
		if (total === 0) {
			return [
				{
					id: "open",
					label: openLabel,
					ring: "tasks",
					start: 0,
					end: 1,
					count: 0,
					fill: taskOpenFill,
				},
			];
		}
		return [
			{
				id: "done",
				label: doneLabel,
				ring: "tasks",
				start: 0,
				end: completed,
				count: completed,
				fill: "var(--accent-color)",
			},
			{
				id: "open",
				label: openLabel,
				ring: "tasks",
				start: completed,
				end: total,
				count: total - completed,
				fill: taskOpenFill,
			},
		].filter((row) => row.end > row.start);
	}, [completed, doneLabel, openLabel, total]);
	const definition = useMemo(
		() =>
			defineChart({
				margin: 0,
				tooltip: {
					use: tooltip,
					format: (point) => {
						if (!("label" in point.datum) || !("count" in point.datum)) {
							return "";
						}
						return `${point.datum.label}: ${numberFormat.format(point.datum.count)}`;
					},
				},
				marks: [
					polar({
						startAngle: stackedRadialStart,
						endAngle: stackedRadialEnd,
						angle: {
							scale: scaleLinear().domain([0, domainMax]),
						},
						radius: {
							scale: () => scaleBand<string>().domain(["tasks"]),
							range: [
								({ radius }) => radius * 0.58,
								({ radius }) => radius * 0.9,
							],
						},
						marks: [
							radialBarAngle(rows, {
								angle1: "start",
								angle2: "end",
								angle: "end",
								radius: "ring",
								key: "id",
								fill: (row) => row.fill,
								cornerRadius: 6,
								stroke: "var(--bg-primary)",
								strokeWidth: 2,
							}),
						],
					}),
					polar({
						angle: { scale: scaleLinear().domain([0, 1]) },
						radius: { scale: scaleLinear().domain([0, 1]) },
						marks: [
							radialText(
								[
									{
										id: "total",
										angle: 0,
										radius: 0,
										text: numberFormat.format(total),
									},
								],
								{
									angle: "angle",
									radius: "radius",
									key: "id",
									text: "text",
									dy: -10,
									fill: "var(--text-primary)",
									fontSize: 22,
									fontWeight: 650,
								},
							),
							radialText(
								[
									{
										id: "caption",
										angle: 0,
										radius: 0,
										text: `${percent} ${completedLabel}`,
									},
								],
								{
									angle: "angle",
									radius: "radius",
									key: "id",
									text: "text",
									dy: 12,
									fill: "var(--text-secondary)",
									fontSize: 11,
								},
							),
						],
					}),
				],
			}),
		[completedLabel, domainMax, percent, rows, total],
	);
	return (
		<div className="usageTaskRadial">
			<Chart
				definition={definition}
				height={188}
				ariaLabel={t("usage.tasks")}
			/>
			<div className="usageDonutLegend">
				<span className="usageTaskDone">
					{`${doneLabel} ${numberFormat.format(completed)}`}
				</span>
				<span className="usageTaskOpen">
					{`${openLabel} ${numberFormat.format(open)}`}
				</span>
			</div>
		</div>
	);
}

export function NetworkCoverageMosaic({
	folders,
}: {
	folders: readonly ConnectionFolder[];
}) {
	const { t } = useTranslation("settings.general");
	const connectedLabel = t("usage.connected");
	const unlinkedLabel = t("usage.unlinked");
	const rows = useMemo(() => {
		const counts = folders.flatMap((folder) => {
			const isolated = Math.min(folder.isolatedNoteCount, folder.noteCount);
			const connected = Math.max(0, folder.noteCount - isolated);
			return [
				{
					folder: folder.name,
					state: connectedLabel,
					count: connected,
				},
				{
					folder: folder.name,
					state: unlinkedLabel,
					count: isolated,
				},
			].filter((row) => row.count > 0);
		});
		return counts;
	}, [connectedLabel, folders, unlinkedLabel]);
	const folderOrder = useMemo(
		() => folders.map((folder) => folder.name),
		[folders],
	);
	const definition = useMemo(() => {
		if (rows.length === 0) return null;
		const cells = mosaicY(rows, {
			x: "folder",
			y: "state",
			value: "count",
			xOrder: folderOrder,
			yOrder: [connectedLabel, unlinkedLabel],
		});
		return defineChart({
			tooltip: {
				use: tooltip,
				format: (point) => {
					if (!("yValue" in point.datum) || !("value" in point.datum)) {
						return "";
					}
					return `${point.datum.xValue}: ${point.datum.yValue} ${numberFormat.format(point.datum.value)}`;
				},
			},
			marks: [
				rect(cells, {
					x: "x",
					x1: "x1",
					x2: "x2",
					y: "y",
					y1: "y1",
					y2: "y2",
					color: "yValue",
					key: (datum) => `${datum.xValue}:${datum.yValue}`,
					inset: 1,
				}),
			],
			x: {
				scale: scaleLinear().domain([0, 1]),
				axis: {
					ticks: { format: percentTick },
				},
			},
			y: {
				scale: scaleLinear().domain([0, 1]),
				axis: {
					ticks: {
						values: [0, 0.25, 0.5, 0.75, 1],
						format: percentTick,
					},
				},
			},
			color: {
				domain: [connectedLabel, unlinkedLabel],
				range: [
					"var(--accent-color)",
					"color-mix(in srgb, var(--text-secondary) 22%, var(--bg-primary))",
				],
				legend: colorLegend(),
			},
		});
	}, [
		connectedLabel,
		folderOrder,
		rows,
		unlinkedLabel,
	]);
	if (!definition) {
		return <p className="usageEmpty">{t("usage.noData")}</p>;
	}
	return (
		<Chart
			definition={definition}
			height={220}
			ariaLabel={t("usage.library")}
		/>
	);
}

export function UsageFolderTreemap({
	rows,
	label,
	valueLabel,
}: {
	rows: readonly FolderSize[];
	label: string;
	valueLabel: string;
}) {
	const names = useMemo(() => rows.map((row) => row.name), [rows]);
	const definition = useMemo(
		() =>
			defineChart({
				margin: 4,
				guides: false,
				tooltip: {
					use: tooltip,
					format: (point) => {
						const node = point.datum;
						if (!("external" in node) || !node.external) {
							return "";
						}
						return `${node.name}: ${numberFormat.format(node.value)} ${valueLabel}`;
					},
				},
				marks: [
					treemap(rows, {
						path: "name",
						delimiter: "\u001f",
						value: "size",
						ratio: 4 / 3,
						round: true,
						paddingInner: 3,
						paddingOuter: 2,
						inset: 1,
						radius: 6,
						sort: (left, right) => right.value - left.value,
						color: (node) => node.name,
						label: (node) => (node.external ? node.name : null),
						labelFill: "var(--bg-primary)",
						labelFontSize: 11,
						labelFontWeight: 600,
						labelPadding: 6,
						stroke: "var(--bg-primary)",
						strokeWidth: 1,
					}),
				],
				color: {
					domain: names,
					range: streamFills.slice(0, Math.max(names.length, 1)),
				},
			}),
		[names, rows, valueLabel],
	);
	return <Chart definition={definition} height={268} ariaLabel={label} />;
}

export function UsageTagWaffle({
	rows,
	label,
}: {
	rows: readonly NamedCount[];
	label: string;
}) {
	const tags = useMemo(() => rows.map((row) => row.label), [rows]);
	const unit = Math.max(
		1,
		Math.ceil(rows.reduce((total, row) => total + row.value, 0) / 80),
	);
	const definition = useMemo(
		() =>
			defineChart({
				margin: 8,
				guides: false,
				tooltip: {
					use: tooltip,
					format: (point) => {
						const datum = point.datum;
						if (!("label" in datum) || !("value" in datum)) {
							return "";
						}
						return `${datum.label}: ${numberFormat.format(datum.value)}`;
					},
				},
				marks: [
					waffleY(rows, {
						y: "value",
						color: "label",
						key: "label",
						unit,
						round: true,
						gap: 3,
						radius: 3,
					}),
				],
				color: {
					domain: tags,
					range: streamFills.slice(0, Math.max(tags.length, 1)),
				},
			}),
		[rows, tags, unit],
	);
	return <Chart definition={definition} height={268} ariaLabel={label} />;
}

export function UsageTaskDensityChart({
	rows,
	label,
	doneLabel,
	openLabel,
}: {
	rows: readonly TaskDensityRow[];
	label: string;
	doneLabel: string;
	openLabel: string;
}) {
	const names = useMemo(() => rows.map((row) => row.name), [rows]);
	const stacked = useMemo((): FolderTaskShare[] => {
		const next: FolderTaskShare[] = [];
		for (const row of rows) {
			next.push({ name: row.name, status: doneLabel, count: row.completed });
			next.push({
				name: row.name,
				status: openLabel,
				count: Math.max(0, row.tasks - row.completed),
			});
		}
		return next;
	}, [doneLabel, openLabel, rows]);
	const definition = useMemo(
		() =>
			defineChart({
				tooltip: {
					use: tooltip,
					format: (point) =>
						`${point.datum.name} · ${point.datum.status}: ${numberFormat.format(point.datum.count)}`,
				},
				marks: [
					barX(stacked, {
						x: "count",
						y: "name",
						z: "status",
						color: "status",
						key: (row) => `${row.name}:${row.status}`,
						layout: stack(),
						radius: 3,
					}),
				],
				y: {
					scale: () => scaleBand<string>().domain(names).padding(0.28),
				},
				x: {
					scale: scaleLinear,
					nice: true,
					grid: true,
				},
				color: {
					domain: [doneLabel, openLabel],
					range: ["var(--accent-color)", taskOpenFill],
					legend: colorLegend(),
				},
			}),
		[doneLabel, names, openLabel, stacked],
	);
	return (
		<Chart
			definition={definition}
			height={Math.max(168, rows.length * 36 + 56)}
			ariaLabel={label}
		/>
	);
}
