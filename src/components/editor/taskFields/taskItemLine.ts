import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import { isValidIsoDate } from "../../../lib/taskFields/naturalDate";
import { taskPriorityFromName } from "../../../lib/taskFields/taskPriority";
import {
	TASK_STATUS_CHAR,
	isDoneStatusChar,
	isTaskStatusChar,
} from "../../../lib/taskFields/taskStatus";
import type { TaskPriority } from "../../../lib/tauri";
import { type TaskLineEdit, findTaskField } from "./taskLineFields";

const LEAF_PLACEHOLDER = "￼";
const MOVED_MARKER_RE = /^Moved (?:to|from)\b/;
const TASK_ITEM_NODE = "taskItem";
const TASK_LINE_CONTENT_OFFSET = 2;

interface TaskItemLine {
	taskPos: number;
	task: ProseMirrorNode;
	lineStart: number;
	text: string;
	limit: number;
}

export interface TaskItemFields {
	due: string | null;
	priority: TaskPriority | null;
	status: string;
}

function movedMarkerOffset(line: ProseMirrorNode): number {
	let markerOffset = line.content.size;
	line.forEach((child, offset) => {
		if (markerOffset !== line.content.size || !child.isText) return;
		const isBold = child.marks.some((mark) => mark.type.name === "bold");
		if (isBold && MOVED_MARKER_RE.test(child.text ?? "")) markerOffset = offset;
	});
	return markerOffset;
}

export function isInTaskItem(editor: Editor): boolean {
	const { $from } = editor.state.selection;
	for (let depth = $from.depth; depth > 0; depth -= 1) {
		if ($from.node(depth).type.name === TASK_ITEM_NODE) return true;
	}
	return false;
}

export function findTaskItemLine(editor: Editor, pos: number): TaskItemLine | null {
	const { doc } = editor.state;
	if (pos < 0 || pos > doc.content.size) return null;
	const $pos = doc.resolve(pos);
	for (let depth = $pos.depth; depth > 0; depth -= 1) {
		const task = $pos.node(depth);
		if (task.type.name !== TASK_ITEM_NODE) continue;
		const line = task.firstChild;
		if (!line?.isTextblock) return null;
		const taskPos = $pos.before(depth);
		return {
			taskPos,
			task,
			lineStart: taskPos + TASK_LINE_CONTENT_OFFSET,
			text: line.textBetween(0, line.content.size, undefined, LEAF_PLACEHOLDER),
			limit: movedMarkerOffset(line),
		};
	}
	return null;
}

export function readTaskItemFields(line: TaskItemLine): TaskItemFields {
	const due = findTaskField(line.text, "due", line.limit)?.value.trim() ?? null;
	const priority = findTaskField(line.text, "priority", line.limit)?.value ?? null;
	const status: unknown = line.task.attrs.status;
	return {
		due: due && isValidIsoDate(due) ? due : null,
		priority: priority === null ? null : taskPriorityFromName(priority),
		status: isTaskStatusChar(status) ? status : TASK_STATUS_CHAR.todo,
	};
}

function restoreCaret(editor: Editor, caret: number): void {
	const position = Math.min(caret, editor.state.doc.content.size);
	const tr = editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(position)));
	editor.view.dispatch(tr);
	editor.view.focus();
}

export function applyTaskLineEdit(
	editor: Editor,
	line: TaskItemLine,
	edit: TaskLineEdit,
	caret: number,
): void {
	const from = line.lineStart + edit.from;
	const to = line.lineStart + edit.to;
	const tr = edit.insert
		? editor.state.tr.replaceWith(from, to, editor.state.schema.text(edit.insert))
		: editor.state.tr.delete(from, to);
	editor.view.dispatch(tr);
	restoreCaret(editor, tr.mapping.map(caret));
}

export function applyTaskStatus(editor: Editor, line: TaskItemLine, status: string, caret: number) {
	const tr = editor.state.tr.setNodeMarkup(line.taskPos, undefined, {
		...line.task.attrs,
		status,
		checked: isDoneStatusChar(status),
	});
	editor.view.dispatch(tr);
	restoreCaret(editor, caret);
}
