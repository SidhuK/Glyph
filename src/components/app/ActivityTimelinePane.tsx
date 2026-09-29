import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Archive04Icon, InboxIcon, NoteIcon } from "@hugeicons/core-free-icons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { type VirtualItem, type Virtualizer, useVirtualizer } from "@tanstack/react-virtual";
import { addDays, format, isSameDay, parseISO, startOfDay, subDays } from "date-fns";
import { useReducedMotion } from "motion/react";
import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useDateDisplayFormat,
	useFileTreeContext,
	useSpace,
	useUILayoutContext,
} from "../../contexts";
import { useVirtualLoadMore } from "../../hooks/useLoadMoreTriggers";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { getDailyNotePath } from "../../lib/dailyNotes";
import { formatDisplayDate } from "../../lib/dateDisplayFormat";
import {
	ACTIVITY_DOCS_PAGE_SIZE,
	allDocsListQueryOptions,
	allDocsPagesQueryOptions,
} from "../../lib/navigationPrefetch";
import type { AllDocsItem, FileTreeAppearance, NoteTaskSummary } from "../../lib/tauri";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";
import { AllDocsCard, prepareAllDocsCardProps } from "./AllDocsCard";
import { CanvasPaneAwait } from "./CanvasPaneAwait";

interface ActivityTimelinePaneProps {
	kind?: "all" | "inbox" | "archive";
	onOpenFile: (relPath: string) => Promise<void>;
}

interface ActivityDay {
	dateKey: string;
	date: Date;
	notes: Map<string, ActivityNote>;
}

interface ActivityNote {
	note: AllDocsItem;
	isDaily: boolean;
}

type ActivityVirtualRow =
	| {
			id: string;
			kind: "header";
			day: ActivityDay;
	  }
	| {
			id: string;
			kind: "cards";
			timeline: boolean;
			dayIndex: number;
			startIndex: number;
			notes: ActivityNote[];
	  };

const HEATMAP_DAYS = 365;
const ACTIVITY_CONTENT_MAX_WIDTH = 860;

function parseNoteDate(value: string): Date | null {
	const parsed = parseISO(value);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed;
}

function dateKey(date: Date): string {
	return format(date, "yyyy-MM-dd");
}

function buildRecentDayShell(): ActivityDay[] {
	const today = startOfDay(new Date());
	const start = subDays(today, HEATMAP_DAYS - 1);
	const days: ActivityDay[] = [];
	for (let cursor = start; cursor <= today; cursor = addDays(cursor, 1)) {
		const key = dateKey(cursor);
		days.push({
			dateKey: key,
			date: cursor,
			notes: new Map(),
		});
	}
	return days;
}

function isDailyNote(notePath: string, date: string, dailyNotesFolder: string | null): boolean {
	return Boolean(dailyNotesFolder && notePath === getDailyNotePath(dailyNotesFolder, date));
}

function buildActivityDays(notes: AllDocsItem[], dailyNotesFolder: string | null): ActivityDay[] {
	const byDate = new Map<string, ActivityDay>();
	for (const day of buildRecentDayShell()) {
		byDate.set(day.dateKey, day);
	}

	const ensureDay = (key: string): ActivityDay | null => {
		const existing = byDate.get(key);
		if (existing) return existing;
		const parsed = parseNoteDate(key);
		if (!parsed) return null;
		const day = {
			dateKey: key,
			date: startOfDay(parsed),
			notes: new Map<string, ActivityNote>(),
		};
		byDate.set(key, day);
		return day;
	};

	const addNote = (key: string, note: AllDocsItem, isDaily = false) => {
		const day = ensureDay(key);
		if (!day) return;
		const existing = day.notes.get(note.note_path);
		if (existing) existing.isDaily ||= isDaily;
		else day.notes.set(note.note_path, { note, isDaily });
	};

	for (const note of notes) {
		const created = parseNoteDate(note.created);
		const updated = parseNoteDate(note.updated);
		const createdKey = created ? dateKey(created) : null;
		const updatedKey = updated ? dateKey(updated) : null;
		if (createdKey) {
			addNote(createdKey, note);
		}
		if (updatedKey) {
			addNote(updatedKey, note);
		}
		if (createdKey && isDailyNote(note.note_path, createdKey, dailyNotesFolder)) {
			addNote(createdKey, note, true);
		}
		if (
			updatedKey &&
			updatedKey !== createdKey &&
			isDailyNote(note.note_path, updatedKey, dailyNotesFolder)
		) {
			addNote(updatedKey, note, true);
		}
	}

	return [...byDate.values()].sort((left, right) => left.date.getTime() - right.date.getTime());
}

function heatmapColumns(days: ActivityDay[]): ActivityDay[][] {
	const columns: ActivityDay[][] = [];
	for (let index = 0; index < days.length; index += 7) {
		columns.push(days.slice(index, index + 7));
	}
	return columns;
}

function intensity(day: ActivityDay, maxCount: number): number {
	const total = day.notes.size;
	if (total === 0 || maxCount === 0) return 0;
	return Math.max(1, Math.min(4, Math.ceil((total / maxCount) * 4)));
}

function sortedDayNotes(day: ActivityDay): ActivityNote[] {
	return [...day.notes.values()].sort((left, right) => {
		const leftDaily = left.isDaily ? 1 : 0;
		const rightDaily = right.isDaily ? 1 : 0;
		if (leftDaily !== rightDaily) return rightDaily - leftDaily;
		return Date.parse(right.note.updated) - Date.parse(left.note.updated);
	});
}

function monthVisibilityCounts(days: ActivityDay[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const day of days) {
		const key = format(day.date, "yyyy-MM");
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

function countUniqueNotes(days: ActivityDay[]): number {
	const notePaths = new Set<string>();
	for (const day of days) {
		for (const notePath of day.notes.keys()) {
			notePaths.add(notePath);
		}
	}
	return notePaths.size;
}

function useActivityTimelineData(
	dailyNotesFolder: string | null,
	folder: string | null,
	archived: boolean,
	enabled: boolean,
	timeline: boolean,
) {
	const notesQuery = useInfiniteQuery({
		...allDocsPagesQueryOptions(folder, ACTIVITY_DOCS_PAGE_SIZE, archived),
		enabled,
	});
	const heatmapNotesQuery = useQuery({
		...allDocsListQueryOptions(),
		enabled: enabled && timeline,
	});
	const feedNotes = useMemo(
		() => notesQuery.data?.pages.flatMap((page) => page.items) ?? [],
		[notesQuery.data],
	);
	const feedNotePaths = useMemo(() => feedNotes.map((note) => note.note_path), [feedNotes]);
	const taskSummariesByPath = useTaskSummariesForPaths(feedNotePaths, true);
	const heatmapNotes = heatmapNotesQuery.data ?? feedNotes;
	const activityDays = useMemo(
		() => (timeline ? buildActivityDays(heatmapNotes, dailyNotesFolder) : []),
		[heatmapNotes, dailyNotesFolder, timeline],
	);
	const feedActivityDays = useMemo(
		() => (timeline ? buildActivityDays(feedNotes, dailyNotesFolder) : []),
		[feedNotes, dailyNotesFolder, timeline],
	);
	const recentStart = useMemo(() => subDays(startOfDay(new Date()), HEATMAP_DAYS - 1), []);
	const recentActivityDays = useMemo(
		() => activityDays.filter((day) => day.date.getTime() >= recentStart.getTime()),
		[activityDays, recentStart],
	);
	const columns = useMemo(() => heatmapColumns(recentActivityDays), [recentActivityDays]);
	const visibleMonthCounts = useMemo(
		() => monthVisibilityCounts(recentActivityDays),
		[recentActivityDays],
	);
	const maxCount = useMemo(
		() => Math.max(0, ...recentActivityDays.map((day) => day.notes.size)),
		[recentActivityDays],
	);
	const feedDays = useMemo(
		() => feedActivityDays.filter((day) => day.notes.size > 0).reverse(),
		[feedActivityDays],
	);
	const recentNotesCount = useMemo(
		() => countUniqueNotes(recentActivityDays),
		[recentActivityDays],
	);

	return {
		feedNotes,
		notesQuery,
		taskSummariesByPath,
		columns,
		visibleMonthCounts,
		maxCount,
		feedDays,
		recentNotesCount,
	};
}

function useActivityRows(
	feedDays: ActivityDay[],
	collectionNotes?: AllDocsItem[],
): ActivityVirtualRow[] {
	return useMemo<ActivityVirtualRow[]>(() => {
		const rows: ActivityVirtualRow[] = [];
		const groups = collectionNotes
			? [{ day: null, notes: collectionNotes.map((note) => ({ note, isDaily: false })) }]
			: feedDays.map((day) => ({ day, notes: sortedDayNotes(day) }));
		for (const [dayIndex, { day, notes }] of groups.entries()) {
			if (day) rows.push({ id: `header:${day.dateKey}`, kind: "header", day });
			for (
				let startIndex = 0, chunkIndex = 0;
				startIndex < notes.length;
				startIndex += ACTIVITY_DOCS_PAGE_SIZE, chunkIndex += 1
			) {
				rows.push({
					id: day ? `cards:${day.dateKey}:${chunkIndex}` : `cards:${startIndex}`,
					kind: "cards",
					timeline: day !== null,
					dayIndex,
					startIndex,
					notes: notes.slice(startIndex, startIndex + ACTIVITY_DOCS_PAGE_SIZE),
				});
			}
		}
		return rows;
	}, [feedDays, collectionNotes]);
}

function useActivityVirtualization(
	paneElement: HTMLElement | null,
	virtualRows: ActivityVirtualRow[],
) {
	const [paneWidth, setPaneWidth] = useState(0);
	const contentWidth =
		paneWidth <= 0 ? ACTIVITY_CONTENT_MAX_WIDTH : Math.min(paneWidth, ACTIVITY_CONTENT_MAX_WIDTH);
	const minCardWidth = contentWidth <= 640 ? 144 : 160;
	const gap = 14;
	const columnCount = Math.max(1, Math.floor((contentWidth + gap) / (minCardWidth + gap)));
	const width = (contentWidth - gap * (columnCount - 1)) / columnCount;
	const minHeight = contentWidth <= 640 ? 176 : 184;
	const cardEstimate = Math.max(minHeight, width) + gap;
	const rowVirtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
		count: virtualRows.length,
		estimateSize: (index) => {
			const row = virtualRows[index];
			if (!row) return 96;
			if (row.kind === "header") return 76;
			const noteCount = row.notes.length;
			const cardRows = Math.max(1, Math.ceil(noteCount / columnCount));
			return cardRows * cardEstimate + 24;
		},
		getScrollElement: () => paneElement,
		overscan: 3,
	});
	const virtualItems = rowVirtualizer.getVirtualItems();

	useEffect(() => {
		if (!paneElement) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			setPaneWidth(entry.contentRect.width);
		});
		observer.observe(paneElement);
		setPaneWidth(paneElement.clientWidth);
		return () => observer.disconnect();
	}, [paneElement]);

	return { rowVirtualizer, virtualItems };
}

interface ActivityHeatmapProps {
	columns: ActivityDay[][];
	visibleMonthCounts: Map<string, number>;
	maxCount: number;
}

function ActivityHeatmap({ columns, visibleMonthCounts, maxCount }: ActivityHeatmapProps) {
	const { t, i18n } = useTranslation("shell");
	const dateDisplayFormat = useDateDisplayFormat();
	const monthFormatter = new Intl.DateTimeFormat(i18n.language, { month: "short" });
	const dateFormatter = new Intl.DateTimeFormat(i18n.language, { dateStyle: "full" });
	const today = new Date();
	return (
		<div className="activityHeatmapBlock" aria-label={t("activity.recentActivity")}>
			<div className="activityHeatmapMonths" aria-hidden="true">
				{columns.map((column, index) => {
					const first = column[0];
					const previous = columns[index - 1]?.[0];
					const monthKey = first ? format(first.date, "yyyy-MM") : "";
					const show =
						first &&
						(!previous || first.date.getMonth() !== previous.date.getMonth()) &&
						(visibleMonthCounts.get(monthKey) ?? 0) >= 15;
					return (
						<span key={first?.dateKey ?? index}>
							{show && first ? monthFormatter.format(first.date) : ""}
						</span>
					);
				})}
			</div>
			<div className="activityHeatmapGrid">
				{columns.map((column) => (
					<div key={column[0]?.dateKey} className="activityHeatmapColumn">
						{column.map((day) => {
							const level = intensity(day, maxCount);
							const date =
								dateDisplayFormat === "friendly"
									? dateFormatter.format(day.date)
									: formatDisplayDate(day.date, dateDisplayFormat);
							const tooltip = t("activity.daySummary", { count: day.notes.size, date });
							return (
								<span
									key={day.dateKey}
									className="activityHeatmapCell"
									data-level={level}
									data-today={isSameDay(day.date, today) || undefined}
									data-tooltip={tooltip}
									aria-label={tooltip}
									role="img"
								/>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}

interface ActivityFeedProps {
	virtualRows: ActivityVirtualRow[];
	virtualItems: VirtualItem[];
	rowVirtualizer: Virtualizer<HTMLElement, HTMLDivElement>;
	itemAppearance: Record<string, FileTreeAppearance>;
	selectedNotePath: string | null;
	taskSummariesByPath: Record<string, NoteTaskSummary>;
	shouldReduceMotion: boolean;
	onSelectNote: (notePath: string) => void;
	onOpenFile: (relPath: string) => Promise<void>;
}

function ActivityFeed({
	virtualRows,
	virtualItems,
	rowVirtualizer,
	itemAppearance,
	selectedNotePath,
	taskSummariesByPath,
	shouldReduceMotion,
	onSelectNote,
	onOpenFile,
}: ActivityFeedProps) {
	if (virtualRows.length === 0) {
		return (
			<div className="activityFeed">
				<div className="databaseLoadingState">
					No activity yet. Create or edit a note to start the timeline.
				</div>
			</div>
		);
	}

	return (
		<div
			className="activityFeed is-virtualized"
			style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
		>
			{virtualItems.map((virtualRow) => {
				const row = virtualRows[virtualRow.index];
				if (!row) return null;
				return (
					<div
						key={row.id}
						data-index={virtualRow.index}
						ref={(node) => rowVirtualizer.measureElement(node)}
						className="activityVirtualRow"
						style={{ transform: `translateY(${virtualRow.start}px)` }}
					>
						{row.kind === "header" ? (
							<ActivityDayHeaderRow day={row.day} />
						) : (
							<ActivityCardsRow
								row={row}
								itemAppearance={itemAppearance}
								selectedNotePath={selectedNotePath}
								taskSummariesByPath={taskSummariesByPath}
								shouldReduceMotion={shouldReduceMotion}
								onSelectNote={onSelectNote}
								onOpenFile={onOpenFile}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}

function ActivityDayHeaderRow({ day }: { day: ActivityDay }) {
	const { t, i18n } = useTranslation("shell");
	const dateDisplayFormat = useDateDisplayFormat();
	const today = startOfDay(new Date());
	const isToday = isSameDay(day.date, today);
	const label = isToday
		? t("activity.today")
		: isSameDay(day.date, subDays(today, 1))
			? t("activity.yesterday")
			: new Intl.DateTimeFormat(i18n.language, { weekday: "long" }).format(day.date);
	const fullDate =
		dateDisplayFormat === "friendly"
			? new Intl.DateTimeFormat(i18n.language, { dateStyle: "long" }).format(day.date)
			: formatDisplayDate(day.date, dateDisplayFormat);
	return (
		<section className="activityDayGroup activityDayHeaderRow" data-today={isToday || undefined}>
			<div className="activityDayRail" aria-hidden="true" />
			<header className="activityDayHeader">
				<div className="activityDayHeading">
					<div className="activityDateBadge" aria-hidden="true">
						<span>
							{new Intl.DateTimeFormat(i18n.language, { month: "short" }).format(day.date)}
						</span>
						<strong>
							{new Intl.DateTimeFormat(i18n.language, { day: "numeric" }).format(day.date)}
						</strong>
					</div>
					<div>
						<h2>{label}</h2>
						<time className="activityDayDate" dateTime={day.dateKey}>
							{fullDate}
						</time>
					</div>
				</div>
				<span className="activityDayCounts">
					{t("activity.noteCount", { count: day.notes.size })}
				</span>
			</header>
		</section>
	);
}

interface ActivityCardsRowProps {
	row: Extract<ActivityVirtualRow, { kind: "cards" }>;
	itemAppearance: Record<string, FileTreeAppearance>;
	selectedNotePath: string | null;
	taskSummariesByPath: Record<string, NoteTaskSummary>;
	shouldReduceMotion: boolean;
	onSelectNote: (notePath: string) => void;
	onOpenFile: (relPath: string) => Promise<void>;
}

function ActivityCardsRow({
	row,
	itemAppearance,
	selectedNotePath,
	taskSummariesByPath,
	shouldReduceMotion,
	onSelectNote,
	onOpenFile,
}: ActivityCardsRowProps) {
	return (
		<section
			className={row.timeline ? "activityDayGroup activityDayCardsRow" : "activityCardsOnlyRow"}
		>
			{row.timeline ? <div className="activityDayRail" aria-hidden="true" /> : null}
			<div className="activityNoteGrid allDocsGrid">
				{row.notes.map((item, noteIndex) => {
					const absoluteNoteIndex = row.startIndex + noteIndex;
					const cardProps = prepareAllDocsCardProps({
						note: item.note,
						index: absoluteNoteIndex,
						sectionIndex: row.dayIndex,
						selectedNotePath,
						taskSummariesByPath,
						selectNote: onSelectNote,
						onOpenFile,
					});
					return (
						<AllDocsCard
							key={item.note.note_path}
							{...cardProps}
							noteAppearance={itemAppearance[item.note.note_path] ?? null}
							shouldReduceMotion={shouldReduceMotion}
							springPreset={springPresets.snappy}
							TaskProgressComponent={TaskProgressIndicator}
						/>
					);
				})}
			</div>
		</section>
	);
}

export const ActivityTimelinePane = memo(function ActivityTimelinePane({
	kind = "all",
	onOpenFile,
}: ActivityTimelinePaneProps) {
	const { itemAppearance } = useFileTreeContext();
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const {
		dailyNotesFolder,
		defaultNewNoteFolder,
		settingsSpacePath,
		openSettings,
		archiveEnabled,
	} = useUILayoutContext();
	const folder = kind === "inbox" && settingsSpacePath === spacePath ? defaultNewNoteFolder : null;
	const needsSetup =
		(kind === "inbox" && !folder) ||
		(kind === "archive" && (!archiveEnabled || settingsSpacePath !== spacePath));
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [paneElement, setPaneElement] = useState<HTMLElement | null>(null);
	const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
	const {
		feedNotes,
		notesQuery,
		taskSummariesByPath,
		columns,
		visibleMonthCounts,
		maxCount,
		feedDays,
		recentNotesCount,
	} = useActivityTimelineData(
		dailyNotesFolder,
		folder,
		kind === "archive",
		Boolean(spacePath) && !needsSetup,
		kind === "all",
	);
	const virtualRows = useActivityRows(feedDays, kind === "all" ? undefined : feedNotes);
	const { rowVirtualizer, virtualItems } = useActivityVirtualization(paneElement, virtualRows);

	useVirtualLoadMore({
		hasMore: !needsSetup && notesQuery.hasNextPage,
		isLoading: notesQuery.isFetchingNextPage,
		onLoadMore: notesQuery.fetchNextPage,
		virtualItems,
		totalItems: virtualRows.length,
		remainingItems: 6,
	});

	if (needsSetup) {
		return (
			<section className="activityTimelinePane">
				<h1 className="activityTimelineTitle">
					{kind === "inbox" ? <HugeiconsIcon icon={InboxIcon} size="var(--icon-2xl)" /> : null}
					{t(kind === "archive" ? "sidebar.archive" : "sidebar.inbox")}
				</h1>
				<Button className="self-start" variant="ghost" onClick={() => openSettings("space")}>
					{t(
						kind === "archive" ? "noteCollections.enableArchive" : "noteCollections.configureInbox",
					)}
				</Button>
			</section>
		);
	}

	if (notesQuery.isLoading) {
		return <CanvasPaneAwait variant="all-docs" />;
	}

	if (notesQuery.error) {
		return (
			<div className="databaseLoadingState">
				Could not load activity:{" "}
				{notesQuery.error instanceof Error ? notesQuery.error.message : String(notesQuery.error)}
			</div>
		);
	}

	return (
		<section ref={setPaneElement} className="activityTimelinePane">
			<header className="activityTimelineHeader">
				<div>
					<h1 className="activityTimelineTitle">
						<HugeiconsIcon
							icon={kind === "inbox" ? InboxIcon : kind === "archive" ? Archive04Icon : NoteIcon}
							size="var(--icon-2xl)"
						/>
						<span>{t(kind === "all" ? "sidebar.allNotes" : `sidebar.${kind}`)}</span>
					</h1>
					{kind === "all" ? (
						<>
							<p className="activityTimelineSummary" title={t("activity.summaryHint")}>
								{recentNotesCount === 0
									? t("activity.noRecentNotes")
									: t("activity.recentNotes", { count: recentNotesCount })}
							</p>
							<div className="activityHeatmapLegend" aria-hidden="true">
								<span>{t("activity.less")}</span>
								{[0, 1, 2, 3, 4].map((level) => (
									<span key={level} className="activityHeatmapLegendCell" data-level={level} />
								))}
								<span>{t("activity.more")}</span>
							</div>
						</>
					) : null}
				</div>
			</header>
			{kind === "all" ? (
				<ActivityHeatmap
					columns={columns}
					visibleMonthCounts={visibleMonthCounts}
					maxCount={maxCount}
				/>
			) : null}
			{!feedNotes.length && kind !== "all" ? (
				<div className="databaseLoadingState">
					{t(kind === "inbox" ? "noteCollections.inboxEmpty" : "noteCollections.archiveEmpty")}
				</div>
			) : (
				<ActivityFeed
					virtualRows={virtualRows}
					virtualItems={virtualItems}
					rowVirtualizer={rowVirtualizer}
					itemAppearance={itemAppearance}
					selectedNotePath={selectedNotePath}
					taskSummariesByPath={taskSummariesByPath}
					shouldReduceMotion={shouldReduceMotion}
					onSelectNote={setSelectedNotePath}
					onOpenFile={onOpenFile}
				/>
			)}
			{notesQuery.hasNextPage ? (
				<Button
					type="button"
					className="self-start"
					variant="ghost"
					size="sm"
					disabled={notesQuery.isFetchingNextPage}
					onClick={() => void notesQuery.fetchNextPage()}
				>
					{notesQuery.isFetchingNextPage ? "Loading..." : "Load older notes"}
				</Button>
			) : null}
		</section>
	);
});
