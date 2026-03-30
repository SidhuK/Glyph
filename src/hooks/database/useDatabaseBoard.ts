import {
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
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

function hasSameLaneOrderByGroup(
	left: Record<string, string[]>,
	right: Record<string, string[]>,
) {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	return leftKeys.every((key) => {
		const leftLaneOrder = left[key] ?? [];
		const rightLaneOrder = right[key] ?? [];
		return (
			leftLaneOrder.length === rightLaneOrder.length &&
			leftLaneOrder.every((laneId, index) => rightLaneOrder[index] === laneId)
		);
	});
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
	const [groupColumnId, setGroupColumnId] = useState<string | null>(
		() => initialGroupColumnId ?? defaultBoardGroupColumnId(columns),
	);
	const [laneOrderByGroup, setLaneOrderByGroup] = useState<
		Record<string, string[]>
	>(() => initialLaneOrderByGroup);

	useEffect(() => {
		const nextColumnId =
			initialGroupColumnId ?? defaultBoardGroupColumnId(groupColumns);
		startTransition(() =>
			setGroupColumnId((current) =>
				current === nextColumnId ? current : nextColumnId,
			),
		);
	}, [groupColumns, initialGroupColumnId]);

	useEffect(() => {
		setLaneOrderByGroup((current) =>
			hasSameLaneOrderByGroup(current, initialLaneOrderByGroup)
				? current
				: initialLaneOrderByGroup,
		);
	}, [initialLaneOrderByGroup]);

	useEffect(() => {
		if (
			groupColumnId &&
			groupColumns.some((column) => column.id === groupColumnId)
		) {
			return;
		}
		const nextColumnId = defaultBoardGroupColumnId(groupColumns);
		startTransition(() => setGroupColumnId(nextColumnId));
	}, [groupColumnId, groupColumns]);

	const groupColumn = useMemo(
		() =>
			groupColumns.find((column) => column.id === groupColumnId) ??
			groupColumns[0] ??
			null,
		[groupColumnId, groupColumns],
	);

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
			setLaneOrderByGroup((current) => ({
				...current,
				[groupColumn.id]: nextLaneOrder,
			}));
			void onLaneOrderChange?.(groupColumn.id, nextLaneOrder);
		},
		[groupColumn, laneOrderByGroup, lanes, onLaneOrderChange],
	);

	return {
		groupColumns,
		groupColumn,
		groupColumnId,
		lanes,
		moveLaneToIndex,
		setGroupColumnId: (nextColumnId: string | null) => {
			startTransition(() => setGroupColumnId(nextColumnId));
			onGroupColumnIdChange?.(nextColumnId);
		},
	};
}
