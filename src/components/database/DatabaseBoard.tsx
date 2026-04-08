import { m, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDatabaseBoard } from "../../hooks/database/useDatabaseBoard";
import {
	DATABASE_BOARD_EMPTY_LANE_ID,
	boardDropValue,
	boardRowHasLane,
} from "../../lib/database/board";
import {
	databaseCellValueFromRow,
	formatDatabaseDateTime,
} from "../../lib/database/config";
import {
	databaseValueToneStyle,
	databaseValueToneStyleForColor,
} from "../../lib/database/palette";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type NoteTaskSummary, invoke } from "../../lib/tauri";
import { parentDir } from "../../utils/path";
import {
	EDITOR_TEXT_COLORS,
	type EditorTextColor,
	isEditorTextColor,
} from "../editor/textColors";
import { TaskProgressIndicator } from "../tasks/TaskProgressIndicator";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../ui/shadcn/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import { formatDatabaseTagLabel } from "./databaseTagLabel";

interface DatabaseBoardProps {
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	groupColumnId?: string | null;
	showColumnColor?: boolean;
	selectedRowPath: string | null;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
	onOpenColumns: () => void;
	onGroupColumnIdChange: (groupColumnId: string | null) => void;
	laneOrderByGroup?: Record<string, string[]>;
	onLaneOrderChange?: (
		groupColumnId: string,
		laneOrder: string[],
	) => void | Promise<void>;
	laneColors?: Record<string, string>;
	onLaneColorChange?:
		| ((laneId: string, color: EditorTextColor | null) => void)
		| null;
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

const EMPTY_LANE_COLORS: Record<string, string> = {};
const EMPTY_TASK_SUMMARY: NoteTaskSummary = {
	total_count: 0,
	completed_count: 0,
	open_count: 0,
};

function getLaneColor(
	laneColors: Record<string, string>,
	laneId: string,
): EditorTextColor | null {
	const color = laneColors[laneId];
	return color && isEditorTextColor(color) ? color : null;
}

function fileTitleFromPath(notePath: string): string {
	const base = notePath.split("/").pop() ?? notePath;
	return base.replace(/\.md$/i, "");
}

function boardCardTitle(row: DatabaseRow, activeLaneLabel: string): string {
	const indexedTitle = row.title.trim();
	const fallbackTitle = fileTitleFromPath(row.note_path).trim();
	if (!indexedTitle) return fallbackTitle;
	if (
		indexedTitle.toLowerCase() === activeLaneLabel.toLowerCase() &&
		fallbackTitle &&
		fallbackTitle.toLowerCase() !== indexedTitle.toLowerCase()
	) {
		return fallbackTitle;
	}
	return indexedTitle;
}

function normalizePreview(preview?: string): string {
	return (preview ?? "").replace(/\s+/g, " ").trim();
}

function normalizeComparableText(value: string): string {
	return value
		.toLowerCase()
		.replace(/^#+\s*/g, "")
		.replace(/[*_`~[\]()]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function cardPreviewText(row: DatabaseRow, title: string): string {
	const preview = normalizePreview(row.preview);
	if (!preview) return "";
	const normalizedTitle = normalizeComparableText(title);
	const normalizedPreview = normalizeComparableText(preview);
	if (!normalizedTitle || !normalizedPreview.startsWith(normalizedTitle)) {
		return preview;
	}
	const withoutMarkdownHeading = preview.replace(/^#+\s*/, "").trim();
	const titleIndex = withoutMarkdownHeading
		.toLowerCase()
		.indexOf(title.toLowerCase());
	if (titleIndex !== 0) return preview;
	const remainder = withoutMarkdownHeading
		.slice(title.length)
		.replace(/^[-:.\s]+/, "")
		.trim();
	return remainder;
}

function cardCandidateColumns(
	columns: DatabaseColumn[],
	groupColumnId?: string | null,
): DatabaseColumn[] {
	return columns.filter((column) => {
		if (!column.visible) return false;
		if (column.id === groupColumnId) return false;
		return column.type !== "title" && column.type !== "path";
	});
}

function hasCardValue(row: DatabaseRow, column: DatabaseColumn): boolean {
	const cell = databaseCellValueFromRow(row, column);
	return Boolean(
		cell.value_text?.trim() ||
			cell.value_list.length > 0 ||
			typeof cell.value_bool === "boolean",
	);
}

function formatCardValue(row: DatabaseRow, column: DatabaseColumn): string {
	const cell = databaseCellValueFromRow(row, column);
	if (cell.kind === "checkbox") {
		if (typeof cell.value_bool !== "boolean") return "";
		return cell.value_bool ? "Checked" : "Unchecked";
	}
	if (cell.kind === "datetime") {
		return formatDatabaseDateTime(cell.value_text);
	}
	if (cell.value_list.length > 0) {
		return cell.value_list.join(", ");
	}
	return cell.value_text?.trim() ?? "";
}

export function DatabaseBoard({
	rows,
	columns,
	groupColumnId: persistedGroupColumnId,
	showColumnColor = true,
	selectedRowPath,
	onSelectRow,
	onOpenRow,
	onOpenColumns,
	onGroupColumnIdChange,
	laneOrderByGroup = {},
	onLaneOrderChange,
	laneColors = EMPTY_LANE_COLORS,
	onLaneColorChange,
	onSaveCell,
}: DatabaseBoardProps) {
	const shouldReduceMotion = useReducedMotion();
	const { groupColumn, groupColumns, lanes, moveLaneToIndex } =
		useDatabaseBoard({
			rows,
			columns,
			initialGroupColumnId: persistedGroupColumnId,
			initialLaneOrderByGroup: laneOrderByGroup,
			onGroupColumnIdChange,
			onLaneOrderChange,
		});
	const [draggingRowPath, setDraggingRowPath] = useState<string | null>(null);
	const [dropLaneId, setDropLaneId] = useState<string | null>(null);
	const [moveError, setMoveError] = useState("");
	const draggingRowPathRef = useRef<string | null>(null);
	const draggingLaneIdRef = useRef<string | null>(null);
	const dragActiveRef = useRef(false);
	const suppressClickRef = useRef(false);
	const dragPreviewRef = useRef<{
		notePath: string;
		sourceLaneId: string;
		title: string;
		x: number;
		y: number;
		width: number;
	} | null>(null);
	const dropLaneIdRef = useRef<string | null>(null);
	const dragStartRef = useRef<{
		notePath: string;
		sourceLaneId: string;
		startX: number;
		startY: number;
		offsetX: number;
		offsetY: number;
		width: number;
		title: string;
	} | null>(null);
	const [dragPreview, setDragPreview] = useState<{
		notePath: string;
		sourceLaneId: string;
		title: string;
		x: number;
		y: number;
		width: number;
	} | null>(null);
	const [taskSummariesByPath, setTaskSummariesByPath] = useState<
		Record<string, NoteTaskSummary>
	>({});
	const boardCardColumns = useMemo(
		() =>
			cardCandidateColumns(columns, groupColumn?.id ?? persistedGroupColumnId),
		[columns, groupColumn?.id, persistedGroupColumnId],
	);
	const reorderableLanes = useMemo(
		() => lanes.filter((lane) => lane.id !== DATABASE_BOARD_EMPTY_LANE_ID),
		[lanes],
	);
	const clearDragState = useCallback(() => {
		dragStartRef.current = null;
		draggingRowPathRef.current = null;
		draggingLaneIdRef.current = null;
		dragActiveRef.current = false;
		dragPreviewRef.current = null;
		dropLaneIdRef.current = null;
		setDraggingRowPath(null);
		setDropLaneId(null);
		setDragPreview(null);
	}, []);

	useEffect(() => {
		const notePaths = Array.from(
			new Set(rows.map((row) => row.note_path).filter(Boolean)),
		);
		if (notePaths.length === 0) {
			setTaskSummariesByPath({});
			return;
		}

		let cancelled = false;
		void invoke("task_summaries_for_paths", { note_paths: notePaths })
			.then((items) => {
				if (cancelled) return;
				const next: Record<string, NoteTaskSummary> = {};
				for (const item of items) {
					next[item.note_path] = {
						total_count: item.total_count,
						completed_count: item.completed_count,
						open_count: item.open_count,
					};
				}
				setTaskSummariesByPath(next);
			})
			.catch(() => {
				if (cancelled) return;
				setTaskSummariesByPath({});
			});

		return () => {
			cancelled = true;
		};
	}, [rows]);

	const handleLaneDrop = useCallback(
		async (
			notePath: string | null,
			targetLaneId: string,
			sourceLaneId?: string | null,
		) => {
			if (!notePath || !groupColumn) return;
			const row = rows.find((entry) => entry.note_path === notePath);
			if (!row) return;
			if (targetLaneId === sourceLaneId) {
				clearDragState();
				return;
			}
			if (boardRowHasLane(row, groupColumn, targetLaneId)) {
				clearDragState();
				return;
			}
			try {
				setMoveError("");
				await onSaveCell(
					row.note_path,
					groupColumn,
					boardDropValue(row, groupColumn, targetLaneId, sourceLaneId),
				);
			} catch (error) {
				setMoveError(extractErrorMessage(error));
			} finally {
				clearDragState();
			}
		},
		[clearDragState, groupColumn, onSaveCell, rows],
	);

	useEffect(() => {
		dragPreviewRef.current = dragPreview;
	}, [dragPreview]);

	useEffect(() => {
		dropLaneIdRef.current = dropLaneId;
	}, [dropLaneId]);

	useEffect(() => {
		const handlePointerMove = (event: PointerEvent) => {
			const dragStart = dragStartRef.current;
			if (!dragStart) return;
			const deltaX = event.clientX - dragStart.startX;
			const deltaY = event.clientY - dragStart.startY;
			const hasExceededThreshold = Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2;
			if (!hasExceededThreshold && !dragPreviewRef.current) return;

			if (!dragPreviewRef.current) {
				dragActiveRef.current = true;
				draggingRowPathRef.current = dragStart.notePath;
				draggingLaneIdRef.current = dragStart.sourceLaneId;
				const nextPreview = {
					notePath: dragStart.notePath,
					sourceLaneId: dragStart.sourceLaneId,
					title: dragStart.title,
					x: event.clientX - dragStart.offsetX,
					y: event.clientY - dragStart.offsetY,
					width: dragStart.width,
				};
				dragPreviewRef.current = nextPreview;
				setDraggingRowPath(dragStart.notePath);
				setDragPreview(nextPreview);
			} else {
				const nextPreview = {
					...dragPreviewRef.current,
					x: event.clientX - dragStart.offsetX,
					y: event.clientY - dragStart.offsetY,
				};
				dragPreviewRef.current = nextPreview;
				setDragPreview(nextPreview);
			}

			const laneElement = document
				.elementFromPoint(event.clientX, event.clientY)
				?.closest<HTMLElement>("[data-board-lane-id]");
			const nextDropLaneId = laneElement?.dataset.boardLaneId ?? null;
			dropLaneIdRef.current = nextDropLaneId;
			setDropLaneId(nextDropLaneId);
		};

		const handlePointerUp = (event: PointerEvent) => {
			const dragStart = dragStartRef.current;
			dragStartRef.current = null;
			if (!dragStart) return;
			if (!dragActiveRef.current) {
				setDropLaneId(null);
				return;
			}
			dragActiveRef.current = false;
			suppressClickRef.current = true;
			window.setTimeout(() => {
				suppressClickRef.current = false;
			}, 0);
			const laneElement = document
				.elementFromPoint(event.clientX, event.clientY)
				?.closest<HTMLElement>("[data-board-lane-id]");
			const targetLaneId =
				laneElement?.dataset.boardLaneId ?? dropLaneIdRef.current ?? null;
			if (targetLaneId) {
				void handleLaneDrop(
					dragStart.notePath,
					targetLaneId,
					dragStart.sourceLaneId,
				);
				return;
			}
			clearDragState();
		};

		window.addEventListener("pointermove", handlePointerMove);
		window.addEventListener("pointerup", handlePointerUp);
		window.addEventListener("pointercancel", handlePointerUp);
		return () => {
			window.removeEventListener("pointermove", handlePointerMove);
			window.removeEventListener("pointerup", handlePointerUp);
			window.removeEventListener("pointercancel", handlePointerUp);
		};
	}, [clearDragState, handleLaneDrop]);

	return (
		<div className="databaseBoardShell">
			{moveError ? (
				<m.div
					className="databaseBoardError"
					initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={
						shouldReduceMotion ? { duration: 0 } : springPresets.snappy
					}
				>
					{moveError}
				</m.div>
			) : null}
			{groupColumns.length === 0 ? (
				<m.div
					className="databaseBoardEmptyState"
					initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={
						shouldReduceMotion ? { duration: 0 } : springPresets.snappy
					}
				>
					<div className="databaseBoardEmptyTitle">
						Board view needs a grouping field
					</div>
					<div className="databaseBoardEmptyText">
						Choose how the board should group cards by adding a single-value
						property like status, stage, or done.
					</div>
					<div className="databaseBoardEmptyActions">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onOpenColumns}
						>
							Open columns
						</Button>
					</div>
				</m.div>
			) : (
				<div className="databaseBoardHorizontal">
					<div className="databaseBoardScroller">
						{lanes.map((lane, laneIndex) => (
							<m.div
								key={lane.id}
								className="databaseBoardLane"
								data-board-lane-id={lane.id}
								data-show-column-color={showColumnColor ? "true" : "false"}
								style={databaseValueToneStyleForColor(
									lane.id,
									getLaneColor(laneColors, lane.id),
								)}
								data-active={dropLaneId === lane.id ? "true" : "false"}
								initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
								animate={{ opacity: 1, y: 0 }}
								transition={
									shouldReduceMotion
										? { duration: 0 }
										: {
												...springPresets.snappy,
												delay: Math.min(laneIndex * 0.04, 0.18),
											}
								}
							>
								<div className="databaseBoardLaneHeader">
									{onLaneColorChange ? (
										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<button
													type="button"
													className="databaseBoardLaneTitleGroup databaseBoardLaneTitleButton"
													aria-label={`Set color for ${lane.label}`}
													title={`Set color for ${lane.label}`}
												>
													<span className="databaseBoardLaneDot" />
													<div className="databaseBoardLaneTitle">
														{lane.label}
													</div>
												</button>
											</DropdownMenuTrigger>
											<DropdownMenuContent
												align="start"
												className="databaseBoardColorMenu"
											>
												<div className="databaseBoardColorRibbon">
													{EDITOR_TEXT_COLORS.map((color) => (
														<button
															key={color.id}
															type="button"
															className="databaseBoardColorRibbonSwatch"
															style={databaseValueToneStyleForColor(
																color.id,
																color.id,
															)}
															onClick={() =>
																onLaneColorChange(lane.id, color.id)
															}
															title={color.label}
															aria-label={`Set ${lane.label} color to ${color.label}`}
														/>
													))}
													<button
														type="button"
														className="databaseBoardColorRibbonClear"
														onClick={() => onLaneColorChange(lane.id, null)}
														title="Clear color"
														aria-label={`Clear color for ${lane.label}`}
													>
														<span />
													</button>
												</div>
											</DropdownMenuContent>
										</DropdownMenu>
									) : (
										<div className="databaseBoardLaneTitleGroup">
											<span className="databaseBoardLaneDot" />
											<div className="databaseBoardLaneTitle">{lane.label}</div>
										</div>
									)}
									<div className="databaseBoardLaneHeaderActions">
										<div className="databaseBoardLaneCount">
											{lane.cardCount}
										</div>
										<ContextMenu>
											<ContextMenuTrigger asChild>
												<button
													type="button"
													className="databaseBoardLaneHandle"
													disabled={lane.id === DATABASE_BOARD_EMPTY_LANE_ID}
													aria-label={`Reorder ${lane.label} column`}
													title={
														lane.id === DATABASE_BOARD_EMPTY_LANE_ID
															? "No value stays last"
															: `Right-click to move ${lane.label}`
													}
												>
													<span className="databaseBoardLaneHandleDots" />
												</button>
											</ContextMenuTrigger>
											{lane.id !== DATABASE_BOARD_EMPTY_LANE_ID ? (
												<ContextMenuContent className="databaseBoardContextMenu">
													<div className="databaseBoardMoveLabel">
														Move column to
													</div>
													{reorderableLanes.map((targetLane, index) => {
														const isCurrentLane = targetLane.id === lane.id;
														return (
															<ContextMenuItem
																key={`${lane.id}:position:${targetLane.id}`}
																className="databaseBoardContextMenuItem"
																disabled={isCurrentLane}
																onSelect={() => moveLaneToIndex(lane.id, index)}
															>
																Position {index + 1}: {targetLane.label}
															</ContextMenuItem>
														);
													})}
												</ContextMenuContent>
											) : null}
										</ContextMenu>
									</div>
								</div>
								<div className="databaseBoardLaneBody">
									{lane.rows.length > 0 ? (
										lane.rows.map((row) => {
											const title = boardCardTitle(row, lane.label);
											const preview = cardPreviewText(row, title);
											const maxVisibleTags = 2;
											const visibleTags = row.tags.slice(0, maxVisibleTags);
											const extraTagCount = Math.max(
												row.tags.length - maxVisibleTags,
												0,
											);
											const cardDetails = boardCardColumns
												.filter(
													(column) =>
														column.type !== "tags" && hasCardValue(row, column),
												)
												.slice(0, 1);
											const folderLabel =
												row.folder?.trim() || parentDir(row.note_path) || "/";
											const taskSummary =
												taskSummariesByPath[row.note_path] ??
												EMPTY_TASK_SUMMARY;
											const otherLanes = lanes.filter(
												(l) =>
													l.id !== lane.id &&
													groupColumn != null &&
													!boardRowHasLane(row, groupColumn, l.id),
											);

											return (
												<ContextMenu key={row.note_path}>
													<ContextMenuTrigger asChild>
														<button
															type="button"
															className="databaseBoardCard"
															data-state={
																row.note_path === selectedRowPath
																	? "selected"
																	: undefined
															}
															data-dragging={
																row.note_path === draggingRowPath
																	? "true"
																	: undefined
															}
															onPointerDown={(event) => {
																if (event.button !== 0) return;
																dragActiveRef.current = false;
																const rect =
																	event.currentTarget.getBoundingClientRect();
																dragStartRef.current = {
																	notePath: row.note_path,
																	sourceLaneId: lane.id,
																	startX: event.clientX,
																	startY: event.clientY,
																	offsetX: event.clientX - rect.left,
																	offsetY: event.clientY - rect.top,
																	width: rect.width,
																	title,
																};
															}}
															onClick={() => {
																if (suppressClickRef.current) return;
																onSelectRow(row.note_path);
															}}
															onDoubleClick={() => onOpenRow(row.note_path)}
															onKeyDown={(event) => {
																if (event.key === "Enter") {
																	event.preventDefault();
																	onOpenRow(row.note_path);
																} else if (event.key === " ") {
																	event.preventDefault();
																	onSelectRow(row.note_path);
																}
															}}
															title="Double-click to open note"
														>
															<div className="databaseBoardCardHead">
																<div className="databaseBoardCardHeaderRow">
																	<span className="databaseBoardCardTitle">
																		{title}
																	</span>
																	{taskSummary.total_count > 0 ? (
																		<TaskProgressIndicator
																			summary={taskSummary}
																			className="databaseBoardCardTaskProgress"
																		/>
																	) : null}
																</div>
																{preview ? (
																	<div className="databaseBoardCardPreview">
																		{preview}
																	</div>
																) : null}
															</div>
															{visibleTags.length > 0 ? (
																<div className="databaseBoardCardTags">
																	{visibleTags.map((tag) => (
																		<span
																			key={`${row.note_path}:${tag}`}
																			className="databaseBoardTag"
																			style={
																				groupColumn?.id === "tags"
																					? databaseValueToneStyleForColor(
																							tag,
																							(laneColors[tag] as
																								| EditorTextColor
																								| undefined) ?? null,
																						)
																					: databaseValueToneStyle(tag)
																			}
																			title={formatDatabaseTagLabel(tag)}
																		>
																			{formatDatabaseTagLabel(tag)}
																		</span>
																	))}
																	{extraTagCount > 0 ? (
																		<span className="databaseBoardTag is-muted">
																			+{extraTagCount}
																		</span>
																	) : null}
																</div>
															) : null}
															{cardDetails.length > 0 ? (
																<div className="databaseBoardCardDetails">
																	{cardDetails.map((column) => (
																		<div
																			key={`${row.note_path}:${column.id}`}
																			className="databaseBoardCardDetail"
																		>
																			<span
																				className="databaseBoardCardDetailLabel"
																				title={column.label}
																			>
																				<DatabaseColumnIcon
																					column={column}
																					size={12}
																				/>
																			</span>
																			<span
																				className="databaseBoardCardDetailValue"
																				title={`${column.label}: ${formatCardValue(row, column)}`}
																			>
																				{formatCardValue(row, column)}
																			</span>
																		</div>
																	))}
																</div>
															) : null}
															<div className="databaseBoardCardFooter">
																<span
																	className="databaseBoardCardPath"
																	title={folderLabel}
																>
																	{folderLabel}
																</span>
																<span className="databaseBoardCardTimestamp">
																	{formatDatabaseDateTime(row.updated)}
																</span>
															</div>
														</button>
													</ContextMenuTrigger>
													<ContextMenuContent className="databaseBoardContextMenu">
														<ContextMenuItem
															className="databaseBoardContextMenuItem"
															onSelect={() => onOpenRow(row.note_path)}
														>
															Open note
														</ContextMenuItem>
														{otherLanes.length > 0 ? (
															<>
																<ContextMenuSeparator className="databaseBoardContextMenuSeparator" />
																<div className="databaseBoardMoveLabel">
																	Move to
																</div>
																{otherLanes.map((targetLane) => (
																	<ContextMenuItem
																		className="databaseBoardContextMenuItem"
																		key={targetLane.id}
																		onSelect={() =>
																			void handleLaneDrop(
																				row.note_path,
																				targetLane.id,
																				lane.id,
																			)
																		}
																	>
																		{targetLane.label}
																	</ContextMenuItem>
																))}
															</>
														) : null}
													</ContextMenuContent>
												</ContextMenu>
											);
										})
									) : (
										<div className="databaseBoardLaneEmptyCard">No notes</div>
									)}
								</div>
							</m.div>
						))}
					</div>
				</div>
			)}
			{dragPreview ? (
				<div
					className="databaseBoardDragGhost"
					style={{
						width: dragPreview.width,
						transform: `translate3d(${dragPreview.x}px, ${dragPreview.y}px, 0)`,
					}}
				>
					{dragPreview.title}
				</div>
			) : null}
		</div>
	);
}
