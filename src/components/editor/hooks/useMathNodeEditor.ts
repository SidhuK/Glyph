import type { Editor } from "@tiptap/core";
import { useCallback, useRef, useState } from "react";
import type { MathEditRequest, MathKind } from "../extensions/math/mathOptions";

export function useMathNodeEditor() {
	const [request, setRequest] = useState<MathEditRequest | null>(null);
	const editorRef = useRef<Editor | null>(null);
	const editableRef = useRef(false);

	const connect = useCallback((editor: Editor | null, editable: boolean) => {
		editorRef.current = editor;
		editableRef.current = editable;
	}, []);

	const open = useCallback((next: MathEditRequest) => {
		if (!editableRef.current) return;
		setRequest(next);
	}, []);

	const close = useCallback(() => setRequest(null), []);

	const resolveNode = useCallback((kind: MathKind, pos: number) => {
		const editor = editorRef.current;
		if (!editor || editor.isDestroyed) return null;
		const node = editor.state.doc.nodeAt(pos);
		const expectedName = kind === "inline" ? "inlineMath" : "blockMath";
		return node?.type.name === expectedName ? { editor, node } : null;
	}, []);

	const apply = useCallback(
		(latex: string) => {
			if (!request) return;
			const resolved = resolveNode(request.kind, request.pos);
			if (!resolved) {
				close();
				return;
			}
			const transaction = resolved.editor.state.tr.setNodeMarkup(
				request.pos,
				undefined,
				{ ...resolved.node.attrs, latex },
			);
			resolved.editor.view.dispatch(transaction);
			close();
			resolved.editor.commands.focus(request.pos);
		},
		[close, request, resolveNode],
	);

	const remove = useCallback(() => {
		if (!request) return;
		const resolved = resolveNode(request.kind, request.pos);
		if (!resolved) {
			close();
			return;
		}
		resolved.editor.view.dispatch(
			resolved.editor.state.tr.delete(
				request.pos,
				request.pos + resolved.node.nodeSize,
			),
		);
		close();
		resolved.editor.commands.focus(request.pos);
	}, [close, request, resolveNode]);

	const getAnchorRect = useCallback(() => {
		if (!request) return null;
		const editor = editorRef.current;
		if (!editor || editor.isDestroyed) return null;
		const node = editor.view.nodeDOM(request.pos);
		return node instanceof HTMLElement ? node.getBoundingClientRect() : null;
	}, [request]);

	return { request, open, close, apply, remove, connect, getAnchorRect };
}
