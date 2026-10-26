import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { PointerActivationConstraints } from "@dnd-kit/dom";
import { KeyboardSensor, PointerSensor, useDraggable, useDroppable } from "@dnd-kit/react";
import { Tag01Icon } from "@hugeicons/core-free-icons";
import { m } from "motion/react";
import type { TFunction } from "i18next";
import { type MouseEvent, type MutableRefObject, type ReactNode, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { DatabaseBoardLane } from "../../lib/database/board";
import { databaseValueToneStyleForColor } from "../../lib/database/palette";
import type { DatabaseRow } from "../../lib/database/types";
import { priorityOptionFromValue } from "../../lib/priorityProperties";
import { statusToneStyle } from "../../lib/statusProperties";
import { Plus } from "../Icons";
import { EDITOR_TEXT_COLORS, type EditorTextColor, isEditorTextColor } from "../editor/textColors";
import { priorityPropertyIconForValue } from "../status/PriorityPropertyPill";
import { springPresets } from "../ui/animations";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { DatabaseBoardLaneMenu } from "./DatabaseBoardLaneMenu";
import { StatusRingIcon } from "../status/StatusRingIcon";

const DATABASE_BOARD_CARD_SENSORS = [
	PointerSensor.configure({
		activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
	}),
	KeyboardSensor,
];

function getLaneColor(laneColors: Record<string, string>, laneId: string): EditorTextColor | null {
	const color = laneColors[laneId];
	return color && isEditorTextColor(color) ? color : null;
}

function boardCardDragId(notePath: string, laneId: string): string {
	return `${laneId}:${notePath}`;
}

export type DatabaseLaneKind = "status" | "priority" | "tag" | null;

/** The explicit "No" priority reads as "No priority", like other lane labels that stand alone. */
export function databaseLaneDisplayLabel(
	label: string,
	kind: DatabaseLaneKind,
	t: TFunction<"shell">,
): string {
	if (kind === "priority" && priorityOptionFromValue(label)?.id === "no") {
		return t("collections.board.noPriority");
	}
	return label;
}

export function DatabaseLaneIcon({
	label,
	kind,
	className,
}: {
	label: string;
	kind: DatabaseLaneKind;
	className: string;
}) {
	if (!kind) return <span className={`${className} is-dot`} aria-hidden="true" />;
	if (kind === "status") return <StatusRingIcon value={label} className={className} />;
	return (
		<HugeiconsIcon
			icon={kind === "priority" ? priorityPropertyIconForValue(label) : Tag01Icon}
			className={kind === "priority" ? `${className} is-neutral` : className}
			size="var(--icon-sm)"
			aria-hidden="true"
		/>
	);
}

interface DatabaseBoardLaneViewProps {
	lane: DatabaseBoardLane;
	laneIndex: number;
	laneColors: Record<string, string>;
	statusColors: Record<string, EditorTextColor>;
	isStatusGroup: boolean;
	isPriorityGroup: boolean;
	isTagGroup: boolean;
	shouldReduceMotion: boolean | null;
	onLaneColorChange?: ((laneId: string, color: EditorTextColor | null) => void) | null;
	onAddCard?: () => void;
	onRenameLane?: (lane: DatabaseBoardLane) => void;
	/** More rows are still unloaded, so the lane count is a lower bound. */
	countIsPartial: boolean;
	reorderableLanes: DatabaseBoardLane[];
	moveLaneToIndex: (sourceLaneId: string, targetIndex: number) => void;
	children: ReactNode;
}

export function DatabaseBoardLaneView({
	lane,
	laneIndex,
	laneColors,
	statusColors,
	isStatusGroup,
	isPriorityGroup,
	isTagGroup,
	shouldReduceMotion,
	onLaneColorChange,
	onAddCard,
	onRenameLane,
	countIsPartial,
	reorderableLanes,
	moveLaneToIndex,
	children,
}: DatabaseBoardLaneViewProps) {
	const { ref, isDropTarget } = useDroppable({
		id: lane.id,
		data: { laneId: lane.id },
		accept: "database-board-card",
	});
	const { t } = useTranslation("shell");
	const laneKind: DatabaseLaneKind = isStatusGroup
		? "status"
		: isPriorityGroup
			? "priority"
			: isTagGroup
				? "tag"
				: null;
	const laneTitleContent = (
		<>
			<DatabaseLaneIcon label={lane.label} kind={laneKind} className="databaseBoardLaneTitleIcon" />
			<div className="databaseBoardLaneTitle">
				{databaseLaneDisplayLabel(lane.label, laneKind, t)}
			</div>
		</>
	);

	return (
		<m.div
			ref={ref}
			className="databaseBoardLane"
			data-workflow-state={lane.workflowState}
			style={
				isStatusGroup
					? statusToneStyle(lane.label, statusColors)
					: isPriorityGroup
						? undefined
						: databaseValueToneStyleForColor(lane.id, getLaneColor(laneColors, lane.id))
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
				<div className="databaseBoardLaneTitleSection">
					{onLaneColorChange ? (
						<Popover>
							<PopoverTrigger
								render={
									<button
										type="button"
										className="databaseBoardLaneTitleGroup databaseBoardLaneTitleButton"
										aria-label={t("collections.laneMenu.setColor", { lane: lane.label })}
										title={t("collections.laneMenu.setColor", { lane: lane.label })}
									/>
								}
							>
								{laneTitleContent}
							</PopoverTrigger>
							<PopoverContent align="start" className="databaseBoardColorMenu w-auto">
								<div className="databaseBoardColorRibbon">
									{EDITOR_TEXT_COLORS.map((color) => (
										<button
											key={color.id}
											type="button"
											className="databaseBoardColorRibbonSwatch"
											style={databaseValueToneStyleForColor(color.id, color.id)}
											onClick={() => onLaneColorChange(lane.id, color.id)}
											title={color.label}
											aria-label={t("collections.laneMenu.setColorTo", {
												lane: lane.label,
												color: color.label,
											})}
										/>
									))}
									<button
										type="button"
										className="databaseBoardColorRibbonClear"
										onClick={() => onLaneColorChange(lane.id, null)}
										title={t("collections.laneMenu.clearColor")}
										aria-label={t("collections.laneMenu.clearColorFor", { lane: lane.label })}
									>
										<span />
									</button>
								</div>
							</PopoverContent>
						</Popover>
					) : (
						<div className="databaseBoardLaneTitleGroup">{laneTitleContent}</div>
					)}
					<span
						className="databaseBoardLaneCount"
						aria-label={t("collections.laneMenu.cardCount", { count: lane.cardCount })}
					>
						{countIsPartial ? `${lane.cardCount}+` : lane.cardCount}
					</span>
				</div>
				<div className="databaseBoardLaneHeaderActions">
					{onAddCard ? (
						<button
							type="button"
							className="databaseBoardLaneAddCardButton"
							onClick={onAddCard}
							aria-label={t("collections.laneMenu.addNote", { lane: lane.label })}
							title={t("collections.laneMenu.addNote", { lane: lane.label })}
						>
							<Plus size="var(--icon-md)" aria-hidden="true" />
						</button>
					) : null}
					<DatabaseBoardLaneMenu
						lane={lane}
						reorderableLanes={reorderableLanes}
						moveLaneToIndex={moveLaneToIndex}
						onRenameLane={onRenameLane}
					/>
				</div>
			</div>
			<div className="databaseBoardLaneBody">
				{children}
				{onAddCard ? (
					<button
						type="button"
						className="databaseBoardLaneAddRow"
						onClick={onAddCard}
						aria-label={t("collections.laneMenu.addNote", {
							lane: databaseLaneDisplayLabel(lane.label, laneKind, t),
						})}
						title={t("collections.laneMenu.addNote", {
							lane: databaseLaneDisplayLabel(lane.label, laneKind, t),
						})}
					>
						<Plus size="var(--icon-sm)" aria-hidden="true" />
					</button>
				) : null}
			</div>
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
	const { t } = useTranslation("shell");
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
			title={t("collections.boardCard.openHint")}
		>
			{children}
		</button>
	);
}
