import {
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	DATABASE_BOARD_EMPTY_LANE_ID,
	type DatabaseBoardLane,
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

function laneOrdersEqual(left: string[], right: string[]): boolean {
	return (
		left.length === right.length &&
		left.every((laneId, index) => right[index] === laneId)
	);
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
		(key) =>
			rightKeySet.has(key) &&
			laneOrdersEqual(left[key] ?? [], right[key] ?? []),
	);
}

function displayLaneOrder(lanes: DatabaseBoardLane[]): string[] {
	return lanes
		.map((lane) => lane.id)
		.filter((laneId) => laneId !== DATABASE_BOARD_EMPTY_LANE_ID);
}

function mergeLaneOrder(
	currentLaneOrder: string[],
	displayedLaneOrder: string[],
): string[] {
	return [
		...currentLaneOrder.filter(
			(laneId) => laneId !== DATABASE_BOARD_EMPTY_LANE_ID,
		),
		...displayedLaneOrder.filter(
			(laneId) =>
				laneId !== DATABASE_BOARD_EMPTY_LANE_ID &&
				!currentLaneOrder.includes(laneId),
		),
	];
}

function pruneLaneOrderRecord(
	laneOrderByGroup: Record<string, string[]>,
	activeGroupIds: Set<string>,
): Record<string, string[]> {
	return Object.fromEntries(
		Object.entries(laneOrderByGroup).filter(([groupColumnId]) =>
			activeGroupIds.has(groupColumnId),
		),
	);
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
	const displayedLaneIdsRef = useRef<Record<string, string[]>>(
		initialLaneOrderByGroup,
	);
	const onLaneOrderChangeRef = useRef(onLaneOrderChange);

	useEffect(() => {
		onLaneOrderChangeRef.current = onLaneOrderChange;
	}, [onLaneOrderChange]);

	useEffect(() => {
		if (
			laneOrderRecordsEqual(
				displayedLaneIdsRef.current,
				initialLaneOrderByGroup,
			)
		)
			return;
		displayedLaneIdsRef.current = initialLaneOrderByGroup;
		setLaneOrderByGroup((current) =>
			laneOrderRecordsEqual(current, initialLaneOrderByGroup)
				? current
				: initialLaneOrderByGroup,
		);
	}, [initialLaneOrderByGroup]);

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

	const lanes = useMemo(() => {
		const rawLanes = createBoardLanes(rows, groupColumn);
		if (!groupColumn) return rawLanes;
		const previousLaneIds =
			laneOrderByGroup[groupColumn.id] ??
			displayedLaneIdsRef.current[groupColumn.id] ??
			[];
		return orderBoardLanes(rawLanes, previousLaneIds);
	}, [groupColumn, laneOrderByGroup, rows]);

	useEffect(() => {
		if (!groupColumn) return;
		const displayedLaneOrder = displayLaneOrder(lanes);
		if (displayedLaneOrder.length === 0) return;

		const currentLaneOrder =
			laneOrderByGroup[groupColumn.id] ??
			displayedLaneIdsRef.current[groupColumn.id] ??
			[];
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
			return laneOrderRecordsEqual(current, nextLaneOrderByGroup)
				? current
				: nextLaneOrderByGroup;
		});
		void onLaneOrderChangeRef.current?.(groupColumn.id, nextLaneOrder);
	}, [groupColumn, groupColumns, laneOrderByGroup, lanes]);

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
