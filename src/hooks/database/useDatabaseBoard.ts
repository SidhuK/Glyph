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
	onGroupColumnIdChange?: (groupColumnId: string | null) => void;
	onLaneOrderChange?: (
		groupColumnId: string,
		laneOrder: string[],
	) => void | Promise<void>;
	onCardOrderChange?: (
		groupColumnId: string,
		cardOrder: Record<string, string[]>,
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

function cardOrdersEqual(
	left: Record<string, string[]>,
	right: Record<string, string[]>,
): boolean {
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
		(key) =>
			rightKeySet.has(key) &&
			cardOrdersEqual(left[key] ?? {}, right[key] ?? {}),
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

function pruneCardOrderRecord(
	cardOrderByGroup: Record<string, Record<string, string[]>>,
	activeGroupIds: Set<string>,
): Record<string, Record<string, string[]>> {
	return Object.fromEntries(
		Object.entries(cardOrderByGroup).filter(([groupColumnId]) =>
			activeGroupIds.has(groupColumnId),
		),
	);
}

function laneRowsById(lanes: DatabaseBoardLane[]): Record<string, string[]> {
	return Object.fromEntries(
		lanes.map((lane) => [lane.id, lane.rows.map((row) => row.note_path)]),
	);
}

function mergeCardOrder(
	currentCardOrder: Record<string, string[]>,
	displayedCardOrder: Record<string, string[]>,
): Record<string, string[]> {
	const nextEntries = Object.entries(displayedCardOrder)
		.map(([laneId, displayedOrder]) => {
			const displayedSet = new Set(displayedOrder);
			const currentOrder = currentCardOrder[laneId] ?? [];
			const nextOrder = [
				...currentOrder.filter((notePath) => displayedSet.has(notePath)),
				...displayedOrder.filter(
					(notePath) => !currentOrder.includes(notePath),
				),
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
	onGroupColumnIdChange,
	onLaneOrderChange,
	onCardOrderChange,
}: UseDatabaseBoardParams) {
	const groupColumns = useMemo(() => getBoardGroupColumns(columns), [columns]);
	const [rawGroupColumnId, setRawGroupColumnId] = useState<string | null>(
		() => null,
	);
	const [laneOrderByGroup, setLaneOrderByGroup] = useState<
		Record<string, string[]>
	>(() => initialLaneOrderByGroup);
	const [cardOrderByGroup, setCardOrderByGroup] = useState<
		Record<string, Record<string, string[]>>
	>(() => initialCardOrderByGroup);
	const displayedLaneIdsRef = useRef<Record<string, string[]>>(
		initialLaneOrderByGroup,
	);
	const displayedCardIdsRef = useRef<Record<string, Record<string, string[]>>>(
		initialCardOrderByGroup,
	);
	const onLaneOrderChangeRef = useRef(onLaneOrderChange);
	const onCardOrderChangeRef = useRef(onCardOrderChange);

	useEffect(() => {
		onLaneOrderChangeRef.current = onLaneOrderChange;
	}, [onLaneOrderChange]);

	useEffect(() => {
		onCardOrderChangeRef.current = onCardOrderChange;
	}, [onCardOrderChange]);

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

	useEffect(() => {
		if (
			cardOrderRecordsEqual(
				displayedCardIdsRef.current,
				initialCardOrderByGroup,
			)
		)
			return;
		displayedCardIdsRef.current = initialCardOrderByGroup;
		setCardOrderByGroup((current) =>
			cardOrderRecordsEqual(current, initialCardOrderByGroup)
				? current
				: initialCardOrderByGroup,
		);
	}, [initialCardOrderByGroup]);

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
		const previousLaneIds =
			groupColumn != null
				? (laneOrderByGroup[groupColumn.id] ??
					displayedLaneIdsRef.current[groupColumn.id] ??
					[])
				: [];
		const rawLanes = createBoardLanes(rows, groupColumn, previousLaneIds);
		if (!groupColumn) return rawLanes;
		const orderedLanes = orderBoardLanes(rawLanes, previousLaneIds);
		const previousCardOrder =
			cardOrderByGroup[groupColumn.id] ??
			displayedCardIdsRef.current[groupColumn.id] ??
			{};
		return orderBoardLaneRows(orderedLanes, previousCardOrder);
	}, [cardOrderByGroup, groupColumn, laneOrderByGroup, rows]);

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

	useEffect(() => {
		if (!groupColumn) return;
		const displayedCardOrder = laneRowsById(lanes);
		const currentCardOrder =
			cardOrderByGroup[groupColumn.id] ??
			displayedCardIdsRef.current[groupColumn.id] ??
			{};
		const nextCardOrder = mergeCardOrder(currentCardOrder, displayedCardOrder);
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
			return cardOrderRecordsEqual(current, nextCardOrderByGroup)
				? current
				: nextCardOrderByGroup;
		});
		void onCardOrderChangeRef.current?.(groupColumn.id, nextCardOrder);
	}, [cardOrderByGroup, groupColumn, groupColumns, lanes]);

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

	const addLane = useCallback(
		(laneId: string) => {
			if (!groupColumn || laneId === DATABASE_BOARD_EMPTY_LANE_ID) return;
			const currentLaneOrder =
				laneOrderByGroup[groupColumn.id] ??
				displayedLaneIdsRef.current[groupColumn.id] ??
				displayLaneOrder(lanes);
			if (currentLaneOrder.includes(laneId)) return;
			const nextLaneOrder = [...currentLaneOrder, laneId];
			displayedLaneIdsRef.current = {
				...displayedLaneIdsRef.current,
				[groupColumn.id]: nextLaneOrder,
			};
			setLaneOrderByGroup((current) => ({
				...current,
				[groupColumn.id]: nextLaneOrder,
			}));
			void onLaneOrderChangeRef.current?.(groupColumn.id, nextLaneOrder);
		},
		[groupColumn, laneOrderByGroup, lanes],
	);

	const renameLane = useCallback(
		(sourceLaneId: string, nextLaneId: string) => {
			if (
				!groupColumn ||
				sourceLaneId === DATABASE_BOARD_EMPTY_LANE_ID ||
				nextLaneId === DATABASE_BOARD_EMPTY_LANE_ID ||
				sourceLaneId === nextLaneId
			) {
				return;
			}

			const currentLaneOrder =
				laneOrderByGroup[groupColumn.id] ??
				displayedLaneIdsRef.current[groupColumn.id] ??
				displayLaneOrder(lanes);
			const nextLaneOrder = currentLaneOrder.map((laneId) =>
				laneId === sourceLaneId ? nextLaneId : laneId,
			);
			const currentCardOrder =
				cardOrderByGroup[groupColumn.id] ??
				displayedCardIdsRef.current[groupColumn.id] ??
				{};
			const nextCardOrder = Object.fromEntries(
				Object.entries(currentCardOrder).map(([laneId, order]) => [
					laneId === sourceLaneId ? nextLaneId : laneId,
					order,
				]),
			);

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
				cardOrderByGroup[groupColumn.id] ??
				displayedCardIdsRef.current[groupColumn.id] ??
				{};
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
		groupColumnId: effectiveGroupColumnId,
		lanes,
		addLane,
		moveLaneToIndex,
		renameLane,
		moveCardToLane,
		setGroupColumnId: (nextColumnId: string | null) => {
			startTransition(() => setRawGroupColumnId(nextColumnId));
			onGroupColumnIdChange?.(nextColumnId);
		},
	};
}
