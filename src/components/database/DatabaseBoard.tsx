import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { m, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDateDisplayFormat, useFileTreeContext } from "../../contexts";
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
	boardLaneIdForValue,
	boardRowHasLane,
	canManageBoardLanes,
} from "../../lib/database/board";
import { isDateColumn } from "../../lib/database/columns";
import {
	databaseCellValueFromRow,
	formatCompactDatabaseDate,
	formatDatabaseDateTime,
} from "../../lib/database/config";
import type { DatabaseColumn, DatabaseRow, DatabaseSort } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import {
	DEFAULT_TAG_ICON_NAME,
	resolveTagIconName,
	tagIconOverridesFromAppearance,
} from "../../lib/tagIcons";
import type { NoteTaskSummary } from "../../lib/tauri";
import type { EditorTextColor } from "../editor/textColors";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";
import { type BoardCardValues, DatabaseBoardCardContent } from "./DatabaseBoardCardContent";
import { DatabaseBoardScrollNext, useBoardScrollNext } from "./DatabaseBoardScrollNext";
import { DatabaseBoardCardView, DatabaseBoardLaneView } from "./DatabaseBoardViews";

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
	/** Cards show a date only when the view is sorted by one, so the date explains the order. */
	activeSort?: DatabaseSort | null;
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
const EMPTY_TASK_SUMMARY: NoteTaskSummary = {
	total_count: 0,
	completed_count: 0,
	open_count: 0,
};

function isStatusBoardColumn(column: DatabaseColumn | null): boolean {
	return column?.property_kind === "status";
}

function isPriorityBoardColumn(column: DatabaseColumn | null): boolean {
	return column?.property_kind === "priority";
}

function isTagBoardColumn(column: DatabaseColumn | null): boolean {
	return column?.type === "tags" || column?.property_kind === "tags";
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

function boardCardTextPropertyValues(row: DatabaseRow, kind: "status" | "priority"): string[] {
	const values: string[] = [];
	for (const property of Object.values(row.properties)) {
		if (property.kind !== kind) continue;
		const value = property.value_text?.trim();
		if (value) values.push(value);
	}
	return values;
}

const NO_CARD_VALUES: BoardCardValues = { shown: [], hiddenCount: 0 };

/** One value per field on a card; the rest collapse into a count chip. */
function boardCardValues(visible: boolean, values: string[]): BoardCardValues {
	if (!visible || values.length === 0) return NO_CARD_VALUES;
	return { shown: values.slice(0, 1), hiddenCount: values.length - 1 };
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
	activeSort = null,
	laneRenameTarget,
	membershipComplete,
	hasMoreRows = false,
	isLoadingMoreRows = false,
	onLoadMoreRows,
	onSaveCell,
}: DatabaseBoardProps) {
	const { t, i18n } = useTranslation("shell");
	const isCardFieldVisible = useCallback(
		(fieldId: string) => {
			if (!boardCardFields || boardCardFields.length === 0) return true;
			return boardCardFields.includes(fieldId);
		},
		[boardCardFields],
	);
	const dateDisplayFormat = useDateDisplayFormat();
	const { beautifulTags, itemAppearance, tagAppearance } = useFileTreeContext();
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
	const { canScrollNext, setBoardScrollElement, onBoardScroll } =
		useBoardScrollNext(boardScrollRef);

	const tagIconOverrides = useMemo(
		() => tagIconOverridesFromAppearance(tagAppearance),
		[tagAppearance],
	);
	const iconNameForTag = useCallback(
		(tag: string) =>
			beautifulTags
				? resolveTagIconName(tag, tagIconOverrides, beautifulTags)
				: DEFAULT_TAG_ICON_NAME,
		[beautifulTags, tagIconOverrides],
	);
	const taskSummaryPaths = useMemo(
		() => Array.from(new Set(rows.map((row) => row.note_path).filter(Boolean))),
		[rows],
	);
	const taskSummariesByPath = useTaskSummariesForPaths(
		taskSummaryPaths,
		isCardFieldVisible("task_progress"),
	);
	const reorderableLanes = useMemo(
		() => lanes.filter((lane) => lane.id !== DATABASE_BOARD_EMPTY_LANE_ID),
		[lanes],
	);
	const dateSortColumn = useMemo(() => {
		const column = columns.find((entry) => entry.id === activeSort?.column_id) ?? null;
		return isDateColumn(column) ? column : null;
	}, [activeSort, columns]);
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
					<div className="databaseBoardEmptyTitle">{t("collections.board.emptyTitle")}</div>
					<div className="databaseBoardEmptyText">{t("collections.board.emptyText")}</div>
					<div className="databaseBoardEmptyActions">
						<Button type="button" variant="ghost" size="sm" onClick={onOpenColumns}>
							{t("collections.board.openViewSettings")}
						</Button>
					</div>
				</m.div>
			) : (
				<DragDropProvider onDragEnd={handleDragEnd}>
					<div
						ref={setBoardScrollElement}
						className="databaseBoardHorizontal"
						onScroll={(event) => onBoardScroll(event.currentTarget)}
					>
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
									countIsPartial={hasMoreRows}
									reorderableLanes={reorderableLanes}
									moveLaneToIndex={moveLaneToIndex}
								>
									{lane.rows.length > 0 ? (
										lane.rows.map((row) => {
											const title = boardCardTitle(row, lane.label);
											// The grouped-by value is already the lane header, so cards don't repeat it.
											const isLaneValue = (value: string) =>
												groupColumn != null && boardLaneIdForValue(groupColumn, value) === lane.id;
											const cardTags = isTagGroup
												? row.tags.filter((tag) => !isLaneValue(tag))
												: row.tags;
											const statusValues = boardCardTextPropertyValues(row, "status").filter(
												(value) => !(isStatusGroup && isLaneValue(value)),
											);
											const priorityValues = boardCardTextPropertyValues(row, "priority").filter(
												(value) => !(isPriorityGroup && isLaneValue(value)),
											);
											const sortDate = dateSortColumn
												? databaseCellValueFromRow(row, dateSortColumn).value_text?.trim()
												: null;
											const taskSummary =
												taskSummariesByPath?.[row.note_path] ?? EMPTY_TASK_SUMMARY;
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
																label: t("collections.boardCard.openNote"),
																action: () => onOpenRow(row.note_path),
															},
															...(otherLanes.length > 0
																? [
																		{ type: "separator" as const },
																		...otherLanes.map((targetLane) => ({
																			label: t("collections.boardCard.moveTo", {
																				lane: targetLane.label,
																			}),
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
													<DatabaseBoardCardContent
														row={row}
														title={title}
														appearance={itemAppearance[row.note_path] ?? null}
														statuses={boardCardValues(isCardFieldVisible("status"), statusValues)}
														priorities={boardCardValues(
															isCardFieldVisible("priority"),
															priorityValues,
														)}
														tags={boardCardValues(isCardFieldVisible("tags"), cardTags)}
														statusColors={statusColors}
														iconNameForTag={beautifulTags ? iconNameForTag : null}
														date={
															isCardFieldVisible("date") && sortDate
																? {
																		short: formatCompactDatabaseDate(sortDate, i18n.language),
																		full: formatDatabaseDateTime(sortDate, dateDisplayFormat),
																	}
																: null
														}
														taskSummary={
															isCardFieldVisible("task_progress") && taskSummary.total_count > 0
																? taskSummary
																: null
														}
													/>
												</DatabaseBoardCardView>
											);
										})
									) : (
										<div className="databaseBoardLaneEmptyCard">
											{lane.workflowState === "archived"
												? t("collections.board.laneEmpty.archived")
												: lane.workflowState === "done"
													? t("collections.board.laneEmpty.done")
													: lane.id === DATABASE_BOARD_EMPTY_LANE_ID
														? t("collections.board.laneEmpty.unassigned")
														: t("collections.board.laneEmpty.default")}
										</div>
									)}
								</DatabaseBoardLaneView>
							))}
						</div>
						{hasMoreRows ? (
							<div ref={loadMoreRef} className="databaseBoardLoadMoreSentinel" aria-hidden="true" />
						) : null}
					</div>
					{canScrollNext && lanes.length > 1 ? (
						<DatabaseBoardScrollNext
							boardScrollRef={boardScrollRef}
							reduceMotion={shouldReduceMotion}
						/>
					) : null}
				</DragDropProvider>
			)}
		</div>
	);
}
