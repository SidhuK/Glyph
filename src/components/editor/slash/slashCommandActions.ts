import type { Editor, JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { splitYamlFrontmatter } from "../../../lib/notePreview";
import {
	BLOCK_MATH_STARTER,
	INLINE_MATH_STARTER,
	type MathEditRequest,
} from "../extensions/math/mathOptions";
import { preprocessMarkdownForEditor } from "../markdown/editorMarkdownBridge";
import type { TemplateInsertRequest } from "./slashMenuItems";

export function insertMathAndOpen(
	editor: Editor,
	range: { from: number; to: number },
	kind: "inline" | "block",
	onMathEditRequest?: (request: MathEditRequest) => void,
) {
	const resolved = editor.state.doc.resolve(range.from);
	let insideTableCell = false;
	for (let depth = resolved.depth; depth > 0; depth -= 1) {
		const name = resolved.node(depth).type.name;
		if (name === "tableCell" || name === "tableHeader") {
			insideTableCell = true;
			break;
		}
	}
	const tableDisplay = kind === "block" && insideTableCell;
	const type = kind === "inline" || tableDisplay ? "inlineMath" : "blockMath";
	const latex = kind === "inline" ? INLINE_MATH_STARTER : BLOCK_MATH_STARTER;
	const inserted = editor
		.chain()
		.focus()
		.deleteRange(range)
		.insertContent({ type, attrs: { display: tableDisplay, latex } })
		.run();
	if (!inserted) return;
	const candidates: number[] = [];
	editor.state.doc.descendants((node, pos) => {
		if (node.type.name !== type) return;
		candidates.push(pos);
	});
	const nearestPos = candidates.reduce<number | null>((nearest, pos) => {
		if (nearest === null) return pos;
		return Math.abs(pos - range.from) < Math.abs(nearest - range.from) ? pos : nearest;
	}, null);
	if (nearestPos === null) return;
	onMathEditRequest?.({ kind, latex, pos: nearestPos });
}

function parseTemplateContent(editor: Editor, markdown: string): JSONContent[] {
	const { body } = splitYamlFrontmatter(markdown);
	const manager = new MarkdownManager({
		extensions: editor.extensionManager.extensions,
		markedOptions: { gfm: true, breaks: false },
	});
	const parsed = manager.parse(preprocessMarkdownForEditor(body));
	const content = Array.isArray(parsed.content) ? parsed.content : [];
	if (content.length !== 1 || content[0]?.type !== "paragraph") return content;
	return Array.isArray(content[0].content) ? content[0].content : [];
}

function restoreTemplateInsertionPoint(editor: Editor, position: number) {
	if (editor.isDestroyed) return;
	const resolvedPosition = Math.min(position, editor.state.doc.content.size);
	editor.chain().focus().setTextSelection(resolvedPosition).run();
}

export function requestTemplateInsertion({
	editor,
	range,
	onTemplateInsertRequest,
}: {
	editor: Editor;
	range: { from: number; to: number };
	onTemplateInsertRequest?: (request: TemplateInsertRequest) => void;
}) {
	if (!onTemplateInsertRequest) return;
	const position = range.from;
	const requestDocument = editor.state.doc;
	onTemplateInsertRequest({
		cancel: () => restoreTemplateInsertionPoint(editor, range.to),
		insert: (markdown) => {
			if (editor.isDestroyed || !editor.state.doc.eq(requestDocument)) {
				return false;
			}
			try {
				const content = parseTemplateContent(editor, markdown);
				if (!content.length) {
					restoreTemplateInsertionPoint(editor, range.to);
					return false;
				}
				const inserted = editor
					.chain()
					.focus()
					.deleteRange(range)
					.insertContentAt(position, content)
					.run();
				if (!inserted) restoreTemplateInsertionPoint(editor, range.to);
				return inserted;
			} catch {
				restoreTemplateInsertionPoint(editor, range.to);
				return false;
			}
		},
	});
}
