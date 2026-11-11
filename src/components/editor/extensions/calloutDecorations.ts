import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { visitChangedNodes } from "./changedRanges";

// `[!kind]`, an optional fold sign, then the title to the end of the line.
const CALLOUT_MARKER_RE = /^[ \t]*\[!([A-Za-z_-]+)\][+-]?[ \t]*(.*)$/;
const TYPED_CALLOUT_RE = /^\s*>\s*\[!([A-Za-z_-]+)\][ \t]*(.*)$/;

function normalizeCalloutKind(rawKind: string | undefined): string {
	const kind = (rawKind ?? "note").toLowerCase();
	return kind === "warn" ? "warning" : kind;
}

/**
 * Reads `[!kind] Title` from the first line only. A soft line break keeps the body in the
 * same paragraph, so the rest of the text is body, never title.
 */
export function parseCalloutMarker(text: string): { kind: string; title: string } | null {
	const firstLine = text.split("\n", 1)[0] ?? "";
	const match = firstLine.match(CALLOUT_MARKER_RE);
	if (!match) return null;
	const kind = normalizeCalloutKind(match[1]);
	const title = (match[2] ?? "").trim() || `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`;
	return { kind, title };
}

/** Offset inside the paragraph just past its first line break, or null for a single line. */
function firstLineEnd(paragraph: ProseMirrorNode): number | null {
	let offset = 0;
	for (let i = 0; i < paragraph.childCount; i += 1) {
		const child = paragraph.child(i);
		if (child.isText) {
			const index = child.text?.indexOf("\n") ?? -1;
			if (index >= 0) return offset + index + 1;
		} else if (child.type.name === "hardBreak") {
			return offset + child.nodeSize;
		}
		offset += child.nodeSize;
	}
	return null;
}

/**
 * Marks a blockquote as a callout, and hides only its marker line: the whole first
 * paragraph when it holds just the marker, else the first line, so the body stays visible.
 */
export function calloutDecorationsForNode(node: ProseMirrorNode, pos: number): Decoration[] {
	if (node.type.name !== "blockquote" || node.childCount === 0) return [];
	const markerParagraph = node.child(0);
	const parsed = parseCalloutMarker(markerParagraph.textContent);
	if (!parsed) return [];
	const paragraphPos = pos + 1;
	const lineEnd = firstLineEnd(markerParagraph);
	return [
		Decoration.node(pos, pos + node.nodeSize, {
			class: `callout callout-${parsed.kind}`,
			"data-callout": parsed.kind,
			"data-callout-title": parsed.title,
		}),
		lineEnd === null
			? Decoration.node(paragraphPos, paragraphPos + markerParagraph.nodeSize, {
					class: "calloutMarker",
				})
			: Decoration.inline(paragraphPos + 1, paragraphPos + 1 + lineEnd, {
					class: "calloutMarker",
				}),
	];
}

function buildCalloutDecorations(doc: ProseMirrorNode): DecorationSet {
	const decorations: Decoration[] = [];
	doc.descendants((node, pos) => {
		decorations.push(...calloutDecorationsForNode(node, pos));
	});
	return decorations.length ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

/** Typing `> [!kind] Title` in a paragraph turns it into a callout with an empty body line. */
function createCalloutShortcutTransform() {
	return new Plugin({
		key: new PluginKey("callout-shortcut-transform"),
		appendTransaction(transactions, _oldState, newState) {
			if (!transactions.some((tr) => tr.docChanged)) return null;

			const blockquote = newState.schema.nodes.blockquote;
			const paragraph = newState.schema.nodes.paragraph;
			if (!blockquote || !paragraph) return null;

			const replacements: Array<{ pos: number; size: number; marker: string }> = [];
			visitChangedNodes(transactions, newState, (node, pos) => {
				if (node.type !== paragraph || node.childCount !== 1) return;
				const match = (node.textContent ?? "").match(TYPED_CALLOUT_RE);
				if (!match) return;
				const kind = normalizeCalloutKind(match[1]);
				const tail = (match[2] ?? "").trim();
				const marker = tail.length ? `[!${kind}] ${tail}` : `[!${kind}]`;
				replacements.push({ pos, size: node.nodeSize, marker });
			});
			if (!replacements.length) return null;

			let tr = newState.tr;
			for (let i = replacements.length - 1; i >= 0; i -= 1) {
				const replacement = replacements[i];
				const calloutNode = blockquote.create(null, [
					paragraph.create(null, newState.schema.text(replacement.marker)),
					paragraph.create(),
				]);
				tr = tr.replaceWith(replacement.pos, replacement.pos + replacement.size, calloutNode);
			}
			return tr.docChanged ? tr : null;
		},
	});
}

export const CalloutDecorations = Extension.create({
	name: "callout-decorations",
	addOptions() {
		return {
			enableShortcutTransform: true,
		};
	},
	addProseMirrorPlugins() {
		const key = new PluginKey<DecorationSet>("callout-decorations");
		return [
			...(this.options.enableShortcutTransform ? [createCalloutShortcutTransform()] : []),
			new Plugin<DecorationSet>({
				key,
				state: {
					init: (_config, state) => buildCalloutDecorations(state.doc),
					apply(tr, decorations) {
						if (!tr.docChanged) return decorations;
						return buildCalloutDecorations(tr.doc);
					},
				},
				props: {
					decorations(state) {
						return key.getState(state) ?? DecorationSet.empty;
					},
				},
			}),
		];
	},
});
