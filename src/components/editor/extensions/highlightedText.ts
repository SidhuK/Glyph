import { Mark as MarkExtension, mergeAttributes } from "@tiptap/core";
import {
	EDITOR_TEXT_HIGHLIGHT_BRIDGE_CLOSE_TOKEN,
	type EditorTextHighlight,
	getEditorTextHighlightBridgeOpenToken,
	getEditorTextHighlightStyle,
	isEditorTextHighlight,
} from "../textHighlights";

const GLYPH_HIGHLIGHT_BRIDGE_RE =
	/^\{\{glyph-highlight:([a-z]+)\}\}([\s\S]*?)\{\{\/glyph-highlight\}\}/i;

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		highlightedText: {
			setTextHighlight: (color: EditorTextHighlight) => ReturnType;
			unsetTextHighlight: () => ReturnType;
		};
	}
}

function parseGlyphHighlightMark(src: string) {
	const match = src.match(GLYPH_HIGHLIGHT_BRIDGE_RE);
	if (!match) return null;
	const color = (match[1] ?? "").trim().toLowerCase();
	if (!isEditorTextHighlight(color)) return null;
	return {
		color,
		text: match[2] ?? "",
	};
}

export const HighlightedText = MarkExtension.create({
	name: "highlightedText",
	priority: 1000,
	inclusive: true,
	keepOnSplit: false,
	excludes: "",
	addAttributes() {
		return {
			color: {
				default: null,
				parseHTML: (element) => {
					if (!(element instanceof HTMLElement)) return null;
					return element.getAttribute("data-glyph-highlight")?.trim() ?? null;
				},
				renderHTML: (attributes) => {
					const color = attributes.color;
					if (!color || !isEditorTextHighlight(color)) return {};
					return {
						"data-glyph-highlight": color,
						style: getEditorTextHighlightStyle(color),
					};
				},
			},
		};
	},
	parseHTML() {
		return [
			{
				tag: "mark[data-glyph-highlight]",
				getAttrs: (element) => {
					if (!(element instanceof HTMLElement)) return false;
					const color =
						element.getAttribute("data-glyph-highlight")?.trim() ?? "";
					if (!isEditorTextHighlight(color)) return false;
					return { color };
				},
			},
		];
	},
	renderHTML({ HTMLAttributes }) {
		return ["mark", mergeAttributes(HTMLAttributes), 0];
	},
	renderMarkdown(node, helpers) {
		const color = node.attrs?.color;
		if (!isEditorTextHighlight(color)) {
			return helpers.renderChildren(node);
		}
		return `${getEditorTextHighlightBridgeOpenToken(color)}${helpers.renderChildren(node)}${EDITOR_TEXT_HIGHLIGHT_BRIDGE_CLOSE_TOKEN}`;
	},
	parseMarkdown(token, helpers) {
		const parsed = parseGlyphHighlightMark(
			(token.raw ?? token.text ?? "").toString(),
		);
		if (!parsed) {
			return helpers.createTextNode((token.text ?? token.raw ?? "").toString());
		}
		return helpers.applyMark(
			"highlightedText",
			helpers.parseInline(token.tokens ?? []),
			{ color: parsed.color },
		);
	},
	markdownTokenizer: {
		name: "highlightedText",
		level: "inline",
		start(src: string) {
			return src.indexOf("{{glyph-highlight:");
		},
		tokenize(src, _tokens, helper) {
			const match = src.match(GLYPH_HIGHLIGHT_BRIDGE_RE);
			if (!match) return undefined;
			const color = (match[1] ?? "").trim().toLowerCase();
			if (!isEditorTextHighlight(color)) return undefined;
			const raw = match[0];
			const text = match[2] ?? "";
			return {
				type: "highlightedText",
				raw,
				text,
				tokens: helper.inlineTokens(text),
			};
		},
	},
	addCommands() {
		return {
			setTextHighlight:
				(color: EditorTextHighlight) =>
				({ chain, editor }) => {
					if (editor.isActive("code") || editor.isActive("codeBlock")) {
						return false;
					}
					return chain()
						.unsetMark(this.name, { extendEmptyMarkRange: true })
						.setMark(this.name, { color })
						.run();
				},
			unsetTextHighlight:
				() =>
				({ chain, editor }) => {
					if (editor.isActive("code") || editor.isActive("codeBlock")) {
						return false;
					}
					return chain()
						.unsetMark(this.name, { extendEmptyMarkRange: true })
						.run();
				},
		};
	},
});
