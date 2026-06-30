import { PointerActivationConstraints } from "@dnd-kit/dom";
import {
	KeyboardSensor,
	PointerSensor,
	useDraggable,
	useDroppable,
} from "@dnd-kit/react";
import { Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m } from "motion/react";
import {
	type MouseEvent,
	type MutableRefObject,
	type ReactNode,
	useCallback,
	useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import {
	DATABASE_BOARD_EMPTY_LANE_ID,
	type DatabaseBoardLane,
} from "../../lib/database/board";
import { databaseValueToneStyleForColor } from "../../lib/database/palette";
import type { DatabaseRow } from "../../lib/database/types";
import {
	type NativeContextMenuItem,
	showNativeContextMenu,
	showNativePopupMenu,
} from "../../lib/nativeContextMenu";
import { priorityToneStyle } from "../../lib/priorityProperties";
import { statusToneStyle } from "../../lib/statusProperties";
import {
	EDITOR_TEXT_COLORS,
	type EditorTextColor,
	isEditorTextColor,
} from "../editor/textColors";
import { priorityPropertyIconForValue } from "../status/PriorityPropertyPill";
import { statusPropertyIconForValue } from "../status/StatusPropertyPill";
import { springPresets } from "../ui/animations";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";

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

export function DatabaseBoardLaneView({
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
	const { t } = useTranslation("ui");
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
							label: t("database.board.renameLaneMenu", { label: lane.label }),
							action: () => onRenameLane(lane),
						},
					]
				: []),
			...(onAddLane
				? [
						{
							label: t("database.board.addLane"),
							action: onAddLane,
						},
					]
				: []),
			...(onRenameLane || onAddLane ? [{ type: "separator" as const }] : []),
			...reorderableLanes.map((targetLane, index) => ({
				label: t("database.board.positionLane", {
					index: index + 1,
					label: targetLane.label,
				}),
				enabled: targetLane.id !== lane.id,
				action: () => moveLaneToIndex(lane.id, index),
			})),
		],
		[lane, moveLaneToIndex, onAddLane, onRenameLane, reorderableLanes, t],
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
					size="var(--icon-sm)"
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
								aria-label={t("database.board.setColorFor", {
									label: lane.label,
								})}
								title={t("database.board.setColorFor", { label: lane.label })}
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
										aria-label={t("database.board.setColorTo", {
											lane: lane.label,
											color: color.label,
										})}
									/>
								))}
								<button
									type="button"
									className="databaseBoardColorRibbonClear"
									onClick={() => onLaneColorChange(lane.id, null)}
									title={t("database.clearColor")}
									aria-label={t("database.board.clearColorFor", {
										label: lane.label,
									})}
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
								? t("database.board.unassignedLaneLast")
								: t("database.board.openLaneOptions", { label: lane.label })
						}
						title={
							lane.id === DATABASE_BOARD_EMPTY_LANE_ID
								? t("database.board.unassignedLaneLast")
								: t("database.board.openLaneOptions", { label: lane.label })
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

export function DatabaseBoardCardView({
	row,
	laneId,
	selected,
	suppressClickRef,
	onSelectRow,
	onOpenRow,
	onContextMenu,
	children,
}: DatabaseBoardCardViewProps) {
	const { t } = useTranslation("ui");
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
			title={t("database.openNoteHint")}
		>
			{children}
		</button>
	);
}
