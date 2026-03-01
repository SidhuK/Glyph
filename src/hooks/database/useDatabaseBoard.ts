import { startTransition, useEffect, useMemo, useState } from "react";
import {
	createBoardLanes,
	defaultBoardGroupColumnId,
	getBoardGroupColumns,
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

	const lanes = useMemo(
		() => createBoardLanes(rows, groupColumn),
		[rows, groupColumn],
	);

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
