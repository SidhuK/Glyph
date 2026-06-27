import { DragDropProvider, type DragEndEvent } from "@dnd-kit/react";
import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m, useReducedMotion } from "motion/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useFileTreeContext } from "../../contexts";
import { useDatabaseBoard } from "../../hooks/database/useDatabaseBoard";
import { useSentinelLoadMore } from "../../hooks/useLoadMoreTriggers";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";

import {
	DATABASE_BOARD_EMPTY_LANE_ID,
	type DatabaseBoardLane,
	boardDropValue,
	boardLaneIdFromLabel,
	boardLaneValue,
	boardRowHasLane,
	canManageBoardLanes,
} from "../../lib/database/board";
import {
	databaseCellValueFromRow,
	formatDatabaseDateTime,
} from "../../lib/database/config";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import {
	DEFAULT_TAG_ICON_NAME,
	resolveTagIconName,
	tagIconOverridesFromAppearance,
} from "../../lib/tagIcons";
import type { NoteTaskSummary } from "../../lib/tauri";
import { Plus } from "../Icons";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import type { EditorTextColor } from "../editor/textColors";
import { PriorityPropertyPill } from "../status/PriorityPropertyPill";
import { StatusPropertyPill } from "../status/StatusPropertyPill";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/shadcn/dialog";
import { Input } from "../ui/shadcn/input";
import {
	DatabaseBoardCardView,
	DatabaseBoardLaneView,
} from "./DatabaseBoardViews";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import {
	DatabaseNoteAppearanceIcon,
	databaseNoteAppearanceStyle,
} from "./DatabaseNoteAppearanceIcon";
import { formatDatabaseTagLabel } from "./databaseTagLabel";

interface DatabaseBoardProps {
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	groupColumnId?: string | null;
	showColumnColor?: boolean;
	selectedRowPath: string | null;
	onSelectRow: (notePath: string) => void;
	onOpenRow: (notePath: string) => void;
	onCreateRow?: (
		initialValue?: { column: DatabaseColumn; laneId: string } | null,
	) => void | Promise<void>;
	onOpenColumns: () => void;
	onGroupColumnIdChange: (groupColumnId: string | null) => void;
	laneOrderByGroup?: Record<string, string[]>;
	cardOrderByGroup?: Record<string, Record<string, string[]>>;
	onLaneOrderChange?: (
		groupColumnId: string,
		laneOrder: string[],
	) => void | Promise<void>;
	onCardOrderChange?: (
		groupColumnId: string,
		cardOrder: Record<string, string[]>,
	) => void | Promise<void>;
	laneColors?: Record<string, string>;
	statusColors?: Record<string, EditorTextColor>;
	onLaneColorChange?:
		| ((laneId: string, color: EditorTextColor | null) => void)
		| null;
	onStatusColorChange?: (status: string, color: EditorTextColor | null) => void;
	boardCardFields?: string[];
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

interface LaneEditState {
	mode: "add" | "rename";
	lane: DatabaseBoardLane | null;
	value: string;
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

function boardCardTextPropertyValues(
	row: DatabaseRow,
	kind: "status" | "priority",
): string[] {
	const values: string[] = [];
	for (const property of Object.values(row.properties)) {
		if (property.kind !== kind) continue;
		const value = property.value_text?.trim();
		if (value) values.push(value);
	}
	return values;
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

export function DatabaseBoard({
	rows,
	columns,
	groupColumnId: persistedGroupColumnId,
	showColumnColor = true,
	selectedRowPath,
	onSelectRow,
	onOpenRow,
	onCreateRow,
	onOpenColumns,
	onGroupColumnIdChange,
	laneOrderByGroup = {},
	cardOrderByGroup = {},
	onLaneOrderChange,
	onCardOrderChange,
	laneColors = EMPTY_LANE_COLORS,
	statusColors = {},
	onLaneColorChange,
	onStatusColorChange,
	boardCardFields,
	hasMoreRows = false,
	isLoadingMoreRows = false,
	onLoadMoreRows,
	onSaveCell,
}: DatabaseBoardProps) {
	const isCardFieldVisible = useCallback(
		(fieldId: string) => {
			if (!boardCardFields || boardCardFields.length === 0) return true;
			return boardCardFields.includes(fieldId);
		},
		[boardCardFields],
	);
	const { beautifulTags, itemAppearance, tagAppearance } = useFileTreeContext();
	const shouldReduceMotion = useReducedMotion();
	const {
		groupColumn,
		groupColumns,
		lanes,
		addLane,
		moveLaneToIndex,
		renameLane,
		moveCardToLane,
	} = useDatabaseBoard({
		rows,
		columns,
		initialGroupColumnId: persistedGroupColumnId,
		initialLaneOrderByGroup: laneOrderByGroup,
		initialCardOrderByGroup: cardOrderByGroup,
		onGroupColumnIdChange,
		onLaneOrderChange,
		onCardOrderChange,
	});
	const [moveError, setMoveError] = useState("");
	const [laneEdit, setLaneEdit] = useState<LaneEditState | null>(null);
	const boardShellRef = useRef<HTMLDivElement | null>(null);
	const loadMoreRef = useRef<HTMLDivElement | null>(null);
	const suppressClickRef = useRef(false);

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

	const handleAddLane = useCallback(() => {
		if (!groupColumn || !canManageLanes) return;
		setMoveError("");
		setLaneEdit({ mode: "add", lane: null, value: "" });
	}, [canManageLanes, groupColumn]);

	const handleRenameLane = useCallback(
		(lane: DatabaseBoardLane) => {
			if (!groupColumn || !canManageLanes) return;
			setMoveError("");
			setLaneEdit({ mode: "rename", lane, value: lane.label });
		},
		[canManageLanes, groupColumn],
	);

	const commitLaneEdit = useCallback(async () => {
		if (!laneEdit || !groupColumn || !canManageLanes) return;
		const laneId = boardLaneIdFromLabel(groupColumn, laneEdit.value);
		if (!laneId) return;
		if (
			lanes.some((lane) => lane.id === laneId && lane.id !== laneEdit.lane?.id)
		) {
			setMoveError(`"${laneId}" already exists.`);
			return;
		}
		setMoveError("");
		if (laneEdit.mode === "add") {
			addLane(laneId);
			setLaneEdit(null);
			return;
		}
		const lane = laneEdit.lane;
		if (!lane || laneId === lane.id) {
			setLaneEdit(null);
			return;
		}
		try {
			await Promise.all(
				lane.rows.map((row) => {
					const cell = databaseCellValueFromRow(row, groupColumn);
					const value =
						groupColumn.property_kind === "multi_select"
							? {
									kind: cell.kind,
									value_list: Array.from(
										new Set([
											...cell.value_list.filter((value) => value !== lane.id),
											laneId,
										]),
									),
								}
							: boardLaneValue(groupColumn, laneId);
					return onSaveCell(row.note_path, groupColumn, value);
				}),
			);
			renameLane(lane.id, laneId);
			setLaneEdit(null);
		} catch (error) {
			setMoveError(extractErrorMessage(error));
		}
	}, [
		addLane,
		canManageLanes,
		groupColumn,
		laneEdit,
		lanes,
		onSaveCell,
		renameLane,
	]);

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
			const notePath =
				typeof source?.data.notePath === "string" ? source.data.notePath : null;
			const targetLaneId =
				typeof target?.data.laneId === "string"
					? target.data.laneId
					: typeof target?.id === "string"
						? target.id
						: null;
			const targetNotePath =
				typeof target?.data.notePath === "string" ? target.data.notePath : null;
			const sourceLaneId =
				typeof source?.data.sourceLaneId === "string"
					? source.data.sourceLaneId
					: null;
			if (!targetLaneId) return;

			void handleLaneDrop(notePath, targetLaneId, sourceLaneId, targetNotePath);
		},
		[handleLaneDrop],
	);

	useSentinelLoadMore({
		hasMore: hasMoreRows,
		isLoading: isLoadingMoreRows,
		onLoadMore: onLoadMoreRows,
		rootRef: boardShellRef,
		sentinelRef: loadMoreRef,
		rootMargin: "480px 0px",
	});

	return (
		<div ref={boardShellRef} className="databaseBoardShell">
			<Dialog
				open={laneEdit != null}
				onOpenChange={(open) => {
					if (!open) setLaneEdit(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{laneEdit?.mode === "rename" ? "Rename lane" : "Add lane"}
						</DialogTitle>
						<DialogDescription>
							{groupColumn
								? laneEdit?.mode === "rename"
									? `Rename this ${groupColumn.label.toLowerCase()} lane. Cards here keep that value.`
									: `Cards you add or move here will get this ${groupColumn.label.toLowerCase()}.`
								: "Set the value for this board lane."}
						</DialogDescription>
					</DialogHeader>
					<form
						className="grid gap-4"
						onSubmit={(event) => {
							event.preventDefault();
							void commitLaneEdit();
						}}
					>
						<Input
							autoFocus
							value={laneEdit?.value ?? ""}
							aria-label="Lane name"
							onChange={(event) =>
								setLaneEdit((current) =>
									current ? { ...current, value: event.target.value } : current,
								)
							}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setLaneEdit(null)}
							>
								Cancel
							</Button>
							<Button type="submit">
								{laneEdit?.mode === "rename" ? "Rename" : "Add"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
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
						Add a field to create board lanes
					</div>
					<div className="databaseBoardEmptyText">
						Board view groups notes into lanes. Add a status, priority,
						checkbox, tag, or similar field to your notes, then pick it in the
						toolbar above.
					</div>
					<div className="databaseBoardEmptyActions">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onOpenColumns}
						>
							Open view settings
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
									isPriorityGroup={isPriorityGroup}
									isTagGroup={isTagGroup}
									shouldReduceMotion={shouldReduceMotion}
									onLaneColorChange={
										isPriorityGroup ? null : handleLaneColorChange
									}
									onAddLane={canManageLanes ? handleAddLane : undefined}
									onRenameLane={canManageLanes ? handleRenameLane : undefined}
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
											const statusValues = boardCardTextPropertyValues(
												row,
												"status",
											);
											const maxVisibleStatuses = 2;
											const visibleStatuses = statusValues.slice(
												0,
												maxVisibleStatuses,
											);
											const extraStatusCount = Math.max(
												statusValues.length - maxVisibleStatuses,
												0,
											);
											const priorityValues = boardCardTextPropertyValues(
												row,
												"priority",
											);
											const maxVisiblePriorities = 2;
											const visiblePriorities = priorityValues.slice(
												0,
												maxVisiblePriorities,
											);
											const extraPriorityCount = Math.max(
												priorityValues.length - maxVisiblePriorities,
												0,
											);
											const updatedLabel = formatDatabaseDateTime(row.updated);
											const compactUpdatedLabel = formatCompactBoardDateTime(
												row.updated,
											);
											const taskSummary =
												taskSummariesByPath?.[row.note_path] ??
												EMPTY_TASK_SUMMARY;
											const noteAppearance =
												itemAppearance[row.note_path] ?? null;
											const noteAppearanceStyle = databaseNoteAppearanceStyle(
												row.note_path,
												noteAppearance,
											);
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
																				void handleLaneDrop(
																					row.note_path,
																					targetLane.id,
																					lane.id,
																				),
																		})),
																	]
																: []),
														]).catch((error: unknown) => {
															console.error(
																"Failed to show board card context menu",
																error,
															);
														});
													}}
												>
													<div className="databaseBoardCardHead">
														<div className="databaseBoardCardHeaderRow">
															<span
																className="databaseBoardCardTitle"
																style={noteAppearanceStyle}
															>
																<DatabaseNoteAppearanceIcon
																	notePath={row.note_path}
																	appearance={noteAppearance}
																	className="databaseBoardCardTitleIcon"
																	size="var(--icon-md)"
																/>
																{title}
															</span>
															{isCardFieldVisible("date") ? (
																<div className="databaseBoardCardTitleMeta">
																	<span
																		className="databaseBoardCardTimestamp"
																		title={`Updated ${updatedLabel}`}
																	>
																		<HugeiconsIcon
																			icon={Calendar03Icon}
																			size="var(--icon-xs)"
																			strokeWidth={1}
																			aria-hidden="true"
																		/>
																		{compactUpdatedLabel}
																	</span>
																</div>
															) : null}
															{isCardFieldVisible("task_progress") &&
															taskSummary.total_count > 0 ? (
																<TaskProgressIndicator
																	summary={taskSummary}
																	className="databaseBoardCardTaskProgress"
																/>
															) : null}
														</div>
													</div>
													{(isCardFieldVisible("status") &&
														visibleStatuses.length > 0) ||
													(isCardFieldVisible("priority") &&
														visiblePriorities.length > 0) ? (
														<div className="databaseBoardCardMetaRow">
															<div className="databaseBoardCardMetaGroup">
																{isCardFieldVisible("status") &&
																	visibleStatuses.map((status, statusIndex) => (
																		<StatusPropertyPill
																			key={`${row.note_path}:status:${statusIndex}:${status}`}
																			value={status}
																			colors={statusColors}
																			className="databaseBoardCardStatus"
																		/>
																	))}
																{isCardFieldVisible("status") &&
																extraStatusCount > 0 ? (
																	<span className="databaseBoardTag is-muted">
																		+{extraStatusCount}
																	</span>
																) : null}
															</div>
															<div className="databaseBoardCardMetaGroup is-priority">
																{isCardFieldVisible("priority") &&
																	visiblePriorities.map(
																		(priority, priorityIndex) => (
																			<PriorityPropertyPill
																				key={`${row.note_path}:priority:${priorityIndex}:${priority}`}
																				value={priority}
																				className="databaseBoardCardStatus"
																			/>
																		),
																	)}
																{isCardFieldVisible("priority") &&
																extraPriorityCount > 0 ? (
																	<span className="databaseBoardTag is-muted">
																		+{extraPriorityCount}
																	</span>
																) : null}
															</div>
														</div>
													) : null}
													{isCardFieldVisible("tags") &&
													visibleTags.length > 0 ? (
														<div className="databaseBoardCardTags">
															{visibleTags.map((tag) => (
																<span
																	key={`${row.note_path}:${tag}`}
																	className="databaseBoardTag"
																	data-beautiful-tags={
																		beautifulTags ? "true" : undefined
																	}
																	title={formatDatabaseTagLabel(tag)}
																>
																	<DatabaseColumnIcon
																		iconName={iconNameForTag(tag)}
																		className="databaseTagPillIcon"
																		size="var(--icon-xs)"
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
									{onCreateRow ? (
										<button
											type="button"
											className="databaseBoardAddCardButton"
											onClick={() => handleCreateRowInLane(lane.id)}
											title={`Add note to ${lane.label}`}
											aria-label={`Add note to ${lane.label}`}
										>
											<Plus size="var(--icon-sm)" aria-hidden="true" />
											<span>New</span>
										</button>
									) : null}
								</DatabaseBoardLaneView>
							))}
							{canManageLanes ? (
								<button
									type="button"
									className="databaseBoardAddLaneButton"
									onClick={handleAddLane}
									title="Add lane"
									aria-label="Add board lane"
								>
									<Plus size="var(--icon-md)" aria-hidden="true" />
								</button>
							) : null}
						</div>
					</div>
				</DragDropProvider>
			)}
			{hasMoreRows ? (
				<div
					ref={loadMoreRef}
					className="databaseBoardLoadMoreSentinel"
					aria-hidden="true"
				/>
			) : null}
		</div>
	);
}
