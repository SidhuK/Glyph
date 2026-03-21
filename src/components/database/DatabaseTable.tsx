import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useMemo } from "react";
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
	laneColors = {},
	onSaveCell,
}: DatabaseTableProps) {
	const safeLaneColors = useMemo<Record<string, EditorTextColor>>(() => {
		const next: Record<string, EditorTextColor> = {};
		for (const [laneId, color] of Object.entries(laneColors)) {
			if (isEditorTextColor(color)) {
				next[laneId] = color;
			}
		}
		return next;
	}, [laneColors]);

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
						laneColors={safeLaneColors}
						onOpenNote={onOpenRow}
						onSelectRow={onSelectRow}
						onSave={onSaveCell}
					/>
				),
				size: column.width ?? 180,
			})),
		[
			activeSort,
			columns,
			onOpenRow,
			onSaveCell,
			onSelectRow,
			onToggleSort,
			safeLaneColors,
		],
	);

	const table = useReactTable({
		data: rows,
		columns: tableColumns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<div className="databaseTableShell">
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
