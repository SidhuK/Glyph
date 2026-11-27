import { useDroppable } from "@dnd-kit/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { TaskBoardLane as TaskBoardLaneModel } from "../model/taskBoard";
import { taskKey } from "../model/taskIdentity";
import { TaskStatusGlyph } from "../row/TaskStatusGlyph";
import { TASK_BOARD_CARD_TYPE, TaskBoardCard } from "./TaskBoardCard";

const CARD_ESTIMATE = 68;
const CARD_OVERSCAN = 6;

interface TaskBoardLaneProps {
	lane: TaskBoardLaneModel;
	paneElement: HTMLElement | null;
}

export function TaskBoardLane({ lane, paneElement }: TaskBoardLaneProps) {
	const { t } = useTranslation("shell");
	const [cardsElement, setCardsElement] = useState<HTMLDivElement | null>(null);
	const { ref, isDropTarget } = useDroppable({
		id: `lane:${lane.id}`,
		accept: TASK_BOARD_CARD_TYPE,
		data: { laneId: lane.id },
	});
	const virtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
		count: lane.records.length,
		estimateSize: () => CARD_ESTIMATE,
		getItemKey: (index) => {
			const record = lane.records[index];
			return record ? taskKey(record) : index;
		},
		getScrollElement: () => paneElement,
		scrollMargin: cardsElement?.offsetTop ?? 0,
		overscan: CARD_OVERSCAN,
	});
	const title = t(`tasks.status.${lane.id}`);
	return (
		<section
			ref={ref}
			className="tasksBoardLane"
			data-drop-target={isDropTarget ? "true" : undefined}
			aria-label={t("tasks.board.laneLabel", { lane: title, count: lane.records.length })}
		>
			<header className="tasksBoardLaneHeader">
				<TaskStatusGlyph status={lane.id} />
				<h2 className="tasksBoardLaneTitle">{title}</h2>
				<span className="tasksBoardLaneCount">{lane.records.length}</span>
			</header>
			<div
				ref={setCardsElement}
				className="tasksBoardCards"
				style={{ height: `${virtualizer.getTotalSize()}px` }}
			>
				{virtualizer.getVirtualItems().map((item) => {
					const record = lane.records[item.index];
					if (!record) return null;
					return (
						<div
							key={item.key}
							data-index={item.index}
							ref={virtualizer.measureElement}
							className="tasksBoardCardRow"
							style={{
								transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)`,
							}}
						>
							<TaskBoardCard record={record} />
						</div>
					);
				})}
			</div>
			{lane.records.length === 0 ? (
				<p className="tasksBoardEmpty">{t("tasks.board.empty")}</p>
			) : null}
		</section>
	);
}
