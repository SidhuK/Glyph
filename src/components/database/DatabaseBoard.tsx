import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { m, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	type BoardLaneRenameTarget,
	useBoardLaneRename,
} from "../../hooks/database/useBoardLaneRename";
import { useDatabaseBoard } from "../../hooks/database/useDatabaseBoard";
import { useSentinelLoadMore } from "../../hooks/useLoadMoreTriggers";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";

import {
	DATABASE_BOARD_EMPTY_LANE_ID,
	type DatabaseBoardLane,
	boardDropValue,
	boardRowHasLane,
	canManageBoardLanes,
} from "../../lib/database/board";
import { databaseRowFileTitle } from "../../lib/database/config";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import type { EditorTextColor } from "../editor/textColors";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";
import { DatabaseBoardCardView, DatabaseBoardLaneView } from "./DatabaseBoardViews";
import { DatabaseCardBody, EMPTY_TASK_SUMMARY, useCardTagIconName } from "./DatabaseCardBody";

interface DatabaseBoardProps {
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	groupColumnId?: string | null;
	selectedRowPath: string | null;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
	onCreateRow?: (
		initialValue?: { column: DatabaseColumn; laneId: string } | null,
	) => void | Promise<void>;
	onOpenColumns: () => void;
	laneOrderByGroup?: Record<string, string[]>;
	cardOrderByGroup?: Record<string, Record<string, string[]>>;
	onLaneOrderChange?: (groupColumnId: string, laneOrder: string[]) => void | Promise<void>;
	onCardOrderChange?: (
		groupColumnId: string,
		cardOrder: Record<string, string[]>,
	) => void | Promise<void>;
	laneColors?: Record<string, string>;
	statusColors?: Record<string, EditorTextColor>;
	onLaneColorChange?: ((laneId: string, color: EditorTextColor | null) => void) | null;
	onStatusColorChange?: (status: string, color: EditorTextColor | null) => void;
	boardCardFields?: string[];
	laneRenameTarget: BoardLaneRenameTarget;
	membershipComplete: boolean;
	hasMoreRows?: boolean;
	isLoadingMoreRows?: boolean;
	onLoadMoreRows?: () => undefined | Promise<unknown>;
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

function isStatusBoardColumn(column: DatabaseColumn | null): boolean {
	return column?.property_kind === "status";
}

function isPriorityBoardColumn(column: DatabaseColumn | null): boolean {
	return column?.property_kind === "priority";
}

function isTagBoardColumn(column: DatabaseColumn | null): boolean {
	return column?.type === "tags" || column?.property_kind === "tags";
}

function boardCardTitle(row: DatabaseRow, activeLaneLabel: string): string {
	const indexedTitle = row.title.trim();
	const fallbackTitle = databaseRowFileTitle(row.note_path).trim();
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

export function DatabaseBoard({
	rows,
	columns,
	groupColumnId: persistedGroupColumnId,
	selectedRowPath,
	onSelectRow,
	onOpenRow,
	onCreateRow,
	onOpenColumns,
	laneOrderByGroup = {},
	cardOrderByGroup = {},
	onLaneOrderChange,
	onCardOrderChange,
	laneColors = EMPTY_LANE_COLORS,
	statusColors = {},
	onLaneColorChange,
	onStatusColorChange,
	boardCardFields,
	laneRenameTarget,
	membershipComplete,
	hasMoreRows = false,
	isLoadingMoreRows = false,
	onLoadMoreRows,
	onSaveCell,
}: DatabaseBoardProps) {
	const shouldReduceMotion = useReducedMotion();
	const { groupColumn, groupColumns, lanes, moveLaneToIndex, renameLane, moveCardToLane } =
		useDatabaseBoard({
			rows,
			columns,
			initialGroupColumnId: persistedGroupColumnId,
			initialLaneOrderByGroup: laneOrderByGroup,
			initialCardOrderByGroup: cardOrderByGroup,
			membershipComplete,
			onLaneOrderChange,
			onCardOrderChange,
		});
	const promptLaneRename = useBoardLaneRename({
		target: laneRenameTarget,
		onRenamed: renameLane,
	});
	const [moveError, setMoveError] = useState("");
	const boardScrollRef = useRef<HTMLDivElement | null>(null);
	const loadMoreRef = useRef<HTMLDivElement | null>(null);
	const suppressClickRef = useRef(false);

	const iconNameForTag = useCardTagIconName();
	const taskSummaryPaths = useMemo(
		() => Array.from(new Set(rows.map((row) => row.note_path).filter(Boolean))),
		[rows],
	);
	const taskSummariesByPath = useTaskSummariesForPaths(taskSummaryPaths, true);
	const reorderableLanes = useMemo(
		() => lanes.filter((lane) => lane.id !== DATABASE_BOARD_EMPTY_LANE_ID),
		[lanes],
	);
	const isStatusGroup = isStatusBoardColumn(groupColumn);
	const isPriorityGroup = isPriorityBoardColumn(groupColumn);
	const isTagGroup = isTagBoardColumn(groupColumn);
	const canManageLanes = canManageBoardLanes(groupColumn);
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
	const handleCreateRowInLane = useCallback(
		(laneId: string) => {
			if (!groupColumn) return;
			void onCreateRow?.({ column: groupColumn, laneId });
		},
		[groupColumn, onCreateRow],
	);

	const handleRenameLane = useCallback(
		(lane: DatabaseBoardLane) => {
			if (!groupColumn || !canManageLanes) return;
			setMoveError("");
			promptLaneRename(
				groupColumn,
				lane,
				lanes.map((entry) => entry.id),
			).catch((error: unknown) => setMoveError(extractErrorMessage(error)));
		},
		[canManageLanes, groupColumn, lanes, promptLaneRename],
	);

	const handleLaneDrop = useCallback(
		async (
			notePath: string | null,
			targetLaneId: string,
			sourceLaneId?: string | null,
			targetNotePath?: string | null,
		) => {
			if (!notePath || !groupColumn) return;
			const row = rows.find((entry) => entry.note_path === notePath);
			if (!row) return;
			if (targetLaneId === sourceLaneId) {
				if (targetNotePath && targetNotePath !== notePath) {
					moveCardToLane(notePath, targetLaneId, targetNotePath, sourceLaneId);
				} else if (!targetNotePath) {
					const targetLane = lanes.find((lane) => lane.id === targetLaneId);
					const lastRow = targetLane?.rows[targetLane.rows.length - 1];
					if (lastRow?.note_path !== notePath) {
						moveCardToLane(notePath, targetLaneId, null, sourceLaneId);
					}
				}
				return;
			}
			if (boardRowHasLane(row, groupColumn, targetLaneId)) {
				moveCardToLane(notePath, targetLaneId, targetNotePath, sourceLaneId);
				return;
			}
			try {
				setMoveError("");
				await onSaveCell(
					row.note_path,
					groupColumn,
					boardDropValue(row, groupColumn, targetLaneId, sourceLaneId),
				);
				moveCardToLane(notePath, targetLaneId, targetNotePath, sourceLaneId);
			} catch (error) {
				setMoveError(extractErrorMessage(error));
			}
		},
		[groupColumn, lanes, moveCardToLane, onSaveCell, rows],
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
			const targetLaneId =
				typeof target?.data.laneId === "string"
					? target.data.laneId
					: typeof target?.id === "string"
						? target.id
						: null;
			const targetNotePath =
				typeof target?.data.notePath === "string" ? target.data.notePath : null;
			const sourceLaneId =
				typeof source?.data.sourceLaneId === "string" ? source.data.sourceLaneId : null;
			if (!targetLaneId) return;

			void handleLaneDrop(notePath, targetLaneId, sourceLaneId, targetNotePath);
		},
		[handleLaneDrop],
	);

	useSentinelLoadMore({
		hasMore: hasMoreRows && groupColumns.length > 0,
		isLoading: isLoadingMoreRows,
		onLoadMore: onLoadMoreRows,
		rootRef: boardScrollRef,
		sentinelRef: loadMoreRef,
		rootMargin: "480px 0px",
	});

	return (
		<div className="databaseBoardShell">
			{moveError ? (
				<m.div
					className="databaseBoardError"
					initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={shouldReduceMotion ? { duration: 0 } : springPresets.snappy}
				>
					{moveError}
				</m.div>
			) : null}
			{groupColumns.length === 0 ? (
				<m.div
					className="databaseBoardEmptyState"
					initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={shouldReduceMotion ? { duration: 0 } : springPresets.snappy}
				>
					<div className="databaseBoardEmptyTitle">Add a field to create board lanes</div>
					<div className="databaseBoardEmptyText">
						Board view groups notes into lanes. Add a status, priority, checkbox, tag, or similar
						field to your notes, then pick it in the toolbar above.
					</div>
					<div className="databaseBoardEmptyActions">
						<Button type="button" variant="ghost" size="sm" onClick={onOpenColumns}>
							Open view settings
						</Button>
					</div>
				</m.div>
			) : (
				<DragDropProvider onDragEnd={handleDragEnd}>
					<div ref={boardScrollRef} className="databaseBoardHorizontal">
						<div className="databaseBoardScroller">
							{lanes.map((lane, laneIndex) => (
								<DatabaseBoardLaneView
									key={lane.id}
									lane={lane}
									laneIndex={laneIndex}
									laneColors={laneColors}
									statusColors={statusColors}
									isStatusGroup={isStatusGroup}
									isPriorityGroup={isPriorityGroup}
									isTagGroup={isTagGroup}
									shouldReduceMotion={shouldReduceMotion}
									onLaneColorChange={isPriorityGroup ? null : handleLaneColorChange}
									onAddCard={onCreateRow ? () => handleCreateRowInLane(lane.id) : undefined}
									onRenameLane={canManageLanes ? handleRenameLane : undefined}
									reorderableLanes={reorderableLanes}
									moveLaneToIndex={moveLaneToIndex}
								>
									{lane.rows.length > 0 ? (
										lane.rows.map((row) => {
											const otherLanes = lanes.filter(
												(l) =>
													l.id !== lane.id &&
													groupColumn != null &&
													!boardRowHasLane(row, groupColumn, l.id),
											);

											return (
												<DatabaseBoardCardView
													key={row.note_path}
													row={row}
													laneId={lane.id}
													selected={row.note_path === selectedRowPath}
													suppressClickRef={suppressClickRef}
													onSelectRow={onSelectRow}
													onOpenRow={onOpenRow}
													onContextMenu={(event) => {
														void showNativeContextMenu(event, [
															{
																label: "Open note",
																action: () => onOpenRow(row.note_path),
															},
															...(otherLanes.length > 0
																? [
																		{ type: "separator" as const },
																		...otherLanes.map((targetLane) => ({
																			label: `Move to ${targetLane.label}`,
																			action: () =>
																				void handleLaneDrop(row.note_path, targetLane.id, lane.id),
																		})),
																	]
																: []),
														]).catch((error: unknown) => {
															console.error("Failed to show board card context menu", error);
														});
													}}
												>
													<DatabaseCardBody
														row={row}
														title={boardCardTitle(row, lane.label)}
														cardFields={boardCardFields}
														statusColors={statusColors}
														taskSummary={taskSummariesByPath?.[row.note_path] ?? EMPTY_TASK_SUMMARY}
														iconNameForTag={iconNameForTag}
													/>
												</DatabaseBoardCardView>
											);
										})
									) : (
										<div className="databaseBoardLaneEmptyCard">
											{lane.workflowState === "archived"
												? "Archived notes go here"
												: lane.workflowState === "done"
													? "Done notes land here"
													: lane.id === DATABASE_BOARD_EMPTY_LANE_ID
														? "Notes without a value appear here"
														: "Drop notes here or add one below"}
										</div>
									)}
								</DatabaseBoardLaneView>
							))}
						</div>
						{hasMoreRows ? (
							<div ref={loadMoreRef} className="databaseBoardLoadMoreSentinel" aria-hidden="true" />
						) : null}
					</div>
				</DragDropProvider>
			)}
		</div>
	);
}
