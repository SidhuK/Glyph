import { PointerActivationConstraints } from "@dnd-kit/dom";
import {
	DragDropProvider,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useDraggable,
	useDroppable,
} from "@dnd-kit/react";
import {
	Calendar03Icon,
	Folder03Icon,
	Tag01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m, useReducedMotion } from "motion/react";
import {
	type MutableRefObject,
	type ReactNode,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";
import { useDatabaseBoard } from "../../hooks/database/useDatabaseBoard";
import { useTaskProgressIndicatorSetting } from "../../hooks/useTaskProgressIndicatorSetting";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import {
	DATABASE_BOARD_EMPTY_LANE_ID,
	type DatabaseBoardLane,
	boardDropValue,
	boardRowHasLane,
} from "../../lib/database/board";
import { formatDatabaseDateTime } from "../../lib/database/config";
import {
	databaseValueToneStyle,
	databaseValueToneStyleForColor,
} from "../../lib/database/palette";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { statusToneStyle } from "../../lib/statusProperties";
import type { NoteTaskSummary } from "../../lib/tauri";
import { parentDir } from "../../utils/path";
import {
	EDITOR_TEXT_COLORS,
	type EditorTextColor,
	isEditorTextColor,
} from "../editor/textColors";
import { StatusPropertyPill } from "../status/StatusPropertyPill";
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
	statusColors?: Record<string, EditorTextColor>;
	onLaneColorChange?:
		| ((laneId: string, color: EditorTextColor | null) => void)
		| null;
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
}

const EMPTY_LANE_COLORS: Record<string, string> = {};
const EMPTY_TASK_SUMMARY: NoteTaskSummary = {
	total_count: 0,
	completed_count: 0,
	open_count: 0,
};
const DATABASE_BOARD_CARD_SENSORS = [
	PointerSensor.configure({
		activationConstraints: [
			new PointerActivationConstraints.Distance({ value: 5 }),
		],
	}),
	KeyboardSensor,
];

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

function formatCompactBoardDateTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return formatDatabaseDateTime(value);
	const month = date.toLocaleString("en-US", { month: "short" });
	const day = date.getDate();
	const time = date
		.toLocaleString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		})
		.toLowerCase()
		.replace(/\s/g, "");
	return `${month} ${day}, ${time}`;
}

function boardCardDragId(notePath: string, laneId: string): string {
	return `${laneId}:${notePath}`;
}

interface DatabaseBoardLaneViewProps {
	lane: DatabaseBoardLane;
	laneIndex: number;
	showColumnColor: boolean;
	laneColors: Record<string, string>;
	statusColors: Record<string, EditorTextColor>;
	isStatusGroup: boolean;
	shouldReduceMotion: boolean | null;
	onLaneColorChange?:
		| ((laneId: string, color: EditorTextColor | null) => void)
		| null;
	reorderableLanes: DatabaseBoardLane[];
	moveLaneToIndex: (sourceLaneId: string, targetIndex: number) => void;
	children: ReactNode;
}

function DatabaseBoardLaneView({
	lane,
	laneIndex,
	showColumnColor,
	laneColors,
	statusColors,
	isStatusGroup,
	shouldReduceMotion,
	onLaneColorChange,
	reorderableLanes,
	moveLaneToIndex,
	children,
}: DatabaseBoardLaneViewProps) {
	const { ref, isDropTarget } = useDroppable({
		id: lane.id,
		data: { laneId: lane.id },
		accept: "database-board-card",
	});

	return (
		<m.div
			ref={ref}
			className="databaseBoardLane"
			data-show-column-color={showColumnColor ? "true" : "false"}
			style={
				isStatusGroup
					? statusToneStyle(lane.label, statusColors)
					: databaseValueToneStyleForColor(
							lane.id,
							getLaneColor(laneColors, lane.id),
						)
			}
			data-active={isDropTarget ? "true" : "false"}
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
								{isStatusGroup ? (
									<StatusPropertyPill
										value={lane.label}
										colors={statusColors}
										className="databaseBoardLaneStatus"
									/>
								) : (
									<>
										<span className="databaseBoardLaneDot" />
										<div className="databaseBoardLaneTitle">{lane.label}</div>
									</>
								)}
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
										style={databaseValueToneStyleForColor(color.id, color.id)}
										onClick={() => onLaneColorChange(lane.id, color.id)}
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
						{isStatusGroup ? (
							<StatusPropertyPill
								value={lane.label}
								colors={statusColors}
								className="databaseBoardLaneStatus"
							/>
						) : (
							<>
								<span className="databaseBoardLaneDot" />
								<div className="databaseBoardLaneTitle">{lane.label}</div>
							</>
						)}
					</div>
				)}
				<div className="databaseBoardLaneHeaderActions">
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
								<div className="databaseBoardMoveLabel">Move column to</div>
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
			<div className="databaseBoardLaneBody">{children}</div>
		</m.div>
	);
}

interface DatabaseBoardCardViewProps {
	row: DatabaseRow;
	laneId: string;
	selected: boolean;
	suppressClickRef: MutableRefObject<boolean>;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
	children: ReactNode;
}

function DatabaseBoardCardView({
	row,
	laneId,
	selected,
	suppressClickRef,
	onSelectRow,
	onOpenRow,
	children,
}: DatabaseBoardCardViewProps) {
	const dragId = boardCardDragId(row.note_path, laneId);
	const { ref, handleRef, isDragging } = useDraggable({
		id: dragId,
		type: "database-board-card",
		sensors: DATABASE_BOARD_CARD_SENSORS,
		data: {
			notePath: row.note_path,
			sourceLaneId: laneId,
		},
	});
	const setCardRef = useCallback(
		(element: HTMLButtonElement | null) => {
			ref(element);
			handleRef(element);
		},
		[handleRef, ref],
	);

	return (
		<ContextMenuTrigger asChild>
			<button
				ref={setCardRef}
				type="button"
				className="databaseBoardCard"
				data-state={selected ? "selected" : undefined}
				data-dragging={isDragging ? "true" : undefined}
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
				{children}
			</button>
		</ContextMenuTrigger>
	);
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
	statusColors = {},
	onLaneColorChange,
	onStatusColorChange,
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
	const [moveError, setMoveError] = useState("");
	const suppressClickRef = useRef(false);
	const showTaskProgressIndicator = useTaskProgressIndicatorSetting(null);
	const taskSummaryPaths = useMemo(
		() => Array.from(new Set(rows.map((row) => row.note_path).filter(Boolean))),
		[rows],
	);
	const taskSummariesByPath = useTaskSummariesForPaths(
		taskSummaryPaths,
		showTaskProgressIndicator,
	);
	const reorderableLanes = useMemo(
		() => lanes.filter((lane) => lane.id !== DATABASE_BOARD_EMPTY_LANE_ID),
		[lanes],
	);
	const isStatusGroup = groupColumn?.property_kind === "status";
	const handleLaneColorChange = useCallback(
		(laneId: string, color: EditorTextColor | null) => {
			if (isStatusGroup) {
				onStatusColorChange?.(laneId, color);
				return;
			}
			onLaneColorChange?.(laneId, color);
		},
		[isStatusGroup, onLaneColorChange, onStatusColorChange],
	);

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
				return;
			}
			if (boardRowHasLane(row, groupColumn, targetLaneId)) {
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
			}
		},
		[groupColumn, onSaveCell, rows],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			suppressClickRef.current = true;
			window.setTimeout(() => {
				suppressClickRef.current = false;
			}, 0);
			if (event.canceled) return;

			const { source, target } = event.operation;
			const notePath =
				typeof source?.data.notePath === "string" ? source.data.notePath : null;
			const targetLaneId = typeof target?.id === "string" ? target.id : null;
			const sourceLaneId =
				typeof source?.data.sourceLaneId === "string"
					? source.data.sourceLaneId
					: null;
			if (!targetLaneId) return;

			void handleLaneDrop(notePath, targetLaneId, sourceLaneId);
		},
		[handleLaneDrop],
	);

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
				<DragDropProvider onDragEnd={handleDragEnd}>
					<div className="databaseBoardHorizontal">
						<div className="databaseBoardScroller">
							{lanes.map((lane, laneIndex) => (
								<DatabaseBoardLaneView
									key={lane.id}
									lane={lane}
									laneIndex={laneIndex}
									showColumnColor={showColumnColor}
									laneColors={laneColors}
									statusColors={statusColors}
									isStatusGroup={isStatusGroup}
									shouldReduceMotion={shouldReduceMotion}
									onLaneColorChange={handleLaneColorChange}
									reorderableLanes={reorderableLanes}
									moveLaneToIndex={moveLaneToIndex}
								>
									{lane.rows.length > 0 ? (
										lane.rows.map((row) => {
											const title = boardCardTitle(row, lane.label);
											const maxVisibleTags = 2;
											const visibleTags = row.tags.slice(0, maxVisibleTags);
											const extraTagCount = Math.max(
												row.tags.length - maxVisibleTags,
												0,
											);
											const folderLabel =
												row.folder?.trim() || parentDir(row.note_path) || "/";
											const updatedLabel = formatDatabaseDateTime(row.updated);
											const compactUpdatedLabel = formatCompactBoardDateTime(
												row.updated,
											);
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
													<DatabaseBoardCardView
														row={row}
														laneId={lane.id}
														selected={row.note_path === selectedRowPath}
														suppressClickRef={suppressClickRef}
														onSelectRow={onSelectRow}
														onOpenRow={onOpenRow}
													>
														<div className="databaseBoardCardHead">
															<div className="databaseBoardCardHeaderRow">
																<span className="databaseBoardCardTitle">
																	{title}
																</span>
																<div className="databaseBoardCardTitleMeta">
																	<span
																		className="databaseBoardCardTimestamp"
																		title={`Updated ${updatedLabel}`}
																	>
																		<HugeiconsIcon
																			icon={Calendar03Icon}
																			size={10}
																			strokeWidth={1}
																			aria-hidden="true"
																		/>
																		{compactUpdatedLabel}
																	</span>
																</div>
																{showTaskProgressIndicator &&
																taskSummary.total_count > 0 ? (
																	<TaskProgressIndicator
																		summary={taskSummary}
																		className="databaseBoardCardTaskProgress"
																	/>
																) : null}
															</div>
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
																		<HugeiconsIcon
																			icon={Tag01Icon}
																			className="databaseTagPillIcon"
																			size={11}
																			strokeWidth={1.2}
																		/>
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
														<div className="databaseBoardCardFooter">
															<span
																className="databaseBoardCardPath"
																title={folderLabel}
															>
																<HugeiconsIcon
																	icon={Folder03Icon}
																	size={10}
																	strokeWidth={1}
																	aria-hidden="true"
																/>
																{folderLabel}
															</span>
														</div>
													</DatabaseBoardCardView>
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
										<div className="databaseBoardLaneEmptyCard">
											Drop notes here
										</div>
									)}
								</DatabaseBoardLaneView>
							))}
						</div>
					</div>
				</DragDropProvider>
			)}
		</div>
	);
}
