import {
	type ColumnDef,
	type Row,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualLoadMore } from "../../hooks/useLoadMoreTriggers";
import { createDatabaseRowGroups } from "../../lib/database/board";
import { databaseCellValueFromRow } from "../../lib/database/config";
import type {
	DatabaseColumn,
	DatabaseRow,
	DatabaseSort,
} from "../../lib/database/types";
import { ChevronDown, ChevronUp, Plus } from "../Icons";
import { type EditorTextColor, isEditorTextColor } from "../editor/textColors";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "../ui/shadcn/table";
import { DatabaseCell } from "./DatabaseCell";
import { DatabaseColumnIconPicker } from "./DatabaseColumnIconPicker";

interface DatabaseTableProps {
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	selectedRowPath: string | null;
	activeSort: DatabaseSort | null;
	groupColumn?: DatabaseColumn | null;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
	onCreateRow?: (
		initialValue?: { column: DatabaseColumn; laneId: string } | null,
	) => void | Promise<void>;
	onToggleSort: (column: DatabaseColumn) => void;
	onChangeColumnIcon: (columnId: string, iconName: string | null) => void;
	laneColors?: Record<string, string>;
	statusColors?: Record<string, EditorTextColor>;
	onStatusColorChange?: (status: string, color: EditorTextColor | null) => void;
	onSaveCell: (
		notePath: string,
		column: DatabaseColumn,
		value: {
			kind: string;
			value_text?: string | null;
			value_bool?: boolean | null;
			value_list: string[];
		},
	) => Promise<void>;
	onRenameTitle: (notePath: string, nextTitle: string) => Promise<boolean>;
	onResizeColumn: (columnId: string, width: number) => void;
	hasMoreRows?: boolean;
	isLoadingMoreRows?: boolean;
	onLoadMoreRows?: () => undefined | Promise<unknown>;
}

const EMPTY_LANE_COLORS: Record<string, string> = {};
const DATABASE_TABLE_ROW_HEIGHT = 38;
const DATABASE_TABLE_GROUP_ROW_HEIGHT = 34;

type DatabaseTableGroup = ReturnType<typeof createDatabaseRowGroups>[number];
type DatabaseDisplayItem =
	| {
			id: string;
			kind: "group";
			group: DatabaseTableGroup;
	  }
	| {
			id: string;
			kind: "row";
			row: Row<DatabaseRow>;
	  };

function uniqueOptionValues(values: string[]): string[] {
	const counts = new Map<string, { value: string; count: number }>();
	for (const raw of values) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		const existing = counts.get(key);
		if (existing) {
			existing.count += 1;
			continue;
		}
		counts.set(key, { value: trimmed, count: 1 });
	}
	return [...counts.values()]
		.sort(
			(left, right) =>
				right.count - left.count ||
				left.value.localeCompare(right.value, undefined, {
					sensitivity: "base",
				}),
		)
		.map((entry) => entry.value);
}

function createDatabaseDisplayItems(
	displayRows: Row<DatabaseRow>[],
	rowGroups: DatabaseTableGroup[],
	hasGroups: boolean,
): DatabaseDisplayItem[] {
	if (!hasGroups) {
		return displayRows.map((row) => ({
			id: row.id,
			kind: "row",
			row,
		}));
	}
	const rowsByPath = new Map(
		displayRows.map((row) => [row.original.note_path, row]),
	);
	return rowGroups.flatMap((group) => [
		{
			id: group.id,
			kind: "group" as const,
			group,
		},
		...group.rows
			.map((row) => rowsByPath.get(row.note_path))
			.filter((row): row is Row<DatabaseRow> => row != null)
			.map((row) => ({
				id: `${group.id}:${row.id}`,
				kind: "row" as const,
				row,
			})),
	]);
}

function SortIndicator({
	activeSort,
	columnId,
}: { activeSort: DatabaseSort | null; columnId: string }) {
	if (!activeSort || activeSort.column_id !== columnId) return null;
	return (
		<span className="databaseHeaderSortIcon" aria-hidden="true">
			{activeSort.direction === "desc" ? (
				<ChevronDown size="var(--icon-sm)" />
			) : (
				<ChevronUp size="var(--icon-sm)" />
			)}
		</span>
	);
}

export function DatabaseTable({
	rows,
	columns,
	selectedRowPath,
	activeSort,
	groupColumn = null,
	onSelectRow,
	onOpenRow,
	onCreateRow,
	onToggleSort,
	onChangeColumnIcon,
	laneColors = EMPTY_LANE_COLORS,
	statusColors,
	onStatusColorChange,
	onSaveCell,
	onRenameTitle,
	onResizeColumn,
	hasMoreRows = false,
	isLoadingMoreRows = false,
	onLoadMoreRows,
}: DatabaseTableProps) {
	const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);
	const tableContainerRef = useRef<HTMLDivElement>(null);
	const safeLaneColors = useMemo<Record<string, EditorTextColor>>(() => {
		const next: Record<string, EditorTextColor> = {};
		for (const [laneId, color] of Object.entries(laneColors)) {
			if (isEditorTextColor(color)) {
				next[laneId] = color;
			}
		}
		return next;
	}, [laneColors]);

	const columnValueOptions = useMemo<Record<string, string[]>>(() => {
		const next: Record<string, string[]> = {};
		for (const column of columns) {
			const values: string[] = [];
			for (const row of rows) {
				const cell = databaseCellValueFromRow(row, column);
				values.push(...cell.value_list);
				if (cell.value_text?.trim()) {
					values.push(cell.value_text);
				}
			}
			next[column.id] = uniqueOptionValues(values);
		}
		return next;
	}, [columns, rows]);

	const tableColumns = useMemo<ColumnDef<DatabaseRow>[]>(
		() =>
			columns.map((column) => ({
				id: column.id,
				header: () => (
					<div className="databaseHeaderControls">
						<DatabaseColumnIconPicker
							column={column}
							className="databaseHeaderIconPicker"
							onChange={(iconName) => onChangeColumnIcon(column.id, iconName)}
						/>
						<button
							type="button"
							className="databaseHeaderButton"
							onClick={() => onToggleSort(column)}
						>
							<span className="databaseHeaderLabel">
								<span className="databaseHeaderText">{column.label}</span>
								<SortIndicator activeSort={activeSort} columnId={column.id} />
							</span>
						</button>
					</div>
				),
				cell: ({ row }) => (
					<DatabaseCell
						row={row.original}
						column={column}
						isRowSelected={row.original.note_path === selectedRowPath}
						laneColors={safeLaneColors}
						statusColors={statusColors}
						onOpenNote={onOpenRow}
						onSelectRow={onSelectRow}
						onSave={onSaveCell}
						onStatusColorChange={onStatusColorChange}
						onRenameTitle={onRenameTitle}
						valueOptions={columnValueOptions[column.id] ?? []}
					/>
				),
				size: column.width ?? 180,
			})),
		[
			activeSort,
			columnValueOptions,
			columns,
			onChangeColumnIcon,
			onOpenRow,
			onRenameTitle,
			onSaveCell,
			onSelectRow,
			onToggleSort,
			selectedRowPath,
			safeLaneColors,
			statusColors,
			onStatusColorChange,
		],
	);

	const table = useReactTable({
		data: rows,
		columns: tableColumns,
		getCoreRowModel: getCoreRowModel(),
		enableColumnResizing: true,
		columnResizeMode: "onChange",
		defaultColumn: {
			minSize: 120,
			maxSize: 900,
		},
	});

	const commitColumnResize = useCallback(
		(columnId: string) => {
			const width = table.getColumn(columnId)?.getSize();
			if (typeof width !== "number" || Number.isNaN(width)) return;
			onResizeColumn(columnId, width);
		},
		[onResizeColumn, table],
	);

	const resizingInfo = table.getState().columnSizingInfo;
	const activeResizingColumnId = resizingInfo.isResizingColumn;
	const rowGroups = useMemo(
		() => createDatabaseRowGroups(rows, groupColumn),
		[rows, groupColumn],
	);
	const displayRows = table.getRowModel().rows;
	const visibleColumnCount = table.getVisibleLeafColumns().length || 1;
	const hasGroups = groupColumn != null && rowGroups.length > 0;
	const canCreateInGroup = groupColumn != null && onCreateRow != null;
	const displayItems = useMemo(
		() => createDatabaseDisplayItems(displayRows, rowGroups, hasGroups),
		[displayRows, hasGroups, rowGroups],
	);
	const rowVirtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
		count: displayItems.length,
		estimateSize: (index) =>
			displayItems[index]?.kind === "group"
				? DATABASE_TABLE_GROUP_ROW_HEIGHT
				: DATABASE_TABLE_ROW_HEIGHT,
		getScrollElement: () => tableContainerRef.current,
		getItemKey: (index) => displayItems[index]?.id ?? index,
		overscan: 8,
	});
	const virtualItems = rowVirtualizer.getVirtualItems();
	useVirtualLoadMore({
		hasMore: hasMoreRows,
		isLoading: isLoadingMoreRows,
		onLoadMore: onLoadMoreRows,
		virtualItems,
		totalItems: displayItems.length,
		remainingItems: 12,
	});

	useEffect(() => {
		if (!resizingColumnId) return;
		if (activeResizingColumnId) return;
		commitColumnResize(resizingColumnId);
		setResizingColumnId(null);
	}, [activeResizingColumnId, commitColumnResize, resizingColumnId]);

	return (
		<div
			ref={tableContainerRef}
			className={`databaseTableShell${activeResizingColumnId ? " is-resizing" : ""}`}
		>
			<Table className="databaseTable is-virtualized">
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id} className="databaseHeaderRow">
							{headerGroup.headers.map((header) => (
								<TableHead
									key={header.id}
									style={{
										width: header.getSize(),
										minWidth: header.getSize(),
									}}
									className="databaseHeadCell"
									aria-sort={
										activeSort?.column_id === header.column.id
											? activeSort.direction === "desc"
												? "descending"
												: "ascending"
											: "none"
									}
								>
									{header.isPlaceholder
										? null
										: flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
									<div
										className={`databaseColumnResizeHandle${header.column.getIsResizing() ? " is-resizing" : ""}`}
										onMouseDown={(event) => {
											event.preventDefault();
											event.stopPropagation();
											setResizingColumnId(header.column.id);
											header.getResizeHandler()(event);
										}}
										onTouchStart={(event) => {
											event.preventDefault();
											event.stopPropagation();
											setResizingColumnId(header.column.id);
											header.getResizeHandler()(event);
										}}
									/>
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody
					style={{
						height:
							displayItems.length > 0
								? `${rowVirtualizer.getTotalSize()}px`
								: undefined,
					}}
				>
					{displayItems.length > 0 ? (
						virtualItems.map((virtualRow) => {
							const item = displayItems[virtualRow.index];
							if (!item) return null;
							const transform = `translateY(${virtualRow.start}px)`;
							if (item.kind === "group") {
								const { group } = item;
								return (
									<tr
										key={virtualRow.key}
										className="databaseGroupHeaderRow"
										style={{
											height: `${DATABASE_TABLE_GROUP_ROW_HEIGHT}px`,
											transform,
										}}
									>
										<td
											colSpan={visibleColumnCount}
											className="databaseGroupCell"
										>
											<span className="databaseGroupLabel">{group.label}</span>
											{canCreateInGroup && groupColumn ? (
												<button
													type="button"
													className="databaseGroupAddButton"
													onClick={() => {
														void onCreateRow?.({
															column: groupColumn,
															laneId: group.id,
														});
													}}
													title={`Add note to ${group.label}`}
													aria-label={`Add note to ${group.label}`}
												>
													<Plus
														size="var(--icon-sm)"
														strokeWidth={1.6}
														aria-hidden="true"
													/>
												</button>
											) : null}
										</td>
									</tr>
								);
							}
							const { row } = item;
							return (
								<TableRow
									key={virtualRow.key}
									data-state={
										row.original.note_path === selectedRowPath
											? "selected"
											: undefined
									}
									className="databaseRow"
									style={{
										height: `${DATABASE_TABLE_ROW_HEIGHT}px`,
										transform,
									}}
									onClick={() => onSelectRow(row.original.note_path)}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell
											key={cell.id}
											style={{
												width: cell.column.getSize(),
												minWidth: cell.column.getSize(),
											}}
											className="databaseBodyCell"
										>
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							);
						})
					) : (
						<TableRow>
							<TableCell
								colSpan={visibleColumnCount}
								className="databaseEmptyCell"
							>
								No matching notes
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}
