import { Archive04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import {
	type VirtualItem,
	type Virtualizer,
	useVirtualizer,
} from "@tanstack/react-virtual";
import {
	addDays,
	format,
	isSameDay,
	isSameYear,
	parseISO,
	startOfDay,
	subDays,
} from "date-fns";
import { useReducedMotion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useFileTreeContext, useUILayoutContext } from "../../contexts";
import { useVirtualLoadMore } from "../../hooks/useLoadMoreTriggers";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { getDailyNotePath } from "../../lib/dailyNotes";
import {
	ACTIVITY_DOCS_PAGE_SIZE,
	loadAllDocs,
	loadAllDocsPage,
	navigationQueryKeys,
} from "../../lib/navigationPrefetch";
import type {
	AllDocsItem,
	FileTreeAppearance,
	NoteTaskSummary,
} from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import { springPresets } from "../ui/animations";
import { AllDocsCard, prepareAllDocsCardProps } from "./AllDocsCard";
import { CanvasPaneAwait } from "./CanvasPaneAwait";

interface ActivityTimelinePaneProps {
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
			dayIndex: number;
	  }
	| {
			id: string;
			kind: "cards";
			day: ActivityDay;
			dayIndex: number;
			chunkIndex: number;
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

function dayLabel(date: Date): string {
	const today = startOfDay(new Date());
	const yesterday = subDays(today, 1);
	if (isSameDay(date, today)) return "Today";
	if (isSameDay(date, yesterday)) return "Yesterday";
	return format(date, isSameYear(date, today) ? "EEEE, MMM d" : "MMM d, yyyy");
}

function monthLabel(date: Date): string {
	return format(date, "MMM");
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

function isDailyNote(
	notePath: string,
	date: string,
	dailyNotesFolder: string | null,
): boolean {
	return Boolean(
		dailyNotesFolder && notePath === getDailyNotePath(dailyNotesFolder, date),
	);
}

function buildActivityDays(
	notes: AllDocsItem[],
	dailyNotesFolder: string | null,
): ActivityDay[] {
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
		if (
			createdKey &&
			isDailyNote(note.note_path, createdKey, dailyNotesFolder)
		) {
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

	return [...byDate.values()].sort(
		(left, right) => left.date.getTime() - right.date.getTime(),
	);
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

function heatmapTooltip(day: ActivityDay): string {
	const noteCount = day.notes.size;
	const countLabel = noteCount === 1 ? "1 note" : `${noteCount} notes`;
	return `${countLabel} on ${format(day.date, "MMM d")}`;
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

function useActivityTimelineData(dailyNotesFolder: string | null) {
	const queryClient = useQueryClient();
	const notesQuery = useInfiniteQuery({
		queryKey: navigationQueryKeys.allDocsPages(null, ACTIVITY_DOCS_PAGE_SIZE),
		queryFn: ({ pageParam }) => {
			const offset = typeof pageParam === "number" ? pageParam : 0;
			return loadAllDocsPage(null, offset, ACTIVITY_DOCS_PAGE_SIZE);
		},
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
	});
	const heatmapNotesQuery = useQuery({
		queryKey: navigationQueryKeys.allDocsList(null),
		queryFn: () => loadAllDocs(null),
	});
	const feedNotes = useMemo(
		() => notesQuery.data?.pages.flatMap((page) => page.items) ?? [],
		[notesQuery.data],
	);
	const feedNotePaths = useMemo(
		() => feedNotes.map((note) => note.note_path),
		[feedNotes],
	);
	const taskSummariesByPath = useTaskSummariesForPaths(feedNotePaths, true, 0);
	const heatmapNotes = heatmapNotesQuery.data ?? feedNotes;
	const activityDays = useMemo(
		() => buildActivityDays(heatmapNotes, dailyNotesFolder),
		[heatmapNotes, dailyNotesFolder],
	);
	const feedActivityDays = useMemo(
		() => buildActivityDays(feedNotes, dailyNotesFolder),
		[feedNotes, dailyNotesFolder],
	);
	const recentStart = useMemo(
		() => subDays(startOfDay(new Date()), HEATMAP_DAYS - 1),
		[],
	);
	const recentActivityDays = useMemo(
		() =>
			activityDays.filter((day) => day.date.getTime() >= recentStart.getTime()),
		[activityDays, recentStart],
	);
	const columns = useMemo(
		() => heatmapColumns(recentActivityDays),
		[recentActivityDays],
	);
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

	useTauriEvent("notes:external_changed", () => {
		void queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.allDocs(),
		});
	});

	return {
		notesQuery,
		taskSummariesByPath,
		columns,
		visibleMonthCounts,
		maxCount,
		feedDays,
		recentNotesCount,
	};
}

function useActivityRows(feedDays: ActivityDay[]): ActivityVirtualRow[] {
	return useMemo<ActivityVirtualRow[]>(() => {
		const rows: ActivityVirtualRow[] = [];
		for (const [dayIndex, day] of feedDays.entries()) {
			rows.push({
				id: `header:${day.dateKey}`,
				kind: "header",
				day,
				dayIndex,
			});
			const notes = sortedDayNotes(day);
			for (
				let startIndex = 0, chunkIndex = 0;
				startIndex < notes.length;
				startIndex += ACTIVITY_DOCS_PAGE_SIZE, chunkIndex += 1
			) {
				rows.push({
					id: `cards:${day.dateKey}:${chunkIndex}`,
					kind: "cards",
					day,
					dayIndex,
					chunkIndex,
					startIndex,
					notes: notes.slice(startIndex, startIndex + ACTIVITY_DOCS_PAGE_SIZE),
				});
			}
		}
		return rows;
	}, [feedDays]);
}

function useActivityVirtualization(
	paneElement: HTMLElement | null,
	virtualRows: ActivityVirtualRow[],
) {
	const [paneWidth, setPaneWidth] = useState(0);
	const columnCount = useMemo(() => {
		const contentWidth =
			paneWidth <= 0 ? ACTIVITY_CONTENT_MAX_WIDTH : Math.min(paneWidth, 860);
		const minCardWidth =
			contentWidth <= 640 ? 144 : contentWidth <= 900 ? 160 : 184;
		const gap = 14;
		return Math.max(1, Math.floor((contentWidth + gap) / (minCardWidth + gap)));
	}, [paneWidth]);
	const cardEstimate = useMemo(() => {
		const contentWidth =
			paneWidth <= 0 ? ACTIVITY_CONTENT_MAX_WIDTH : Math.min(paneWidth, 860);
		const gap = 14;
		const width = (contentWidth - gap * (columnCount - 1)) / columnCount;
		const minHeight = contentWidth <= 640 ? 176 : 184;
		return Math.max(minHeight, width) + gap;
	}, [columnCount, paneWidth]);
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

function ActivityHeatmap({
	columns,
	visibleMonthCounts,
	maxCount,
}: ActivityHeatmapProps) {
	return (
		<div className="activityHeatmapBlock" aria-label="Recent note activity">
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
							{show && first ? monthLabel(first.date) : ""}
						</span>
					);
				})}
			</div>
			<div className="activityHeatmapGrid">
				{columns.map((column) => (
					<div key={column[0]?.dateKey} className="activityHeatmapColumn">
						{column.map((day) => {
							const level = intensity(day, maxCount);
							const tooltip = heatmapTooltip(day);
							return (
								<span
									key={day.dateKey}
									className="activityHeatmapCell"
									data-level={level}
									data-tooltip={tooltip}
									title={tooltip}
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
	feedDays: ActivityDay[];
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
	feedDays,
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
	if (feedDays.length === 0) {
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
	return (
		<section className="activityDayGroup activityDayHeaderRow">
			<div className="activityDayRail" aria-hidden="true" />
			<header className="activityDayHeader">
				<div>
					<h2>{dayLabel(day.date)}</h2>
				</div>
				<div className="activityDayCounts">
					<span>
						{day.notes.size} {day.notes.size === 1 ? "note" : "notes"}
					</span>
				</div>
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
		<section className="activityDayGroup activityDayCardsRow">
			<div className="activityDayRail" aria-hidden="true" />
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
	onOpenFile,
}: ActivityTimelinePaneProps) {
	const { itemAppearance } = useFileTreeContext();
	const { dailyNotesFolder } = useUILayoutContext();
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [paneElement, setPaneElement] = useState<HTMLElement | null>(null);
	const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
	const paneRef = useCallback((node: HTMLElement | null) => {
		setPaneElement(node);
	}, []);
	const {
		notesQuery,
		taskSummariesByPath,
		columns,
		visibleMonthCounts,
		maxCount,
		feedDays,
		recentNotesCount,
	} = useActivityTimelineData(dailyNotesFolder);
	const virtualRows = useActivityRows(feedDays);
	const { rowVirtualizer, virtualItems } = useActivityVirtualization(
		paneElement,
		virtualRows,
	);

	useVirtualLoadMore({
		hasMore: notesQuery.hasNextPage,
		isLoading: notesQuery.isFetchingNextPage,
		onLoadMore: notesQuery.fetchNextPage,
		virtualItems,
		totalItems: virtualRows.length,
		remainingItems: 6,
	});

	if (notesQuery.isLoading) {
		return <CanvasPaneAwait variant="all-docs" />;
	}

	if (notesQuery.error) {
		return (
			<div className="databaseLoadingState">
				Could not load activity:{" "}
				{notesQuery.error instanceof Error
					? notesQuery.error.message
					: String(notesQuery.error)}
			</div>
		);
	}

	return (
		<section ref={paneRef} className="activityTimelinePane">
			<header className="activityTimelineHeader">
				<div>
					<h1 className="activityTimelineTitle">
						<HugeiconsIcon
							icon={Archive04Icon}
							size="var(--icon-2xl)"
							strokeWidth={0.9}
						/>
						<span>All Notes</span>
					</h1>
					<p
						className="activityTimelineSummary"
						title="Includes note creation dates and latest edit dates."
					>
						{recentNotesCount === 0
							? "No notes worked on in the last year"
							: `${recentNotesCount} notes created or edited in the last year`}
					</p>
					<div className="activityHeatmapLegend" aria-hidden="true">
						<span>Less</span>
						{[0, 1, 2, 3, 4].map((level) => (
							<span
								key={level}
								className="activityHeatmapLegendCell"
								data-level={level}
							/>
						))}
						<span>More</span>
					</div>
				</div>
			</header>
			<ActivityHeatmap
				columns={columns}
				visibleMonthCounts={visibleMonthCounts}
				maxCount={maxCount}
			/>
			<ActivityFeed
				feedDays={feedDays}
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
			{notesQuery.hasNextPage ? (
				<button
					type="button"
					className="activityLoadMore"
					disabled={notesQuery.isFetchingNextPage}
					onClick={() => void notesQuery.fetchNextPage()}
				>
					{notesQuery.isFetchingNextPage ? "Loading..." : "Load older notes"}
				</button>
			) : null}
		</section>
	);
});
