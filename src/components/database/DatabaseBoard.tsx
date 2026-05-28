import { PointerActivationConstraints } from "@dnd-kit/dom";
import {
	DragDropProvider,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useDraggable,
	useDroppable,
} from "@dnd-kit/react";
import { Calendar03Icon, Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m, useReducedMotion } from "motion/react";
import {
	type MouseEvent,
	type MutableRefObject,
	type ReactNode,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";
import { useFileTreeContext } from "../../contexts";
import { useDatabaseBoard } from "../../hooks/database/useDatabaseBoard";
import { useTaskProgressIndicatorSetting } from "../../hooks/useTaskProgressIndicatorSetting";
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
import { databaseValueToneStyleForColor } from "../../lib/database/palette";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type NativeContextMenuItem,
	showNativeContextMenu,
	showNativePopupMenu,
} from "../../lib/nativeContextMenu";
import { priorityToneStyle } from "../../lib/priorityProperties";
import { statusToneStyle } from "../../lib/statusProperties";
import {
	DEFAULT_TAG_ICON_NAME,
	resolveTagIconName,
	tagIconOverridesFromAppearance,
} from "../../lib/tagIcons";
import type { NoteTaskSummary } from "../../lib/tauri";
import { Plus } from "../Icons";
import {
	EDITOR_TEXT_COLORS,
	type EditorTextColor,
	isEditorTextColor,
} from "../editor/textColors";
import {
	PriorityPropertyPill,
	priorityPropertyIconForValue,
} from "../status/PriorityPropertyPill";
import {
	StatusPropertyPill,
	statusPropertyIconForValue,
} from "../status/StatusPropertyPill";
import { TaskProgressIndicator } from "../tasks/TaskProgressIndicator";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { Input } from "../ui/shadcn/input";
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
	isPriorityGroup: boolean;
	isTagGroup: boolean;
	shouldReduceMotion: boolean | null;
	onLaneColorChange?:
		| ((laneId: string, color: EditorTextColor | null) => void)
		| null;
	onAddLane?: () => void;
	onRenameLane?: (lane: DatabaseBoardLane) => void;
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
	isPriorityGroup,
	isTagGroup,
	shouldReduceMotion,
	onLaneColorChange,
	onAddLane,
	onRenameLane,
	reorderableLanes,
	moveLaneToIndex,
	children,
}: DatabaseBoardLaneViewProps) {
	const { ref, isDropTarget } = useDroppable({
		id: lane.id,
		data: { laneId: lane.id },
		accept: "database-board-card",
	});
	const laneMenuItems = useMemo<NativeContextMenuItem[]>(
		() => [
			...(onRenameLane
				? [
						{
							label: `Rename ${lane.label}`,
							action: () => onRenameLane(lane),
						},
					]
				: []),
			...(onAddLane
				? [
						{
							label: "Add lane",
							action: onAddLane,
						},
					]
				: []),
			...(onRenameLane || onAddLane ? [{ type: "separator" as const }] : []),
			...reorderableLanes.map((targetLane, index) => ({
				label: `Position ${index + 1}: ${targetLane.label}`,
				enabled: targetLane.id !== lane.id,
				action: () => moveLaneToIndex(lane.id, index),
			})),
		],
		[lane, moveLaneToIndex, onAddLane, onRenameLane, reorderableLanes],
	);
	const handleLaneContextMenu = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			if (lane.id === DATABASE_BOARD_EMPTY_LANE_ID) return;

			void showNativeContextMenu(event, laneMenuItems).catch(
				(error: unknown) => {
					console.error("Failed to show board lane context menu", error);
				},
			);
		},
		[lane.id, laneMenuItems],
	);
	const handleLaneMenuClick = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			if (lane.id === DATABASE_BOARD_EMPTY_LANE_ID) return;

			void showNativePopupMenu(event, laneMenuItems).catch((error: unknown) => {
				console.error("Failed to show board lane context menu", error);
			});
		},
		[lane.id, laneMenuItems],
	);
	const laneTitleContent = (
		<>
			{isStatusGroup || isPriorityGroup || isTagGroup ? (
				<HugeiconsIcon
					icon={
						isStatusGroup
							? statusPropertyIconForValue(lane.label)
							: isPriorityGroup
								? priorityPropertyIconForValue(lane.label)
								: Tag01Icon
					}
					className="databaseBoardLaneTitleIcon"
					size={12}
					strokeWidth={1.2}
					aria-hidden="true"
				/>
			) : (
				<span className="databaseBoardLaneDot" />
			)}
			<div className="databaseBoardLaneTitle">{lane.label}</div>
		</>
	);

	return (
		<m.div
			ref={ref}
			className="databaseBoardLane"
			data-show-column-color={showColumnColor ? "true" : "false"}
			data-workflow-state={lane.workflowState}
			style={
				isStatusGroup
					? statusToneStyle(lane.label, statusColors)
					: isPriorityGroup
						? priorityToneStyle(lane.label)
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
								{laneTitleContent}
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
					<div className="databaseBoardLaneTitleGroup">{laneTitleContent}</div>
				)}
				<div className="databaseBoardLaneHeaderActions">
					<button
						type="button"
						className="databaseBoardLaneHandle"
						disabled={lane.id === DATABASE_BOARD_EMPTY_LANE_ID}
						aria-label={
							lane.id === DATABASE_BOARD_EMPTY_LANE_ID
								? "No value stays last"
								: `Open ${lane.label} lane options`
						}
						title={
							lane.id === DATABASE_BOARD_EMPTY_LANE_ID
								? "No value stays last"
								: `Open ${lane.label} lane options`
						}
						aria-haspopup="menu"
						onClick={handleLaneMenuClick}
						onContextMenu={handleLaneContextMenu}
					>
						<span className="databaseBoardLaneHandleDots" />
					</button>
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
	onContextMenu: (event: MouseEvent<HTMLButtonElement>) => void;
	children: ReactNode;
}

function DatabaseBoardCardView({
	row,
	laneId,
	selected,
	suppressClickRef,
	onSelectRow,
	onOpenRow,
	onContextMenu,
	children,
}: DatabaseBoardCardViewProps) {
	const dragId = boardCardDragId(row.note_path, laneId);
	const { ref: droppableRef, isDropTarget } = useDroppable({
		id: `card:${dragId}`,
		data: {
			laneId,
			notePath: row.note_path,
		},
		accept: "database-board-card",
	});
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
			droppableRef(element);
			ref(element);
			handleRef(element);
		},
		[droppableRef, handleRef, ref],
	);

	return (
		<button
			ref={setCardRef}
			type="button"
			className="databaseBoardCard"
			data-state={selected ? "selected" : undefined}
			data-dragging={isDragging ? "true" : undefined}
			data-drop-target={isDropTarget ? "true" : undefined}
			onClick={() => {
				if (suppressClickRef.current) return;
				onSelectRow(row.note_path);
			}}
			onContextMenu={onContextMenu}
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
	onSaveCell,
}: DatabaseBoardProps) {
	const { beautifulTags, tagAppearance } = useFileTreeContext();
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
	const suppressClickRef = useRef(false);
	const showTaskProgressIndicator = useTaskProgressIndicatorSetting();
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
		showTaskProgressIndicator,
	);
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

	return (
		<div className="databaseBoardShell">
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
								? `Set the ${groupColumn.label} value for this board lane.`
								: "Set the board lane value."}
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
												taskSummariesByPath[row.note_path] ??
												EMPTY_TASK_SUMMARY;
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
													{visibleStatuses.length > 0 ||
													visiblePriorities.length > 0 ? (
														<div className="databaseBoardCardMetaRow">
															<div className="databaseBoardCardMetaGroup">
																{visibleStatuses.map((status, statusIndex) => (
																	<StatusPropertyPill
																		key={`${row.note_path}:status:${statusIndex}:${status}`}
																		value={status}
																		colors={statusColors}
																		className="databaseBoardCardStatus"
																	/>
																))}
																{extraStatusCount > 0 ? (
																	<span className="databaseBoardTag is-muted">
																		+{extraStatusCount}
																	</span>
																) : null}
															</div>
															<div className="databaseBoardCardMetaGroup is-priority">
																{visiblePriorities.map(
																	(priority, priorityIndex) => (
																		<PriorityPropertyPill
																			key={`${row.note_path}:priority:${priorityIndex}:${priority}`}
																			value={priority}
																			className="databaseBoardCardStatus"
																		/>
																	),
																)}
																{extraPriorityCount > 0 ? (
																	<span className="databaseBoardTag is-muted">
																		+{extraPriorityCount}
																	</span>
																) : null}
															</div>
														</div>
													) : null}
													{visibleTags.length > 0 ? (
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
												</DatabaseBoardCardView>
											);
										})
									) : (
										<div className="databaseBoardLaneEmptyCard">
											{lane.workflowState === "archived"
												? "Archive notes here"
												: lane.workflowState === "done"
													? "Completed notes land here"
													: "Drop notes here"}
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
											<Plus size={13} aria-hidden="true" />
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
									<Plus size={14} aria-hidden="true" />
								</button>
							) : null}
						</div>
					</div>
				</DragDropProvider>
			)}
		</div>
	);
}
