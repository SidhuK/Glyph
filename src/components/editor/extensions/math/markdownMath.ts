import { InputRule, type MarkdownToken, mergeAttributes } from "@tiptap/core";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
	GLYPH_KATEX_OPTIONS,
	type MathEditRequest,
	blockMathMarkdown,
	inlineDisplayMathMarkdown,
	inlineMathMarkdown,
	matchBlockMath,
	matchInlineDisplayMath,
	matchInlineMath,
} from "./mathOptions";

interface CreateGlyphMathExtensionsOptions {
	onEditRequest: (request: MathEditRequest) => void;
}

function latexFromToken(token: MarkdownToken): string {
	const value = "latex" in token ? token.latex : undefined;
	return typeof value === "string" ? value : "";
}

function displayFromToken(token: MarkdownToken): boolean {
	const value = "display" in token ? token.display : undefined;
	return value === true;
}

export function createGlyphMathExtensions({
	onEditRequest,
}: CreateGlyphMathExtensionsOptions) {
	const GlyphInlineMath = InlineMath.extend({
		addAttributes() {
			return {
				latex: {
					default: "",
					parseHTML: (element) => element.getAttribute("data-latex"),
					renderHTML: (attributes) => ({
						"data-latex": attributes.latex,
					}),
				},
				display: {
					default: false,
					parseHTML: (element) =>
						element.getAttribute("data-type") === "block-math",
					renderHTML: () => ({}),
				},
			};
		},
		parseHTML() {
			return [
				{ tag: 'span[data-type="inline-math"]' },
				{ tag: 'span[data-type="block-math"]' },
			];
		},
		renderHTML({ node, HTMLAttributes }) {
			return [
				"span",
				mergeAttributes(HTMLAttributes, {
					"data-type": node.attrs.display ? "block-math" : "inline-math",
				}),
			];
		},
		parseMarkdown(token) {
			return {
				type: "inlineMath",
				attrs: {
					display: displayFromToken(token),
					latex: latexFromToken(token),
				},
			};
		},
		renderMarkdown(node) {
			const latex = String(node.attrs?.latex ?? "");
			return node.attrs?.display
				? inlineDisplayMathMarkdown(latex)
				: inlineMathMarkdown(latex);
		},
		markdownTokenizer: {
			name: "inlineMath",
			level: "inline",
			start: (source: string) => source.search(/(?<!\\)\$/),
			tokenize: (source: string) => {
				const displayMatch = matchInlineDisplayMath(source);
				if (displayMatch) {
					return {
						type: "inlineMath",
						raw: displayMatch[0],
						latex: (displayMatch[1] ?? "").trim(),
						display: true,
					};
				}
				const match = matchInlineMath(source);
				if (!match) return undefined;
				return {
					type: "inlineMath",
					raw: match[0],
					latex: match[1] ?? "",
				};
			},
		},
		addNodeView() {
			const { katexOptions } = this.options;
			return ({ node, getPos }) => {
				const wrapper = document.createElement("span");
				wrapper.className = "tiptap-mathematics-render";
				if (this.editor.isEditable) {
					wrapper.classList.add("tiptap-mathematics-render--editable");
				}
				const display = node.attrs.display === true;
				const errorClass = display ? "block-math-error" : "inline-math-error";
				wrapper.dataset.type = display ? "block-math" : "inline-math";
				wrapper.setAttribute("data-latex", String(node.attrs.latex));

				const renderMath = () => {
					try {
						katex.render(String(node.attrs.latex), wrapper, {
							...katexOptions,
							displayMode: display,
						});
						wrapper.classList.remove(errorClass);
					} catch {
						wrapper.textContent = String(node.attrs.latex);
						wrapper.classList.add(errorClass);
					}
				};
				const handleClick = (event: Event) => {
					event.preventDefault();
					event.stopPropagation();
					const pos = getPos();
					if (pos === undefined) return;
					onEditRequest({
						kind: display ? "block" : "inline",
						latex: String(node.attrs.latex),
						pos,
					});
				};

				wrapper.addEventListener("click", handleClick);
				renderMath();
				return {
					dom: wrapper,
					destroy: () => wrapper.removeEventListener("click", handleClick),
				};
			};
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
