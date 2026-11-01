import katex from "katex";
import "katex/dist/katex.min.css";
import type { TokenizerAndRendererExtension } from "marked";
import {
	GLYPH_KATEX_OPTIONS,
	matchBlockMath,
	matchInlineDisplayMath,
	matchInlineMath,
} from "./mathOptions";

// Read-only marked renderers (e.g. AI chat) use these to match the note editor's math syntax.
// Output must still be sanitized; GLYPH_KATEX_OPTIONS keeps `trust: false`.

function renderLatex(latex: string, displayMode: boolean): string {
	return katex.renderToString(latex, { ...GLYPH_KATEX_OPTIONS, displayMode });
}

const inlineMathMarkedExtension: TokenizerAndRendererExtension = {
	name: "inlineMath",
	level: "inline",
	start(src) {
		const index = src.search(/(?<!\\)\$/);
		return index >= 0 ? index : undefined;
	},
	tokenizer(src) {
		const displayMatch = matchInlineDisplayMath(src);
		if (displayMatch) {
			return {
				type: "inlineMath",
				raw: displayMatch[0],
				latex: (displayMatch[1] ?? "").trim(),
				display: true,
			};
		}
		const match = matchInlineMath(src);
		if (!match) return undefined;
		return { type: "inlineMath", raw: match[0], latex: match[1] ?? "", display: false };
	},
	renderer(token) {
		return renderLatex(String(token.latex ?? ""), token.display === true);
	},
};

const blockMathMarkedExtension: TokenizerAndRendererExtension = {
	name: "blockMath",
	level: "block",
	start(src) {
		const index = src.search(/^\$\$[\t ]*$/m);
		return index >= 0 ? index : undefined;
	},
	tokenizer(src) {
		const match = matchBlockMath(src);
		if (!match) return undefined;
		return { type: "blockMath", raw: match[0], latex: match[1] ?? "" };
	},
	renderer(token) {
		return `${renderLatex(String(token.latex ?? ""), true)}\n`;
	},
};

export const mathMarkedExtensions = [blockMathMarkedExtension, inlineMathMarkedExtension];
