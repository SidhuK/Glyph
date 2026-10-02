import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useState } from "react";
import { ACTIVITY_DOCS_PAGE_SIZE } from "../../../lib/navigationPrefetch";
import type { AllDocsItem } from "../../../lib/tauri";
import { type ActivityDay, sortedDayNotes } from "./activityDays";

export type ActivityVirtualRow =
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
			notes: AllDocsItem[];
	  };

const ACTIVITY_CONTENT_MAX_WIDTH = 860;

export function useActivityRows(
	feedDays: ActivityDay[],
	collectionNotes?: AllDocsItem[],
): ActivityVirtualRow[] {
	return useMemo<ActivityVirtualRow[]>(() => {
		const rows: ActivityVirtualRow[] = [];
		const groups = collectionNotes
			? [{ day: null, notes: collectionNotes }]
			: feedDays.map((day) => ({ day, notes: sortedDayNotes(day).map(({ note }) => note) }));
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

export function useActivityVirtualization(
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
		// Selecting a heatmap day swaps the rows, so key measurements by row rather than index.
		getItemKey: (index) => virtualRows[index]?.id ?? index,
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
