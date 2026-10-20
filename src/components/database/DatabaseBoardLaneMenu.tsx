import { ArrowLeft02Icon, ArrowRight02Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DATABASE_BOARD_EMPTY_LANE_ID, type DatabaseBoardLane } from "../../lib/database/board";
import { Edit } from "../Icons";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuItemIcon,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";

interface DatabaseBoardLaneMenuProps {
	lane: DatabaseBoardLane;
	reorderableLanes: DatabaseBoardLane[];
	moveLaneToIndex: (sourceLaneId: string, targetIndex: number) => void;
	onRenameLane?: (lane: DatabaseBoardLane) => void;
}

/** The lane handle's menu: rename plus a move-to-position list. Opens on click or right-click. */
export function DatabaseBoardLaneMenu({
	lane,
	reorderableLanes,
	moveLaneToIndex,
	onRenameLane,
}: DatabaseBoardLaneMenuProps) {
	const { t } = useTranslation("shell");
	const [open, setOpen] = useState(false);
	const isEmptyLane = lane.id === DATABASE_BOARD_EMPTY_LANE_ID;
	const currentPosition = reorderableLanes.findIndex((candidate) => candidate.id === lane.id);
	const handleLabel = isEmptyLane
		? t("collections.laneMenu.unassignedLast")
		: t("collections.laneMenu.options", { lane: lane.label });

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						className="databaseBoardLaneHandle"
						disabled={isEmptyLane}
						aria-label={handleLabel}
						title={handleLabel}
						onContextMenu={(event) => {
							event.preventDefault();
							setOpen(true);
						}}
					/>
				}
			>
				<span className="databaseBoardLaneHandleDots" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{onRenameLane ? (
					<>
						<DropdownMenuItem onClick={() => onRenameLane(lane)}>
							<Edit size="var(--icon-sm)" className="glyphMenuItemIcon" aria-hidden="true" />
							<span className="glyphMenuItemLabel">
								{t("collections.laneMenu.rename", { lane: lane.label })}
							</span>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
					</>
				) : null}
				{reorderableLanes.map((targetLane, index) => (
					<DropdownMenuItem
						key={targetLane.id}
						disabled={targetLane.id === lane.id}
						onClick={() => moveLaneToIndex(lane.id, index)}
					>
						<DropdownMenuItemIcon
							icon={
								index === currentPosition
									? Location01Icon
									: index < currentPosition
										? ArrowLeft02Icon
										: ArrowRight02Icon
							}
						/>
						<span className="glyphMenuItemLabel">
							{t("collections.laneMenu.position", { position: index + 1, lane: targetLane.label })}
						</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
