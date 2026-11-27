import type { Editor } from "@tiptap/core";
import { useCallback, useRef, useState } from "react";
import { taskPriorityName } from "../../../lib/taskFields/taskPriority";
import type { TaskPriority } from "../../../lib/tauri";
import type { TaskFieldRequest } from "./taskFieldRequest";
import {
	type TaskItemFields,
	applyTaskLineEdit,
	applyTaskStatus,
	findTaskItemLine,
	readTaskItemFields,
} from "./taskItemLine";
import { type TaskLineEdit, planTaskFieldRemoval, planTaskFieldWrite } from "./taskLineFields";

export interface OpenTaskFieldMenu extends TaskFieldRequest {
	fields: TaskItemFields;
}

export function useTaskFieldMenu() {
	const [request, setRequest] = useState<OpenTaskFieldMenu | null>(null);
	const editorRef = useRef<Editor | null>(null);
	const editableRef = useRef(false);

	const connect = useCallback((editor: Editor | null, editable: boolean) => {
		editorRef.current = editor;
		editableRef.current = editable;
	}, []);

	const liveEditor = useCallback(() => {
		const editor = editorRef.current;
		return editor && !editor.isDestroyed ? editor : null;
	}, []);

	const open = useCallback(
		(next: TaskFieldRequest) => {
			const editor = liveEditor();
			const line = editor && editableRef.current ? findTaskItemLine(editor, next.pos) : null;
			if (!line) return;
			setRequest({ ...next, fields: readTaskItemFields(line) });
		},
		[liveEditor],
	);

	const close = useCallback(
		(restoreFocus: boolean) => {
			setRequest(null);
			const editor = liveEditor();
			if (restoreFocus && editor && request) editor.commands.focus(request.pos);
		},
		[liveEditor, request],
	);

	const editLine = useCallback(
		(plan: (text: string, limit: number) => TaskLineEdit | null) => {
			const editor = liveEditor();
			const line = editor && request ? findTaskItemLine(editor, request.pos) : null;
			setRequest(null);
			if (!editor || !line || !request) return;
			const edit = plan(line.text, line.limit);
			if (edit) applyTaskLineEdit(editor, line, edit, request.pos);
			else editor.commands.focus(request.pos);
		},
		[liveEditor, request],
	);

	const setDue = useCallback(
		(isoDate: string) =>
			editLine((text, limit) => planTaskFieldWrite({ text, limit, key: "due", value: isoDate })),
		[editLine],
	);

	const removeDue = useCallback(
		() => editLine((text, limit) => planTaskFieldRemoval({ text, limit, key: "due" })),
		[editLine],
	);

	const setPriority = useCallback(
		(priority: TaskPriority) =>
			editLine((text, limit) =>
				planTaskFieldWrite({ text, limit, key: "priority", value: taskPriorityName(priority) }),
			),
		[editLine],
	);

	const setStatus = useCallback(
		(status: string) => {
			const editor = liveEditor();
			const line = editor && request ? findTaskItemLine(editor, request.pos) : null;
			setRequest(null);
			if (editor && line && request) applyTaskStatus(editor, line, status, request.pos);
		},
		[liveEditor, request],
	);

	const getAnchorRect = useCallback(() => {
		const editor = liveEditor();
		if (!editor || !request) return null;
		const position = Math.min(request.pos, editor.state.doc.content.size);
		const coords = editor.view.coordsAtPos(position);
		return new DOMRect(coords.left, coords.top, 1, coords.bottom - coords.top);
	}, [liveEditor, request]);

	return {
		request,
		open,
		close,
		connect,
		setDue,
		removeDue,
		setPriority,
		setStatus,
		getAnchorRect,
	};
}
