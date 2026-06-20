import { InputRule, type MarkdownToken } from "@tiptap/core";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import {
	GLYPH_KATEX_OPTIONS,
	type MathEditRequest,
	blockMathMarkdown,
	inlineMathMarkdown,
	matchBlockMath,
	matchInlineMath,
} from "./mathOptions";

interface CreateGlyphMathExtensionsOptions {
	onEditRequest: (request: MathEditRequest) => void;
}

function latexFromToken(token: MarkdownToken): string {
	const value = (token as MarkdownToken & { latex?: unknown }).latex;
	return typeof value === "string" ? value : "";
}

export function createGlyphMathExtensions({
	onEditRequest,
}: CreateGlyphMathExtensionsOptions) {
	const GlyphInlineMath = InlineMath.extend({
		parseMarkdown(token) {
			return { type: "inlineMath", attrs: { latex: latexFromToken(token) } };
		},
		renderMarkdown(node) {
			return inlineMathMarkdown(String(node.attrs?.latex ?? ""));
		},
		markdownTokenizer: {
			name: "inlineMath",
			level: "inline",
			start: (source: string) => source.search(/(?<!\\)\$(?!\$)/),
			tokenize: (source: string) => {
				const match = matchInlineMath(source);
				if (!match) return undefined;
				return {
					type: "inlineMath",
					raw: match[0],
					latex: match[1] ?? "",
				};
			},
		},
		addInputRules() {
			return [
				new InputRule({
					find: /(^|[^\\$])(\$(?!\$)(?!\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$)$/,
					handler: ({ state, range, match }) => {
						const latex = match[3] ?? "";
						if (!latex || /^[\d.,]+$/.test(latex)) return;
						const leadingLength = match[1]?.length ?? 0;
						state.tr.replaceWith(
							range.from + leadingLength,
							range.to,
							this.type.create({ latex }),
						);
					},
				}),
			];
		},
	}).configure({
		katexOptions: GLYPH_KATEX_OPTIONS,
		onClick: (node, pos) =>
			onEditRequest({ kind: "inline", latex: String(node.attrs.latex), pos }),
	});

	const GlyphBlockMath = BlockMath.extend({
		parseMarkdown(token) {
			return { type: "blockMath", attrs: { latex: latexFromToken(token) } };
		},
		renderMarkdown(node) {
			return blockMathMarkdown(String(node.attrs?.latex ?? ""));
		},
		markdownTokenizer: {
			name: "blockMath",
			level: "block",
			start: (source: string) => source.search(/^\$\$[\t ]*$/m),
			tokenize: (source: string) => {
				const match = matchBlockMath(source);
				if (!match) return undefined;
				return {
					type: "blockMath",
					raw: match[0],
					latex: match[1] ?? "",
				};
			},
		},
		addInputRules() {
			return [];
		},
	}).configure({
		katexOptions: GLYPH_KATEX_OPTIONS,
		onClick: (node, pos) =>
			onEditRequest({ kind: "block", latex: String(node.attrs.latex), pos }),
	});

	return [GlyphInlineMath, GlyphBlockMath];
}
