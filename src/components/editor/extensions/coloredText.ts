import { Mark as MarkExtension, mergeAttributes } from "@tiptap/core";
import {
	EDITOR_TEXT_COLOR_BRIDGE_CLOSE_TOKEN,
	type EditorTextColor,
	getEditorTextColorBridgeOpenToken,
	getEditorTextColorStyle,
	isEditorTextColor,
} from "../textColors";

const GLYPH_COLOR_BRIDGE_RE =
	/^\{\{glyph-color:([a-z]+)\}\}([\s\S]*?)\{\{\/glyph-color\}\}/i;

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		coloredText: {
			setTextColor: (color: EditorTextColor) => ReturnType;
			unsetTextColor: () => ReturnType;
		};
	}
}

function parseGlyphColorSpan(src: string) {
	const match = src.match(GLYPH_COLOR_BRIDGE_RE);
	if (!match) return null;
	const color = (match[1] ?? "").trim().toLowerCase();
	if (!isEditorTextColor(color)) return null;
	return {
		color,
		text: match[2] ?? "",
	};
}

export const ColoredText = MarkExtension.create({
	name: "coloredText",
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
					return element.getAttribute("data-glyph-color")?.trim() ?? null;
				},
				renderHTML: (attributes) => {
					const color = attributes.color;
					if (!color || !isEditorTextColor(color)) return {};
					return {
						"data-glyph-color": color,
						style: getEditorTextColorStyle(color),
					};
				},
			},
		};
	},
	parseHTML() {
		return [
			{
				tag: "span[data-glyph-color]",
				getAttrs: (element) => {
					if (!(element instanceof HTMLElement)) return false;
					const color = element.getAttribute("data-glyph-color")?.trim() ?? "";
					if (!isEditorTextColor(color)) return false;
					return { color };
				},
			},
		];
	},
	renderHTML({ HTMLAttributes }) {
		return ["span", mergeAttributes(HTMLAttributes), 0];
	},
	renderMarkdown(node, helpers) {
		const color = node.attrs?.color;
		if (!isEditorTextColor(color)) {
			return helpers.renderChildren(node);
		}
		return `${getEditorTextColorBridgeOpenToken(color)}${helpers.renderChildren(node)}${EDITOR_TEXT_COLOR_BRIDGE_CLOSE_TOKEN}`;
	},
	parseMarkdown(token, helpers) {
		const parsed = parseGlyphColorSpan(
			(token.raw ?? token.text ?? "").toString(),
		);
		if (!parsed) {
			return helpers.createTextNode((token.text ?? token.raw ?? "").toString());
		}
		return helpers.applyMark(
			"coloredText",
			helpers.parseInline(token.tokens ?? []),
			{ color: parsed.color },
		);
	},
	markdownTokenizer: {
		name: "coloredText",
		level: "inline",
		start(src: string) {
			return src.indexOf("{{glyph-color:");
		},
		tokenize(src, _tokens, helper) {
			const match = src.match(GLYPH_COLOR_BRIDGE_RE);
			if (!match) return undefined;
			const color = (match[1] ?? "").trim().toLowerCase();
			if (!isEditorTextColor(color)) return undefined;
			const raw = match[0];
			const text = match[2] ?? "";
			return {
				type: "coloredText",
				raw,
				text,
				tokens: helper.inlineTokens(text),
			};
		},
	},
	addCommands() {
		return {
			setTextColor:
				(color: EditorTextColor) =>
				({ chain, editor }) => {
					if (editor.isActive("code") || editor.isActive("codeBlock")) {
						return false;
					}
					return chain().setMark(this.name, { color }).run();
				},
			unsetTextColor:
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
