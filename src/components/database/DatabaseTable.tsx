import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { databaseCellValueFromRow } from "../../lib/database/config";
import type {
	DatabaseColumn,
	DatabaseRow,
	DatabaseSort,
} from "../../lib/database/types";
import { ChevronDown, ChevronUp } from "../Icons";
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
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";

interface DatabaseTableProps {
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	selectedRowPath: string | null;
	activeSort: DatabaseSort | null;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
	onToggleSort: (column: DatabaseColumn) => void;
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
}

const EMPTY_LANE_COLORS: Record<string, string> = {};

function uniqueOptionValues(values: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of values) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(trimmed);
	}
	return out;
}

function SortIndicator({
	activeSort,
	columnId,
}: { activeSort: DatabaseSort | null; columnId: string }) {
	if (!activeSort || activeSort.column_id !== columnId) return null;
	return (
		<span className="databaseHeaderSortIcon" aria-hidden="true">
			{activeSort.direction === "desc" ? (
				<ChevronDown size={12} />
			) : (
				<ChevronUp size={12} />
			)}
		</span>
	);
}

export function DatabaseTable({
	rows,
	columns,
	selectedRowPath,
	activeSort,
	onSelectRow,
	onOpenRow,
	onToggleSort,
	laneColors = EMPTY_LANE_COLORS,
	statusColors,
	onStatusColorChange,
	onSaveCell,
	onRenameTitle,
	onResizeColumn,
}: DatabaseTableProps) {
	const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);
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
					<button
						type="button"
						className="databaseHeaderButton"
						onClick={() => onToggleSort(column)}
					>
						<span className="databaseHeaderLabel">
							<DatabaseColumnIcon
								column={column}
								size={13}
								className="databaseHeaderIcon"
							/>
							<span className="databaseHeaderText">{column.label}</span>
							<SortIndicator activeSort={activeSort} columnId={column.id} />
						</span>
					</button>
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

	useEffect(() => {
		if (!resizingColumnId) return;
		if (activeResizingColumnId) return;
		commitColumnResize(resizingColumnId);
		setResizingColumnId(null);
	}, [activeResizingColumnId, commitColumnResize, resizingColumnId]);

	return (
		<div
			className={`databaseTableShell${activeResizingColumnId ? " is-resizing" : ""}`}
		>
			<Table className="databaseTable">
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
				<TableBody>
					{table.getRowModel().rows.length > 0 ? (
						table.getRowModel().rows.map((row) => (
							<TableRow
								key={row.id}
								data-state={
									row.original.note_path === selectedRowPath
										? "selected"
										: undefined
								}
								className="databaseRow"
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
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell
								colSpan={columns.length || 1}
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
