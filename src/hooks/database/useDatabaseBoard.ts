import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	DATABASE_BOARD_EMPTY_LANE_ID,
	type DatabaseBoardLane,
	createBoardLanes,
	getBoardGroupColumns,
	moveBoardCardToLane,
	moveBoardLaneToIndex,
	orderBoardLaneRows,
	orderBoardLanes,
} from "../../lib/database/board";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";

interface UseDatabaseBoardParams {
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	initialGroupColumnId?: string | null;
	initialLaneOrderByGroup?: Record<string, string[]>;
	initialCardOrderByGroup?: Record<string, Record<string, string[]>>;
	/** True only when `rows` is every row of the collection (all pages, no filter or search). */
	membershipComplete: boolean;
	onLaneOrderChange?: (groupColumnId: string, laneOrder: string[]) => void | Promise<void>;
	onCardOrderChange?: (
		groupColumnId: string,
		cardOrder: Record<string, string[]>,
	) => void | Promise<void>;
}

function laneOrdersEqual(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((laneId, index) => right[index] === laneId);
}

function laneOrderRecordsEqual(
	left: Record<string, string[]>,
	right: Record<string, string[]>,
): boolean {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;

	const rightKeySet = new Set(rightKeys);
	return leftKeys.every(
		(key) => rightKeySet.has(key) && laneOrdersEqual(left[key] ?? [], right[key] ?? []),
	);
}

function cardOrdersEqual(left: Record<string, string[]>, right: Record<string, string[]>): boolean {
	return laneOrderRecordsEqual(left, right);
}

function cardOrderRecordsEqual(
	left: Record<string, Record<string, string[]>>,
	right: Record<string, Record<string, string[]>>,
): boolean {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;

	const rightKeySet = new Set(rightKeys);
	return leftKeys.every(
		(key) => rightKeySet.has(key) && cardOrdersEqual(left[key] ?? {}, right[key] ?? {}),
	);
}

function displayLaneOrder(lanes: DatabaseBoardLane[]): string[] {
	return lanes.map((lane) => lane.id).filter((laneId) => laneId !== DATABASE_BOARD_EMPTY_LANE_ID);
}

function mergeLaneOrder(currentLaneOrder: string[], displayedLaneOrder: string[]): string[] {
	const currentLaneSet = new Set(currentLaneOrder);
	return [
		...currentLaneOrder.filter((laneId) => laneId !== DATABASE_BOARD_EMPTY_LANE_ID),
		...displayedLaneOrder.filter(
			(laneId) => laneId !== DATABASE_BOARD_EMPTY_LANE_ID && !currentLaneSet.has(laneId),
		),
	];
}

function pruneLaneOrderRecord(
	laneOrderByGroup: Record<string, string[]>,
	activeGroupIds: Set<string>,
): Record<string, string[]> {
	return Object.fromEntries(
		Object.entries(laneOrderByGroup).filter(([groupColumnId]) => activeGroupIds.has(groupColumnId)),
	);
}

function pruneCardOrderRecord(
	cardOrderByGroup: Record<string, Record<string, string[]>>,
	activeGroupIds: Set<string>,
): Record<string, Record<string, string[]>> {
	return Object.fromEntries(
		Object.entries(cardOrderByGroup).filter(([groupColumnId]) => activeGroupIds.has(groupColumnId)),
	);
}

function laneRowsById(lanes: DatabaseBoardLane[]): Record<string, string[]> {
	return Object.fromEntries(lanes.map((lane) => [lane.id, lane.rows.map((row) => row.note_path)]));
}

function mergeCardOrder(
	currentCardOrder: Record<string, string[]>,
	displayedCardOrder: Record<string, string[]>,
	membershipComplete: boolean,
): Record<string, string[]> {
	const loadedPaths = new Set(Object.values(displayedCardOrder).flat());
	const laneIds = new Set([...Object.keys(currentCardOrder), ...Object.keys(displayedCardOrder)]);
	const nextEntries = [...laneIds]
		.map((laneId) => {
			const displayedOrder = displayedCardOrder[laneId] ?? [];
			const displayedSet = new Set(displayedOrder);
			const currentOrder = currentCardOrder[laneId] ?? [];
			const currentSet = new Set(currentOrder);
			const nextOrder = [
				...currentOrder.filter(
					(notePath) =>
						displayedSet.has(notePath) || (!membershipComplete && !loadedPaths.has(notePath)),
				),
				...displayedOrder.filter((notePath) => !currentSet.has(notePath)),
			];
			return [laneId, nextOrder] as const;
		})
		.filter(([, order]) => order.length > 0);
	return Object.fromEntries(nextEntries);
}

export function useDatabaseBoard({
	rows,
	columns,
	initialGroupColumnId = null,
	initialLaneOrderByGroup = {},
	initialCardOrderByGroup = {},
	membershipComplete,
	onLaneOrderChange,
	onCardOrderChange,
}: UseDatabaseBoardParams) {
	const groupColumns = useMemo(() => getBoardGroupColumns(columns), [columns]);
	const [laneOrderByGroup, setLaneOrderByGroup] = useState<Record<string, string[]>>(
		() => initialLaneOrderByGroup,
	);
	const [cardOrderByGroup, setCardOrderByGroup] = useState<
		Record<string, Record<string, string[]>>
	>(() => initialCardOrderByGroup);
	const displayedLaneIdsRef = useRef<Record<string, string[]>>(initialLaneOrderByGroup);
	const displayedCardIdsRef =
		useRef<Record<string, Record<string, string[]>>>(initialCardOrderByGroup);
	const onLaneOrderChangeRef = useRef(onLaneOrderChange);
	const onCardOrderChangeRef = useRef(onCardOrderChange);

	useEffect(() => {
		onLaneOrderChangeRef.current = onLaneOrderChange;
	}, [onLaneOrderChange]);

	useEffect(() => {
		onCardOrderChangeRef.current = onCardOrderChange;
	}, [onCardOrderChange]);

	useEffect(() => {
		if (laneOrderRecordsEqual(displayedLaneIdsRef.current, initialLaneOrderByGroup)) return;
		displayedLaneIdsRef.current = initialLaneOrderByGroup;
		setLaneOrderByGroup((current) =>
			laneOrderRecordsEqual(current, initialLaneOrderByGroup) ? current : initialLaneOrderByGroup,
		);
	}, [initialLaneOrderByGroup]);

	useEffect(() => {
		if (cardOrderRecordsEqual(displayedCardIdsRef.current, initialCardOrderByGroup)) return;
		displayedCardIdsRef.current = initialCardOrderByGroup;
		setCardOrderByGroup((current) =>
			cardOrderRecordsEqual(current, initialCardOrderByGroup) ? current : initialCardOrderByGroup,
		);
	}, [initialCardOrderByGroup]);

	const groupColumn = useMemo(
		() =>
			groupColumns.find((column) => column.id === initialGroupColumnId) ?? groupColumns[0] ?? null,
		[groupColumns, initialGroupColumnId],
	);

	const lanes = useMemo(() => {
		const previousLaneIds =
			groupColumn != null
				? (laneOrderByGroup[groupColumn.id] ?? displayedLaneIdsRef.current[groupColumn.id] ?? [])
				: [];
		const rawLanes = createBoardLanes(rows, groupColumn, previousLaneIds);
		if (!groupColumn) return rawLanes;
		const orderedLanes = orderBoardLanes(rawLanes, previousLaneIds);
		const previousCardOrder =
			cardOrderByGroup[groupColumn.id] ?? displayedCardIdsRef.current[groupColumn.id] ?? {};
		return orderBoardLaneRows(orderedLanes, previousCardOrder);
	}, [cardOrderByGroup, groupColumn, laneOrderByGroup, rows]);

	useEffect(() => {
		if (!groupColumn) return;
		const displayedLaneOrder = displayLaneOrder(lanes);
		if (displayedLaneOrder.length === 0) return;

		const currentLaneOrder =
			laneOrderByGroup[groupColumn.id] ?? displayedLaneIdsRef.current[groupColumn.id] ?? [];
		const nextLaneOrder = mergeLaneOrder(currentLaneOrder, displayedLaneOrder);
		if (laneOrdersEqual(currentLaneOrder, nextLaneOrder)) return;

		const activeGroupIds = new Set(groupColumns.map((column) => column.id));
		displayedLaneIdsRef.current = pruneLaneOrderRecord(
			{
				...displayedLaneIdsRef.current,
				[groupColumn.id]: nextLaneOrder,
			},
			activeGroupIds,
		);
		setLaneOrderByGroup((current) => {
			const nextLaneOrderByGroup = pruneLaneOrderRecord(
				{
					...current,
					[groupColumn.id]: nextLaneOrder,
				},
				activeGroupIds,
			);
			return laneOrderRecordsEqual(current, nextLaneOrderByGroup) ? current : nextLaneOrderByGroup;
		});
		void onLaneOrderChangeRef.current?.(groupColumn.id, nextLaneOrder);
	}, [groupColumn, groupColumns, laneOrderByGroup, lanes]);

	useEffect(() => {
		if (!groupColumn) return;
		const displayedCardOrder = laneRowsById(lanes);
		const currentCardOrder =
			cardOrderByGroup[groupColumn.id] ?? displayedCardIdsRef.current[groupColumn.id] ?? {};
		const nextCardOrder = mergeCardOrder(currentCardOrder, displayedCardOrder, membershipComplete);
		if (cardOrdersEqual(currentCardOrder, nextCardOrder)) return;

		const activeGroupIds = new Set(groupColumns.map((column) => column.id));
		displayedCardIdsRef.current = pruneCardOrderRecord(
			{
				...displayedCardIdsRef.current,
				[groupColumn.id]: nextCardOrder,
			},
			activeGroupIds,
		);
		setCardOrderByGroup((current) => {
			const nextCardOrderByGroup = pruneCardOrderRecord(
				{
					...current,
					[groupColumn.id]: nextCardOrder,
				},
				activeGroupIds,
			);
			return cardOrderRecordsEqual(current, nextCardOrderByGroup) ? current : nextCardOrderByGroup;
		});
		void onCardOrderChangeRef.current?.(groupColumn.id, nextCardOrder);
	}, [cardOrderByGroup, groupColumn, groupColumns, lanes, membershipComplete]);

	const moveLaneToIndex = useCallback(
		(sourceLaneId: string, targetIndex: number) => {
			if (!groupColumn) return;
			const laneIds = lanes.map((lane) => lane.id);
			const nextLaneOrder = moveBoardLaneToIndex(laneIds, sourceLaneId, targetIndex);
			const currentLaneOrder = laneOrderByGroup[groupColumn.id] ?? [];
			if (laneOrdersEqual(nextLaneOrder, currentLaneOrder)) {
				return;
			}
			const activeGroupIds = new Set(groupColumns.map((column) => column.id));
			displayedLaneIdsRef.current = pruneLaneOrderRecord(
				{
					...displayedLaneIdsRef.current,
					[groupColumn.id]: nextLaneOrder,
				},
				activeGroupIds,
			);
			setLaneOrderByGroup((current) => ({
				...current,
				[groupColumn.id]: nextLaneOrder,
			}));
			void onLaneOrderChangeRef.current?.(groupColumn.id, nextLaneOrder);
		},
		[groupColumn, groupColumns, laneOrderByGroup, lanes],
	);

	const renameLane = useCallback(
		(sourceLaneId: string, nextLaneId: string, failedPaths: string[]) => {
			if (
				!groupColumn ||
				sourceLaneId === DATABASE_BOARD_EMPTY_LANE_ID ||
				nextLaneId === DATABASE_BOARD_EMPTY_LANE_ID ||
				sourceLaneId === nextLaneId
			) {
				return;
			}

			// Cards that failed to rename stay in the source lane, so it keeps its slot and the
			// new lane goes right after it; otherwise the new lane takes the source lane's slot.
			const failedSet = new Set(failedPaths);
			const currentLaneOrder = (
				laneOrderByGroup[groupColumn.id] ??
				displayedLaneIdsRef.current[groupColumn.id] ??
				displayLaneOrder(lanes)
			).filter((laneId) => laneId !== nextLaneId);
			const nextLaneOrder = currentLaneOrder.flatMap((laneId) => {
				if (laneId !== sourceLaneId) return [laneId];
				return failedSet.size > 0 ? [sourceLaneId, nextLaneId] : [nextLaneId];
			});
			const currentCardOrder =
				cardOrderByGroup[groupColumn.id] ?? displayedCardIdsRef.current[groupColumn.id] ?? {};
			const sourceOrder = currentCardOrder[sourceLaneId] ?? [];
			const nextCardOrder = Object.fromEntries(
				Object.entries(currentCardOrder).filter(
					([laneId]) => laneId !== sourceLaneId && laneId !== nextLaneId,
				),
			);
			const movedOrder = sourceOrder.filter((notePath) => !failedSet.has(notePath));
			const keptOrder = sourceOrder.filter((notePath) => failedSet.has(notePath));
			if (movedOrder.length > 0) nextCardOrder[nextLaneId] = movedOrder;
			if (keptOrder.length > 0) nextCardOrder[sourceLaneId] = keptOrder;

			displayedLaneIdsRef.current = {
				...displayedLaneIdsRef.current,
				[groupColumn.id]: nextLaneOrder,
			};
			displayedCardIdsRef.current = {
				...displayedCardIdsRef.current,
				[groupColumn.id]: nextCardOrder,
			};
			setLaneOrderByGroup((current) => ({
				...current,
				[groupColumn.id]: nextLaneOrder,
			}));
			setCardOrderByGroup((current) => ({
				...current,
				[groupColumn.id]: nextCardOrder,
			}));
			void onLaneOrderChangeRef.current?.(groupColumn.id, nextLaneOrder);
			void onCardOrderChangeRef.current?.(groupColumn.id, nextCardOrder);
		},
		[cardOrderByGroup, groupColumn, laneOrderByGroup, lanes],
	);

	const moveCardToLane = useCallback(
		(
			notePath: string,
			targetLaneId: string,
			targetNotePath?: string | null,
			sourceLaneId?: string | null,
		) => {
			if (!groupColumn) return;
			const displayedCardOrder = laneRowsById(lanes);
			const currentCardOrder =
				cardOrderByGroup[groupColumn.id] ?? displayedCardIdsRef.current[groupColumn.id] ?? {};
			const nextCardOrder = moveBoardCardToLane(
				currentCardOrder,
				displayedCardOrder,
				notePath,
				targetLaneId,
				targetNotePath,
				sourceLaneId,
			);
			if (cardOrdersEqual(currentCardOrder, nextCardOrder)) return;
			displayedCardIdsRef.current = {
				...displayedCardIdsRef.current,
				[groupColumn.id]: nextCardOrder,
			};
			setCardOrderByGroup((current) => ({
				...current,
				[groupColumn.id]: nextCardOrder,
			}));
			void onCardOrderChangeRef.current?.(groupColumn.id, nextCardOrder);
		},
		[cardOrderByGroup, groupColumn, lanes],
	);

	return {
		groupColumns,
		groupColumn,
		lanes,
		moveLaneToIndex,
		renameLane,
		moveCardToLane,
	};
}
