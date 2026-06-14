import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, Selection, TextSelection } from "@tiptap/pm/state";

export const markdownImagePreviewPluginKey = new PluginKey(
	"markdown-image-preview",
);

function parseStandaloneMarkdownImage(
	text: string,
): { alt: string; src: string; title: string } | null {
	const trimmed = text.trim();
	const match = trimmed.match(/^!\[([^\]\n]*)\]\((.+?)(?:\s+"([^"]*)")?\)$/);
	if (!match) return null;
	const src = (match[2] ?? "").trim();
	if (!src) return null;
	return {
		alt: (match[1] ?? "").trim(),
		src,
		title: (match[3] ?? "").trim(),
	};
}

function buildImageMarkdown(attrs: Record<string, unknown>): string | null {
	const originSrc =
		typeof attrs.originSrc === "string" && attrs.originSrc.trim()
			? attrs.originSrc.trim()
			: typeof attrs.src === "string"
				? attrs.src.trim()
				: "";
	if (!originSrc) return null;
	const alt = typeof attrs.alt === "string" ? attrs.alt.trim() : "";
	const title = typeof attrs.title === "string" ? attrs.title.trim() : "";
	return title
		? `![${alt}](${originSrc} "${title}")`
		: `![${alt}](${originSrc})`;
}

type ExpandOp = {
	kind: "expand";
	pos: number;
	size: number;
	markdown: string;
};

type CollapseOp = {
	kind: "collapse";
	pos: number;
	size: number;
	alt: string;
	src: string;
	title: string;
};

type PreviewOp = ExpandOp | CollapseOp;

export const MarkdownImageLivePreview = Extension.create({
	name: "markdown-image-live-preview",
	addProseMirrorPlugins() {
		const editor = this.editor;
		return [
			new Plugin({
				key: markdownImagePreviewPluginKey,
				appendTransaction(transactions, oldState, newState) {
					if (!editor?.isEditable) return null;
					const selectionChanged = transactions.some((tr) => tr.selectionSet);
					const relevant =
						selectionChanged || transactions.some((tr) => tr.docChanged);
					if (!relevant) return null;
					if (
						transactions.some(
							(tr) => tr.getMeta(markdownImagePreviewPluginKey) === "applied",
						)
					) {
						return null;
					}

					const paragraph = newState.schema.nodes.paragraph;
					const image = newState.schema.nodes.image;
					if (!paragraph || !image) return null;

					const { from: selFrom, to: selTo } = newState.selection;
					const ops: PreviewOp[] = [];

					newState.doc.descendants((node, pos) => {
						const start = pos;
						const end = pos + node.nodeSize;
						const caretInside = selFrom < end && selTo > start;

						if (node.type === image) {
							if (!caretInside || !selectionChanged) return false;
							if (oldState.doc.nodeAt(pos)?.type !== image) return false;
							const markdown = buildImageMarkdown(
								node.attrs as Record<string, unknown>,
							);
							if (!markdown) return false;
							const $pos = newState.doc.resolve(pos);
							const index = $pos.index();
							if (!$pos.parent.canReplaceWith(index, index + 1, paragraph)) {
								return false;
							}
							ops.push({
								kind: "expand",
								pos,
								size: node.nodeSize,
								markdown,
							});
							return false;
						}

						if (
							node.type === paragraph &&
							node.childCount === 1 &&
							node.firstChild?.type.name === "text"
						) {
							if (caretInside) return false;
							const parsed = parseStandaloneMarkdownImage(
								node.textContent ?? "",
							);
							if (!parsed) return false;
							const $pos = newState.doc.resolve(pos);
							if ($pos.parent.type.name === "listItem") return false;
							const index = $pos.index();
							if (!$pos.parent.canReplaceWith(index, index + 1, image)) {
								return false;
							}
							ops.push({
								kind: "collapse",
								pos,
								size: node.nodeSize,
								alt: parsed.alt,
								src: parsed.src,
								title: parsed.title,
							});
							return false;
						}

						return undefined;
					});

					if (!ops.length) return null;

					ops.sort((a, b) => b.pos - a.pos);
					const expandOps = ops.filter(
						(op): op is ExpandOp => op.kind === "expand",
					);
					const collapseOps = ops.filter(
						(op): op is CollapseOp => op.kind === "collapse",
					);
					const selectionHead = newState.selection.head;

					let tr = newState.tr;
					for (const op of ops) {
						if (op.kind === "collapse") {
							tr = tr.replaceWith(
								op.pos,
								op.pos + op.size,
								image.create({
									src: op.src,
									alt: op.alt,
									title: op.title,
									originSrc: op.src,
								}),
							);
						} else {
							tr = tr.replaceWith(
								op.pos,
								op.pos + op.size,
								paragraph.create(null, newState.schema.text(op.markdown)),
							);
						}
					}

					if (!tr.docChanged) return null;

					if (expandOps.length === 1) {
						const op = expandOps[0];
						const base = tr.mapping.map(op.pos, -1) + 1;
						const srcOffset = op.markdown.indexOf("](") + 2;
						const srcEndOffset = op.markdown.indexOf(")", srcOffset);
						const srcStart = base + srcOffset;
						const srcEnd =
							base + (srcEndOffset === -1 ? srcOffset : srcEndOffset);
						try {
							tr = tr.setSelection(
								TextSelection.create(tr.doc, srcStart, srcEnd),
							);
						} catch {
							// Leave the mapped selection untouched.
						}
					}

					if (!expandOps.length && collapseOps.length) {
						const collapsedStart = Math.min(...collapseOps.map((op) => op.pos));
						const bias = selectionHead <= collapsedStart ? -1 : 1;
						const mappedHead = Math.max(
							0,
							Math.min(tr.doc.content.size, tr.mapping.map(selectionHead, bias)),
						);
						try {
							tr = tr.setSelection(
								Selection.near(tr.doc.resolve(mappedHead), bias),
							);
						} catch {
							// Leave the mapped selection untouched.
						}
					}

					tr.setMeta(markdownImagePreviewPluginKey, "applied");
					tr.setMeta("addToHistory", false);
					return tr;
				},
			}),
		];
	},
});
