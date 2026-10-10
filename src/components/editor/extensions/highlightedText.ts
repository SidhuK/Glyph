import { Mark as MarkExtension, markInputRule, markPasteRule, mergeAttributes } from "@tiptap/core";
import {
	EDITOR_TEXT_HIGHLIGHT_BRIDGE_CLOSE_TOKEN,
	type EditorTextHighlight,
	EQUALS_HIGHLIGHT_COLOR,
	EQUALS_HIGHLIGHT_INPUT_RE,
	EQUALS_HIGHLIGHT_PASTE_RE,
	EQUALS_HIGHLIGHT_RE,
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
	const equalsMatch = src.match(EQUALS_HIGHLIGHT_RE);
	if (equalsMatch) {
		return { raw: equalsMatch[0], color: EQUALS_HIGHLIGHT_COLOR, text: equalsMatch[1] ?? "" };
	}
	const match = src.match(GLYPH_HIGHLIGHT_BRIDGE_RE);
	if (!match) return null;
	const color = (match[1] ?? "").trim().toLowerCase();
	if (!isEditorTextHighlight(color)) return null;
	return {
		raw: match[0],
		color,
		text: match[2] ?? "",
	};
}

function nextHighlightStart(src: string): number {
	const starts = [src.indexOf("{{glyph-highlight:"), src.indexOf("==")].filter(
		(index) => index >= 0,
	);
	return starts.length > 0 ? Math.min(...starts) : -1;
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
					const color = element.getAttribute("data-glyph-highlight")?.trim() ?? "";
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
		const parsed = parseGlyphHighlightMark((token.raw ?? token.text ?? "").toString());
		if (!parsed) {
			return helpers.createTextNode((token.text ?? token.raw ?? "").toString());
		}
		return helpers.applyMark("highlightedText", helpers.parseInline(token.tokens ?? []), {
			color: parsed.color,
		});
	},
	markdownTokenizer: {
		name: "highlightedText",
		level: "inline",
		start: nextHighlightStart,
		tokenize(src, _tokens, helper) {
			const parsed = parseGlyphHighlightMark(src);
			if (!parsed) return undefined;
			return {
				type: "highlightedText",
				raw: parsed.raw,
				text: parsed.text,
				tokens: helper.inlineTokens(parsed.text),
			};
		},
	},
	addInputRules() {
		return [
			markInputRule({
				find: EQUALS_HIGHLIGHT_INPUT_RE,
				type: this.type,
				getAttributes: { color: EQUALS_HIGHLIGHT_COLOR },
			}),
		];
	},
	addPasteRules() {
		return [
			markPasteRule({
				find: EQUALS_HIGHLIGHT_PASTE_RE,
				type: this.type,
				getAttributes: { color: EQUALS_HIGHLIGHT_COLOR },
			}),
		];
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
					return chain().unsetMark(this.name, { extendEmptyMarkRange: true }).run();
				},
		};
	},
});
