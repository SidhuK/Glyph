import { NextWeekIcon, Sun02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../ui/shadcn/button";
import { getOffsetWithinAncestor } from "../hooks/editorDomUtils";
import type { RolloverTaskActions as TaskActions } from "../types";

interface CandidateTask {
	index: number;
	total: number;
	left: number;
	top: number;
}

const MOVED_TO_DATE_PATTERN = /\bMoved to\s*\[\[\d{4}-\d{2}-\d{2}\]\]/;

/**
 * The backend only looks for the marker on the task's own line, so nested
 * subtasks must be ignored here or the two candidate lists drift apart.
 */
function hasMovedMarker(node: ProseMirrorNode): boolean {
	const ownLine = node.firstChild;
	if (!ownLine) return false;
	let markdown = "";
	ownLine.descendants((child) => {
		if (child.isText) {
			markdown += child.text ?? "";
		} else if (child.type.name === "wikiLink") {
			const target: unknown = child.attrs.target;
			if (typeof target === "string") markdown += `[[${target}]]`;
		}
	});
	return MOVED_TO_DATE_PATTERN.test(markdown);
}

function activeTask(editor: Editor, host: HTMLElement): CandidateTask | null {
	const positions: number[] = [];
	editor.state.doc.descendants((node, position) => {
		// The backend never parses `> - [ ] …` as a task, so blockquoted tasks
		// must stay out of this list to keep both orderings identical.
		if (node.type.name === "blockquote") return false;
		if (node.type.name !== "taskItem") return true;
		let unfinished = node.attrs.checked !== true;
		node.descendants((child) => {
			if (child.type.name === "taskItem" && child.attrs.checked !== true) {
				unfinished = true;
			}
		});
		if (unfinished && !hasMovedMarker(node)) {
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
	return {
		index,
		total: positions.length,
		left: offset.left + element.offsetWidth,
		top: offset.top,
	};
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
					onClick={() =>
						actions.onMoveCandidate(
							{ index: active.index, total: active.total },
							target,
						)
					}
				>
					<HugeiconsIcon icon={target === "today" ? Sun02Icon : NextWeekIcon} />
				</Button>
			))}
		</div>
	);
}
