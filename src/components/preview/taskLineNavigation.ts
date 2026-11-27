import type { Editor } from "@tiptap/core";
import { taskLineOrdinals } from "../../lib/taskLineJump";

const TASK_ITEM_NODE = "taskItem";

function taskItemPositions(editor: Editor): number[] {
	const positions: number[] = [];
	editor.state.doc.descendants((node, pos) => {
		if (node.type.name === TASK_ITEM_NODE) positions.push(pos);
		return true;
	});
	return positions;
}

function taskItemPosition(editor: Editor, markdown: string, charOffset: number): number | null {
	const positions = taskItemPositions(editor);
	const ordinals = taskLineOrdinals(markdown, charOffset);
	const ordinal = positions.length === ordinals.anyTotal ? ordinals.any : ordinals.bullet;
	return ordinal >= 0 ? (positions[ordinal] ?? null) : null;
}

export function scrollEditorToTaskLine(
	editor: Editor,
	markdown: string,
	charOffset: number,
	onSettled: () => void,
): void {
	if (editor.isDestroyed) return;
	const pos = taskItemPosition(editor, markdown, charOffset);
	if (pos === null) {
		onSettled();
		return;
	}
	editor.commands.expandHeadingAncestors(pos);
	editor.commands.setTextSelection(pos + 2);
	window.requestAnimationFrame(() => {
		if (editor.isDestroyed) return;
		const element = editor.view.nodeDOM(pos);
		if (element instanceof HTMLElement)
			element.scrollIntoView({ behavior: "smooth", block: "center" });
		onSettled();
	});
}
