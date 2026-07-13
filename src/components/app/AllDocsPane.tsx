import { TimelineEventIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	isSameDay,
	isSameMonth,
	isSameWeek,
	startOfToday,
	subDays,
} from "date-fns";
import { useReducedMotion } from "motion/react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext } from "../../contexts";

import { useHoverPrefetch } from "../../hooks/useHoverPrefetch";
import { useVirtualLoadMore } from "../../hooks/useLoadMoreTriggers";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import {
	ALL_DOCS_PAGE_SIZE,
	allDocsPagesQueryOptions,
	navigationQueryKeys,
} from "../../lib/navigationPrefetch";
import type { AllDocsItem } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";
import { AllDocsCard, prepareAllDocsCardProps } from "./AllDocsCard";
import { CanvasPaneAwait } from "./CanvasPaneAwait";

interface AllDocsPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
	onOpenActivity: () => void;
	onPrefetchActivity: () => void;
	initialNotes?: AllDocsItem[] | null;
}

type AllDocsSection = {
	id: string;
	label: string;
	notes: AllDocsItem[];
};

type VirtualAllDocsRow =
	| {
			id: string;
			kind: "header";
			label: string;
	  }
	| {
			id: string;
			kind: "cards";
			sectionIndex: number;
			rowIndex: number;
			notes: AllDocsItem[];
	  };

function sectionForDate(iso: string): AllDocsSection["id"] {
	const today = startOfToday();
	const yesterday = subDays(today, 1);

	try {
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return "earlier";
		if (isSameDay(date, today)) return "today";
		if (isSameDay(date, yesterday)) return "yesterday";
		if (isSameWeek(date, today, { weekStartsOn: 1 })) return "this-week";
		if (isSameMonth(date, today)) return "this-month";
		return "earlier";
	} catch {
		return "earlier";
	}
}

const SECTION_ORDER: Array<{ id: AllDocsSection["id"]; labelKey: string }> = [
	{ id: "today", labelKey: "allNotes.today" },
	{ id: "yesterday", labelKey: "allNotes.yesterday" },
	{ id: "this-week", labelKey: "allNotes.thisWeek" },
	{ id: "this-month", labelKey: "allNotes.thisMonth" },
	{ id: "earlier", labelKey: "allNotes.earlier" },
];

export const AllDocsPane = memo(function AllDocsPane({
	onOpenFile,
	onOpenActivity,
	onPrefetchActivity,
	initialNotes = null,
}: AllDocsPaneProps) {
	const { t } = useTranslation("shell");
	const { itemAppearance } = useFileTreeContext();
	const shouldReduceMotion = useReducedMotion() ?? false;
	const paneRef = useRef<HTMLElement>(null);
	const {
		cancelHoverPrefetch: cancelActivityHoverPrefetch,
		hoverPrefetchProps: activityHoverPrefetchProps,
	} = useHoverPrefetch(onPrefetchActivity);
	const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
	const [taskSummaryRefreshKey, setTaskSummaryRefreshKey] = useState(0);
	const [paneWidth, setPaneWidth] = useState(0);
	const queryClient = useQueryClient();
	const notesQuery = useInfiniteQuery({
		...allDocsPagesQueryOptions(null),
		// Prefetch keeps a 5-minute stale window; the pane should still refetch on open.
		staleTime: 0,
		initialData: initialNotes
			? {
					pages: [
						{
							items: initialNotes.slice(0, ALL_DOCS_PAGE_SIZE),
							nextOffset:
								initialNotes.length >= ALL_DOCS_PAGE_SIZE
									? ALL_DOCS_PAGE_SIZE
									: null,
						},
					],
					pageParams: [0],
				}
			: undefined,
		initialDataUpdatedAt: initialNotes ? 0 : undefined,
	});
	const notes = useMemo(
		() => notesQuery.data?.pages.flatMap((page) => page.items) ?? [],
		[notesQuery.data],
	);
	const notePaths = useMemo(() => notes.map((note) => note.note_path), [notes]);
	const taskSummariesByPath = useTaskSummariesForPaths(
		notePaths,
		true,
		taskSummaryRefreshKey,
	);
	useTauriEvent("notes:external_changed", () => {
		void queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.allDocs(),
		});
		setTaskSummaryRefreshKey((key) => key + 1);
	});

	useEffect(() => {
		const pane = paneRef.current;
		if (!pane) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			setPaneWidth(entry.contentRect.width);
		});
		observer.observe(pane);
		setPaneWidth(pane.clientWidth);
		return () => observer.disconnect();
	}, []);

	const sections = useMemo<AllDocsSection[]>(() => {
		const buckets = new Map<string, AllDocsItem[]>();
		for (const note of notes) {
			const id = sectionForDate(note.updated);
			const existing = buckets.get(id);
			if (existing) existing.push(note);
			else buckets.set(id, [note]);
		}
		return SECTION_ORDER.map((section) => ({
			id: section.id,
			label: t(section.labelKey),
			notes: buckets.get(section.id) ?? [],
		})).filter((section) => section.notes.length > 0);
	}, [notes, t]);

	const columnCount = useMemo(() => {
		const minCardWidth = paneWidth <= 640 ? 144 : paneWidth <= 900 ? 160 : 184;
		const gap = 14;
		return Math.max(1, Math.floor((paneWidth + gap) / (minCardWidth + gap)));
	}, [paneWidth]);
	const virtualRows = useMemo<VirtualAllDocsRow[]>(() => {
		const rows: VirtualAllDocsRow[] = [];
		for (const [sectionIndex, section] of sections.entries()) {
			rows.push({
				id: `header:${section.id}`,
				kind: "header",
				label: section.label,
			});
			for (
				let startIndex = 0, rowIndex = 0;
				startIndex < section.notes.length;
				startIndex += columnCount, rowIndex += 1
			) {
				rows.push({
					id: `cards:${section.id}:${rowIndex}`,
					kind: "cards",
					sectionIndex,
					rowIndex,
					notes: section.notes.slice(startIndex, startIndex + columnCount),
				});
			}
		}
		return rows;
	}, [columnCount, sections]);
	const cardEstimate = useMemo(() => {
		if (paneWidth <= 0) return 200;
		const gap = 14;
		const width = (paneWidth - gap * (columnCount - 1)) / columnCount;
		const minHeight = paneWidth <= 640 ? 176 : 184;
		return Math.max(minHeight, width) + gap;
	}, [columnCount, paneWidth]);
	const rowVirtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
		count: virtualRows.length,
		estimateSize: (index) =>
			virtualRows[index]?.kind === "header" ? 32 : cardEstimate,
		getScrollElement: () => paneRef.current,
		overscan: 5,
	});
	const virtualItems = rowVirtualizer.getVirtualItems();
	useVirtualLoadMore({
		hasMore: notesQuery.hasNextPage,
		isLoading: notesQuery.isFetchingNextPage,
		onLoadMore: notesQuery.fetchNextPage,
		virtualItems,
		totalItems: virtualRows.length,
		remainingItems: 4,
	});

	if (notesQuery.isLoading) {
		return <CanvasPaneAwait variant="all-docs" />;
	}

	if (notesQuery.error) {
		return (
			<div className="databaseLoadingState">
				Could not load all notes:{" "}
				{notesQuery.error instanceof Error
					? notesQuery.error.message
					: String(notesQuery.error)}
			</div>
		);
	}

	return (
		<section ref={paneRef} className="allDocsPane">
			<header className="allDocsHeader">
				<h1 className="allDocsTitle">{t("allNotes.title")}</h1>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={() => {
						cancelActivityHoverPrefetch();
						onOpenActivity();
					}}
					{...activityHoverPrefetchProps}
					onFocus={onPrefetchActivity}
					title={t("allNotes.showActivity")}
					aria-label={t("allNotes.showActivity")}
				>
					<HugeiconsIcon
						icon={TimelineEventIcon}
						strokeWidth={1}
						data-icon="inline-start"
					/>
					<span>{t("allNotes.showActivity")}</span>
				</Button>
			</header>
			<div
				className="allDocsSections is-virtualized"
				style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
			>
				{notes.length === 0 ? (
					<div className="databaseLoadingState">
						No notes yet. Create one to get started.
					</div>
				) : null}
				{virtualItems.map((virtualRow) => {
					const row = virtualRows[virtualRow.index];
					if (!row) return null;
					return (
						<div
							key={virtualRow.key}
							data-index={virtualRow.index}
							ref={(node) => rowVirtualizer.measureElement(node)}
							className="allDocsVirtualRow"
							style={{ transform: `translateY(${virtualRow.start}px)` }}
						>
							{row.kind === "header" ? (
								<h2 className="allDocsSectionTitle">{row.label}</h2>
							) : (
								<div className="allDocsGrid">
									{row.notes.map((note, index) => {
										const cardProps = prepareAllDocsCardProps({
											note,
											index: row.rowIndex * columnCount + index,
											sectionIndex: row.sectionIndex,
											selectedNotePath,
											taskSummariesByPath,
											selectNote: setSelectedNotePath,
											onOpenFile,
										});

										return (
											<AllDocsCard
												key={note.note_path}
												{...cardProps}
												noteAppearance={itemAppearance[note.note_path] ?? null}
												shouldReduceMotion={shouldReduceMotion}
												springPreset={springPresets.snappy}
												TaskProgressComponent={TaskProgressIndicator}
											/>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</section>
	);
});
