import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import {
	createBoardLanes,
	defaultBoardGroupColumnId,
	getBoardGroupColumns,
	orderBoardLanes,
} from "../../lib/database/board";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";

interface UseDatabaseBoardParams {
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	initialGroupColumnId?: string | null;
	onGroupColumnIdChange?: (groupColumnId: string | null) => void;
}

export function useDatabaseBoard({
	rows,
	columns,
	initialGroupColumnId = null,
	onGroupColumnIdChange,
}: UseDatabaseBoardParams) {
	const groupColumns = useMemo(() => getBoardGroupColumns(columns), [columns]);
	const laneOrderByGroupRef = useRef<Record<string, string[]>>({});
	const [groupColumnId, setGroupColumnId] = useState<string | null>(
		() => initialGroupColumnId ?? defaultBoardGroupColumnId(columns),
	);

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
		const previousLaneIds = laneOrderByGroupRef.current[groupColumn.id] ?? [];
		return orderBoardLanes(rawLanes, previousLaneIds);
	}, [rows, groupColumn]);

	useEffect(() => {
		if (!groupColumn) return;
		laneOrderByGroupRef.current[groupColumn.id] = lanes.map((lane) => lane.id);
	}, [groupColumn, lanes]);

	return {
		groupColumns,
		groupColumn,
		groupColumnId,
		lanes,
		setGroupColumnId: (nextColumnId: string | null) => {
			startTransition(() => setGroupColumnId(nextColumnId));
			onGroupColumnIdChange?.(nextColumnId);
		},
	};
}
