import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useMemo, useState } from "react";
import { createDatabaseRowGroups } from "../../lib/database/board";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import type { DatabaseGalleryCardSize } from "../../lib/tauri";
import { useVirtualLoadMore } from "../useLoadMoreTriggers";

const GALLERY_GAP = 14;
const GALLERY_HEADER_HEIGHT = 40;
const GALLERY_CARD_BODY_ESTIMATE = 96;
const GALLERY_LOAD_MORE_REMAINING_ROWS = 4;

const GALLERY_CARD_METRICS = {
	small: { minWidth: 180, coverHeight: 108 },
	medium: { minWidth: 240, coverHeight: 150 },
	large: { minWidth: 320, coverHeight: 210 },
} as const satisfies Record<DatabaseGalleryCardSize, { minWidth: number; coverHeight: number }>;

type GalleryVirtualRow =
	| { kind: "header"; id: string; label: string; count: number }
	| { kind: "cards"; id: string; rows: DatabaseRow[]; startIndex: number };

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}

function galleryRows(
	rows: DatabaseRow[],
	groupColumn: DatabaseColumn | null,
	columnCount: number,
): { virtualRows: GalleryVirtualRow[]; orderedRows: DatabaseRow[] } {
	const groups = createDatabaseRowGroups(rows, groupColumn);
	const sections =
		groups.length > 0 ? groups : [{ id: "all", label: "", rowCount: rows.length, rows }];
	const virtualRows: GalleryVirtualRow[] = [];
	const orderedRows: DatabaseRow[] = [];
	for (const section of sections) {
		if (groups.length > 0) {
			virtualRows.push({
				kind: "header",
				id: `header:${section.id}`,
				label: section.label,
				count: section.rowCount,
			});
		}
		for (const cards of chunk(section.rows, columnCount)) {
			virtualRows.push({
				kind: "cards",
				id: `cards:${section.id}:${cards[0]?.note_path ?? orderedRows.length}`,
				rows: cards,
				startIndex: orderedRows.length,
			});
			orderedRows.push(...cards);
		}
	}
	return { virtualRows, orderedRows };
}

interface UseGalleryLayoutOptions {
	rows: DatabaseRow[];
	groupColumn: DatabaseColumn | null;
	cardSize: DatabaseGalleryCardSize;
	hasMore: boolean;
	isLoadingMore: boolean;
	onLoadMore?: () => undefined | Promise<unknown>;
}

export function useGalleryLayout({
	rows,
	groupColumn,
	cardSize,
	hasMore,
	isLoadingMore,
	onLoadMore,
}: UseGalleryLayoutOptions) {
	const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);
	const scrollRef = useCallback((element: HTMLDivElement | null) => {
		setScrollElement(element);
		if (!element) return;
		setWidth(element.clientWidth);
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setWidth(entry.contentRect.width);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const metrics = GALLERY_CARD_METRICS[cardSize];
	const columnCount = Math.max(
		1,
		Math.floor((width + GALLERY_GAP) / (metrics.minWidth + GALLERY_GAP)),
	);
	const { virtualRows, orderedRows } = useMemo(
		() => galleryRows(rows, groupColumn, columnCount),
		[columnCount, groupColumn, rows],
	);

	const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
		count: virtualRows.length,
		estimateSize: (index) =>
			virtualRows[index]?.kind === "header"
				? GALLERY_HEADER_HEIGHT
				: metrics.coverHeight + GALLERY_CARD_BODY_ESTIMATE + GALLERY_GAP,
		getItemKey: (index) => virtualRows[index]?.id ?? index,
		getScrollElement: () => scrollElement,
		overscan: 3,
	});
	const virtualItems = virtualizer.getVirtualItems();

	useVirtualLoadMore({
		hasMore,
		isLoading: isLoadingMore,
		onLoadMore,
		virtualItems,
		totalItems: virtualRows.length,
		remainingItems: GALLERY_LOAD_MORE_REMAINING_ROWS,
	});

	const visibleRange = useMemo(() => {
		let start = Number.POSITIVE_INFINITY;
		let end = 0;
		for (const item of virtualItems) {
			const row = virtualRows[item.index];
			if (row?.kind !== "cards") continue;
			start = Math.min(start, row.startIndex);
			end = Math.max(end, row.startIndex + row.rows.length);
		}
		return Number.isFinite(start) ? { start, end } : { start: 0, end: 0 };
	}, [virtualItems, virtualRows]);

	return {
		scrollRef,
		virtualizer,
		virtualItems,
		virtualRows,
		orderedRows,
		visibleRange,
		columnCount,
		coverHeight: metrics.coverHeight,
	};
}
