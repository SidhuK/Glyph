import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import {
	type ColumnDef,
	type Row,
	flexRender,
	getCoreRowModel,
	useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualLoadMore } from "../../hooks/useLoadMoreTriggers";
import {
	type DatabaseRowGroup,
	boardCreateValue,
	boardDropValue,
	createDatabaseRowGroups,
	isMultiValueBoardColumn,
	moveBoardCardToLane,
} from "../../lib/database/board";
import { databaseColumnLabel, isDateColumn } from "../../lib/database/columns";
import { databaseCellValueFromRow } from "../../lib/database/config";
import { databaseValueToneStyleForColor } from "../../lib/database/palette";
import type { DatabaseColumn, DatabaseRow, DatabaseSort } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { statusToneStyle } from "../../lib/statusProperties";
import { ChevronDown, ChevronUp } from "../Icons";
import { type EditorTextColor, isEditorTextColor } from "../editor/textColors";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/shadcn/table";
import {
	type DatabaseLaneKind,
	DatabaseLaneIcon,
	databaseLaneDisplayLabel,
} from "./DatabaseBoardViews";
import { DatabaseCell } from "./DatabaseCell";
import { DatabaseColumnIconPicker } from "./DatabaseColumnIconPicker";
import { DatabaseTableDraggableRow, DatabaseTableGroupHeader } from "./DatabaseTableViews";

interface DatabaseTableProps {
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	selectedRowPath: string | null;
	activeSort: DatabaseSort | null;
	groupColumn?: DatabaseColumn | null;
	cardOrderByGroup?: Record<string, string[]>;
	onCardOrderChange?: (
		groupColumnId: string,
		cardOrder: Record<string, string[]>,
	) => void | Promise<void>;
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
const EMPTY_CARD_ORDER: Record<string, string[]> = {};
const DATABASE_TABLE_ROW_HEIGHT = 36;
const DATABASE_TABLE_GROUP_ROW_HEIGHT = 36;
/** Linear list: status is a fixed icon slot ahead of the title, the title grows to fill the row
    (its size is only the flex basis), and every other column packs against the trailing edge. */
const DATABASE_TABLE_COLUMN_SIZE_LIMITS = {
	title: { minSize: 240, maxSize: 560 },
	status: { minSize: 40, maxSize: 40 },
	other: { minSize: 80, maxSize: 360 },
} as const;

function isStatusColumn(column: DatabaseColumn): boolean {
	return column.type === "property" && column.property_kind === "status";
}

function columnSizeLimits(column: DatabaseColumn) {
	if (column.type === "title") return DATABASE_TABLE_COLUMN_SIZE_LIMITS.title;
	if (isStatusColumn(column)) return DATABASE_TABLE_COLUMN_SIZE_LIMITS.status;
	return DATABASE_TABLE_COLUMN_SIZE_LIMITS.other;
}

type DatabaseDisplayItem =
	| {
			id: string;
			kind: "group";
			group: DatabaseRowGroup;
	  }
	| {
			id: string;
			kind: "row";
			row: Row<DatabaseRow>;
			groupId: string | null;
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

function orderDatabaseRowGroups(
	groups: DatabaseRowGroup[],
	cardOrderByLane: Record<string, string[]>,
): DatabaseRowGroup[] {
	return groups.map((group) => {
		const rowByPath = new Map(group.rows.map((row) => [row.note_path, row]));
		const orderedRows = (cardOrderByLane[group.id] ?? [])
			.map((notePath) => rowByPath.get(notePath))
			.filter((row): row is DatabaseRow => row != null);
		const orderedPathSet = new Set(orderedRows.map((row) => row.note_path));
		return {
			...group,
			rows: [...orderedRows, ...group.rows.filter((row) => !orderedPathSet.has(row.note_path))],
		};
	});
}

function databaseGroupDropValue(
	row: DatabaseRow,
	column: DatabaseColumn,
	targetGroupId: string,
	sourceGroupId?: string | null,
) {
	const value = boardDropValue(row, column, targetGroupId, sourceGroupId);
	const targetValue = boardCreateValue(column, targetGroupId)?.value_list[0];
	if (!targetValue) return value;
	return {
		...value,
		value_list: [
			targetValue,
			...value.value_list.filter((entry) => entry !== targetValue && entry !== sourceGroupId),
		],
	};
}

function createDatabaseDisplayItems(
	displayRows: Row<DatabaseRow>[],
	rowGroups: DatabaseRowGroup[],
	hasGroups: boolean,
): DatabaseDisplayItem[] {
	if (!hasGroups) {
		return displayRows.map((row) => ({
			id: row.id,
			kind: "row",
			row,
			groupId: null,
		}));
	}
	const rowsByPath = new Map(displayRows.map((row) => [row.original.note_path, row]));
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
				groupId: group.id,
			})),
	]);
}

function SortIndicator({
	activeSort,
	columnId,
}: {
	activeSort: DatabaseSort | null;
	columnId: string;
}) {
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
	cardOrderByGroup = EMPTY_CARD_ORDER,
	onCardOrderChange,
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
	const { t } = useTranslation("shell");
	const [resizingColumnId, setResizingColumnId] = useState<string | null>(null);
	const [isScrolled, setIsScrolled] = useState(false);
	const [moveError, setMoveError] = useState("");
	const [optimisticCardOrder, setOptimisticCardOrder] = useState<Record<string, string[]> | null>(
		null,
	);
	const tableContainerRef = useRef<HTMLDivElement>(null);
	const suppressClickRef = useRef(false);
	const displayedCardOrder = optimisticCardOrder ?? cardOrderByGroup;
	const displayedCardOrderRef = useRef(displayedCardOrder);
	displayedCardOrderRef.current = displayedCardOrder;

	const safeLaneColors = useMemo<Record<string, EditorTextColor>>(() => {
		const next: Record<string, EditorTextColor> = {};
		for (const [laneId, color] of Object.entries(laneColors)) {
			if (isEditorTextColor(color)) {
				next[laneId] = color;
			}
		}
		return next;
	}, [laneColors]);

	// Grouped rows already sit under a header naming the value, so a single-value grouped-by
	// column would only repeat it on every row; the board hides it on cards for the same reason.
	// Multi-value columns (tags) stay: a row is grouped by its first value only. Status leads the
	// row like Linear's status icon, ahead of the title it describes.
	const displayColumns = useMemo(() => {
		const shown =
			groupColumn && !isMultiValueBoardColumn(groupColumn)
				? columns.filter((column) => column.id !== groupColumn.id || column.type === "title")
				: columns;
		if (!shown.some((column) => column.type === "title")) return shown;
		return [
			...shown.filter((column) => isStatusColumn(column)),
			...shown.filter((column) => !isStatusColumn(column)),
		];
	}, [columns, groupColumn]);

	const columnValueOptions = useMemo<Record<string, string[]>>(() => {
		const next: Record<string, string[]> = {};
		for (const column of displayColumns) {
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
	}, [displayColumns, rows]);
	const columnPlacementById = useMemo(
		() =>
			new Map(
				displayColumns.map((column) => [
					column.id,
					column.type === "title" ? "title" : isStatusColumn(column) ? "status" : "trailing",
				]),
			),
		[displayColumns],
	);
	const columnPlacement = (columnId: string) => columnPlacementById.get(columnId) ?? "trailing";
	const hasStatusColumn = displayColumns.some(isStatusColumn);
	const dateColumnIds = useMemo(
		() => new Set(displayColumns.filter(isDateColumn).map((column) => column.id)),
		[displayColumns],
	);

	const tableColumns = useMemo<ColumnDef<DatabaseRow>[]>(
		() =>
			displayColumns.map((column) => ({
				id: column.id,
				enableResizing: !isStatusColumn(column),
				header: () =>
					isStatusColumn(column) ? (
						<button
							type="button"
							className="databaseHeaderButton"
							aria-label={databaseColumnLabel(column)}
							title={databaseColumnLabel(column)}
							onClick={() => onToggleSort(column)}
						>
							<SortIndicator activeSort={activeSort} columnId={column.id} />
						</button>
					) : (
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
									<span className="databaseHeaderText">{databaseColumnLabel(column)}</span>
									<SortIndicator activeSort={activeSort} columnId={column.id} />
								</span>
							</button>
						</div>
					),
				cell: ({ row }) => (
					<DatabaseCell
						row={row.original}
						column={column}
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
				...columnSizeLimits(column),
			})),
		[
			activeSort,
			columnValueOptions,
			displayColumns,
			onChangeColumnIcon,
			onOpenRow,
			onRenameTitle,
			onSaveCell,
			onSelectRow,
			onToggleSort,
			safeLaneColors,
			statusColors,
			onStatusColorChange,
		],
	);

	const table = useReactTable({
		data: rows,
		columns: tableColumns,
		getRowId: (row) => row.note_path,
		getCoreRowModel: getCoreRowModel(),
		enableColumnResizing: true,
		columnResizeMode: "onChange",
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
	const rawRowGroups = useMemo(
		() => createDatabaseRowGroups(rows, groupColumn),
		[rows, groupColumn],
	);
	const rowGroups = useMemo(
		() => (activeSort ? rawRowGroups : orderDatabaseRowGroups(rawRowGroups, displayedCardOrder)),
		[activeSort, displayedCardOrder, rawRowGroups],
	);
	const laneRowsById = useMemo(
		() =>
			Object.fromEntries(
				rowGroups.map((group) => [group.id, group.rows.map((entry) => entry.note_path)]),
			),
		[rowGroups],
	);
	const laneRowsByIdRef = useRef(laneRowsById);
	laneRowsByIdRef.current = laneRowsById;
	const displayRows = table.getRowModel().rows;
	const visibleColumnCount = table.getVisibleLeafColumns().length || 1;
	const hasGroups = groupColumn != null && rowGroups.length > 0;
	const groupKind: DatabaseLaneKind =
		groupColumn?.property_kind === "status"
			? "status"
			: groupColumn?.property_kind === "priority"
				? "priority"
				: groupColumn?.type === "tags" || groupColumn?.property_kind === "tags"
					? "tag"
					: null;
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
		overscan: 4,
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

	const commitCardOrder = useCallback(
		async (nextOrder: Record<string, string[]>) => {
			displayedCardOrderRef.current = nextOrder;
			laneRowsByIdRef.current = nextOrder;
			setOptimisticCardOrder(nextOrder);
			if (!groupColumn || !onCardOrderChange) return;
			try {
				await onCardOrderChange(groupColumn.id, nextOrder);
				setOptimisticCardOrder((current) => (current === nextOrder ? null : current));
			} catch (error) {
				if (displayedCardOrderRef.current === nextOrder) {
					displayedCardOrderRef.current = cardOrderByGroup;
					setOptimisticCardOrder((current) => (current === nextOrder ? null : current));
				}
				throw error;
			}
		},
		[cardOrderByGroup, groupColumn, onCardOrderChange],
	);

	const handleGroupDrop = useCallback(
		async (
			notePath: string | null,
			targetGroupId: string,
			sourceGroupId?: string | null,
			targetNotePath?: string | null,
		) => {
			if (!notePath || !groupColumn) return;
			const row = rows.find((entry) => entry.note_path === notePath);
			if (!row) return;

			const applyOrder = async () => {
				const nextOrder = moveBoardCardToLane(
					displayedCardOrderRef.current,
					laneRowsByIdRef.current,
					notePath,
					targetGroupId,
					targetNotePath,
					sourceGroupId,
				);
				await commitCardOrder(nextOrder);
			};

			try {
				setMoveError("");
				if (targetGroupId === sourceGroupId) {
					if (targetNotePath && targetNotePath !== notePath) {
						await applyOrder();
					} else if (!targetNotePath) {
						const targetGroup = rowGroups.find((group) => group.id === targetGroupId);
						const lastRow = targetGroup?.rows[targetGroup.rows.length - 1];
						if (lastRow?.note_path !== notePath) {
							await applyOrder();
						}
					}
					return;
				}

				await onSaveCell(
					row.note_path,
					groupColumn,
					databaseGroupDropValue(row, groupColumn, targetGroupId, sourceGroupId),
				);
				await applyOrder();
			} catch (error) {
				setMoveError(extractErrorMessage(error));
			}
		},
		[commitCardOrder, groupColumn, onSaveCell, rowGroups, rows],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			suppressClickRef.current = true;
			window.setTimeout(() => {
				suppressClickRef.current = false;
			}, 0);
			if (event.canceled) return;

			const { source, target } = event.operation;
			const notePath = typeof source?.data.notePath === "string" ? source.data.notePath : null;
			const targetGroupId = typeof target?.data.laneId === "string" ? target.data.laneId : null;
			const targetNotePath =
				typeof target?.data.notePath === "string" ? target.data.notePath : null;
			const sourceGroupId =
				typeof source?.data.sourceLaneId === "string" ? source.data.sourceLaneId : null;
			if (!targetGroupId) return;

			void handleGroupDrop(notePath, targetGroupId, sourceGroupId, targetNotePath);
		},
		[handleGroupDrop],
	);

	const tableBody = (
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
								data-column-placement={columnPlacement(header.column.id)}
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
									: flexRender(header.column.columnDef.header, header.getContext())}
								{header.column.getCanResize() ? (
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
								) : null}
							</TableHead>
						))}
					</TableRow>
				))}
			</TableHeader>
			<TableBody
				style={{
					height: displayItems.length > 0 ? `${rowVirtualizer.getTotalSize()}px` : undefined,
				}}
			>
				{displayItems.length > 0 ? (
					virtualItems.map((virtualRow) => {
						const item = displayItems[virtualRow.index];
						if (!item) return null;
						const transform = `translateY(${virtualRow.start}px)`;
						if (item.kind === "group") {
							const { group } = item;
							const groupToneStyle =
								groupColumn?.property_kind === "status"
									? statusToneStyle(group.label, statusColors)
									: groupColumn?.property_kind === "priority"
										? undefined
										: databaseValueToneStyleForColor(group.id, safeLaneColors[group.id]);
							return (
								<DatabaseTableGroupHeader
									key={virtualRow.key}
									groupId={group.id}
									label={databaseLaneDisplayLabel(group.label, groupKind, t)}
									icon={
										<DatabaseLaneIcon
											label={group.label}
											kind={groupKind}
											className="databaseGroupIcon"
										/>
									}
									rowCount={group.rowCount}
									countIsPartial={hasMoreRows}
									visibleColumnCount={visibleColumnCount}
									hasStatusColumn={hasStatusColumn}
									style={{
										...groupToneStyle,
										height: `${DATABASE_TABLE_GROUP_ROW_HEIGHT}px`,
										transform,
									}}
									canCreateInGroup={canCreateInGroup}
									onCreateInGroup={
										groupColumn
											? () => {
													void onCreateRow?.({
														column: groupColumn,
														laneId: group.id,
													});
												}
											: undefined
									}
								/>
							);
						}
						const { row, groupId } = item;
						const cells = row.getVisibleCells().map((cell) => (
							<TableCell
								key={cell.id}
								style={{
									width: cell.column.getSize(),
									minWidth: cell.column.getSize(),
								}}
								className="databaseBodyCell"
								data-column-placement={columnPlacement(cell.column.id)}
								data-date-column={dateColumnIds.has(cell.column.id) || undefined}
							>
								{flexRender(cell.column.columnDef.cell, cell.getContext())}
							</TableCell>
						));
						if (hasGroups && groupId && !activeSort) {
							return (
								<DatabaseTableDraggableRow
									key={virtualRow.key}
									row={row.original}
									groupId={groupId}
									selected={row.original.note_path === selectedRowPath}
									style={{
										height: `${DATABASE_TABLE_ROW_HEIGHT}px`,
										transform,
									}}
									suppressClickRef={suppressClickRef}
									onSelectRow={onSelectRow}
									onOpenRow={onOpenRow}
								>
									{cells}
								</DatabaseTableDraggableRow>
							);
						}
						return (
							<TableRow
								key={virtualRow.key}
								data-state={row.original.note_path === selectedRowPath ? "selected" : undefined}
								className="databaseRow"
								style={{
									height: `${DATABASE_TABLE_ROW_HEIGHT}px`,
									transform,
								}}
								tabIndex={0}
								onClick={() => onSelectRow(row.original.note_path)}
								onKeyDown={(event) => {
									if (event.target !== event.currentTarget) return;
									if (event.key === "Enter") {
										event.preventDefault();
										onOpenRow(row.original.note_path);
									} else if (event.key === " ") {
										event.preventDefault();
										onSelectRow(row.original.note_path);
									}
								}}
							>
								{cells}
							</TableRow>
						);
					})
				) : (
					<TableRow>
						<TableCell colSpan={visibleColumnCount} className="databaseEmptyCell">
							No matching notes
						</TableCell>
					</TableRow>
				)}
			</TableBody>
		</Table>
	);

	return (
		<div
			ref={tableContainerRef}
			className={`databaseTableShell${activeResizingColumnId ? " is-resizing" : ""}${isScrolled ? " is-scrolled" : ""}`}
			onScroll={(event) => setIsScrolled(event.currentTarget.scrollTop > 0)}
		>
			{moveError ? <div className="databaseBoardError">{moveError}</div> : null}
			{hasGroups && !activeSort ? (
				<DragDropProvider onDragEnd={handleDragEnd}>{tableBody}</DragDropProvider>
			) : (
				tableBody
			)}
		</div>
	);
}
