import { startTransition, useCallback, useMemo, useRef, useState } from "react";
import {
	createBoardLanes,
	defaultBoardGroupColumnId,
	getBoardGroupColumns,
	moveBoardLaneToIndex,
	orderBoardLanes,
} from "../../lib/database/board";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";

interface UseDatabaseBoardParams {
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	initialGroupColumnId?: string | null;
	initialLaneOrderByGroup?: Record<string, string[]>;
	onGroupColumnIdChange?: (groupColumnId: string | null) => void;
	onLaneOrderChange?: (
		groupColumnId: string,
		laneOrder: string[],
	) => void | Promise<void>;
}

export function useDatabaseBoard({
	rows,
	columns,
	initialGroupColumnId = null,
	initialLaneOrderByGroup = {},
	onGroupColumnIdChange,
	onLaneOrderChange,
}: UseDatabaseBoardParams) {
	const groupColumns = useMemo(() => getBoardGroupColumns(columns), [columns]);
	const [rawGroupColumnId, setRawGroupColumnId] = useState<string | null>(
		() => null,
	);
	const [laneOrderByGroup, setLaneOrderByGroup] = useState<
		Record<string, string[]>
	>(() => initialLaneOrderByGroup);

	const effectiveGroupColumnId = useMemo(() => {
		const candidate = rawGroupColumnId ?? initialGroupColumnId;
		if (candidate && groupColumns.some((column) => column.id === candidate)) {
			return candidate;
		}
		return defaultBoardGroupColumnId(groupColumns);
	}, [groupColumns, initialGroupColumnId, rawGroupColumnId]);

	const groupColumn = useMemo(
		() =>
			groupColumns.find((column) => column.id === effectiveGroupColumnId) ??
			groupColumns[0] ??
			null,
		[effectiveGroupColumnId, groupColumns],
	);

	const displayedLaneIdsRef = useRef<Record<string, string[]>>({});

	const lanes = useMemo(() => {
		const rawLanes = createBoardLanes(rows, groupColumn);
		if (!groupColumn) return rawLanes;
		const previousLaneIds = laneOrderByGroup[groupColumn.id] ?? [];
		return orderBoardLanes(rawLanes, previousLaneIds);
	}, [groupColumn, laneOrderByGroup, rows]);

	const moveLaneToIndex = useCallback(
		(sourceLaneId: string, targetIndex: number) => {
			if (!groupColumn) return;
			const laneIds = lanes.map((lane) => lane.id);
			const nextLaneOrder = moveBoardLaneToIndex(
				laneIds,
				sourceLaneId,
				targetIndex,
			);
			const currentLaneOrder = laneOrderByGroup[groupColumn.id] ?? [];
			if (
				nextLaneOrder.length === currentLaneOrder.length &&
				nextLaneOrder.every(
					(laneId, index) => currentLaneOrder[index] === laneId,
				)
			) {
				return;
			}
			const activeGroupIds = new Set(groupColumns.map((column) => column.id));
			displayedLaneIdsRef.current = Object.fromEntries(
				Object.entries({
					...displayedLaneIdsRef.current,
					[groupColumn.id]: nextLaneOrder,
				}).filter(([groupColumnId]) => activeGroupIds.has(groupColumnId)),
			);
			setLaneOrderByGroup((current) => ({
				...current,
				[groupColumn.id]: nextLaneOrder,
			}));
			void onLaneOrderChange?.(groupColumn.id, nextLaneOrder);
		},
		[groupColumn, groupColumns, laneOrderByGroup, lanes, onLaneOrderChange],
	);

	return {
		groupColumns,
		groupColumn,
		groupColumnId: effectiveGroupColumnId,
		lanes,
		moveLaneToIndex,
		setGroupColumnId: (nextColumnId: string | null) => {
			startTransition(() => setRawGroupColumnId(nextColumnId));
			onGroupColumnIdChange?.(nextColumnId);
		},
	};
}
