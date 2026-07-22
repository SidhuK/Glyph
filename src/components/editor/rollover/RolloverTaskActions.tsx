import { NextWeekIcon, Sun02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Editor } from "@tiptap/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/shadcn/button";
import { getOffsetWithinAncestor } from "../hooks/editorDomUtils";
import type { RolloverTaskActions as TaskActions } from "../types";

interface CandidateTask {
	index: number;
	left: number;
	top: number;
}

function activeTask(editor: Editor, host: HTMLElement): CandidateTask | null {
	const positions: number[] = [];
	editor.state.doc.descendants((node, position) => {
		if (node.type.name !== "taskItem") return true;
		let unfinished = node.attrs.checked !== true;
		node.descendants((child) => {
			if (child.type.name === "taskItem" && child.attrs.checked !== true) {
				unfinished = true;
			}
		});
		if (unfinished && !node.textContent.includes("Moved to ")) {
			positions.push(position);
		}
		return false;
	});

	const { $from } = editor.state.selection;
	let selectedTask: number | null = null;
	for (let depth = 1; depth <= $from.depth; depth += 1) {
		if ($from.node(depth).type.name === "taskItem") {
			selectedTask = $from.before(depth);
			break;
		}
	}
	const index = selectedTask === null ? -1 : positions.indexOf(selectedTask);
	if (index < 0) return null;
	const element = editor.view.nodeDOM(positions[index]);
	if (!(element instanceof HTMLElement)) return null;
	const offset = getOffsetWithinAncestor(element, host);
	return { index, left: offset.left + element.offsetWidth, top: offset.top };
}

export function RolloverTaskActions({
	actions,
	editor,
	host,
}: {
	actions: TaskActions;
	editor: Editor;
	host: HTMLElement;
}) {
	const { t } = useTranslation("editor");
	const [active, setActive] = useState(() => activeTask(editor, host));

	useEffect(() => {
		const update = () => setActive(activeTask(editor, host));
		editor.on("selectionUpdate", update);
		editor.on("transaction", update);
		return () => {
			editor.off("selectionUpdate", update);
			editor.off("transaction", update);
		};
	}, [editor, host]);

	if (!active) return null;
	return (
		<div
			className="rolloverTaskActionButtons"
			style={{ left: active.left, top: active.top }}
		>
			{actions.targets.map((target) => (
				<Button
					key={target}
					variant="outline"
					size="icon-xs"
					title={
						target === "today"
							? t("rollover.moveToday")
							: t("rollover.moveTomorrow")
					}
					aria-label={
						target === "today"
							? t("rollover.moveToday")
							: t("rollover.moveTomorrow")
					}
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => actions.onMoveCandidate(active.index, target)}
				>
					<HugeiconsIcon icon={target === "today" ? Sun02Icon : NextWeekIcon} />
				</Button>
			))}
		</div>
	);
}
