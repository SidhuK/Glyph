import type { KatexOptions } from "katex";

export type MathKind = "inline" | "block";

export interface MathEditRequest {
	kind: MathKind;
	latex: string;
	pos: number;
}

export const INLINE_MATH_STARTER = "x";
export const BLOCK_MATH_STARTER = String.raw`\begin{aligned}
  a &= b + c
\end{aligned}`;

const ESCAPED_DOLLAR_PLACEHOLDER = "\uE000";
const LITERAL_PLACEHOLDER_ESCAPE = "\uE001";
const LITERAL_ESCAPE_ESCAPE = "\uE002";

/** Swap escaped dollar signs for a placeholder before math parsing. */
export function preprocessEscapedDollars(markdown: string): string {
	return markdown
		.replace(/\uE001/g, LITERAL_ESCAPE_ESCAPE)
		.replace(/\uE000/g, LITERAL_PLACEHOLDER_ESCAPE)
		.replace(/\\\$/g, ESCAPED_DOLLAR_PLACEHOLDER);
}

/** Restore escaped dollar signs after math parsing. */
export function postprocessEscapedDollars(markdown: string): string {
	return markdown
		.replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, "g"), String.raw`\$`)
		.replace(/\uE001/g, "\uE000")
		.replace(/\uE002/g, "\uE001");
}

export const GLYPH_KATEX_OPTIONS = {
	maxExpand: 1000,
	maxSize: 20,
	output: "htmlAndMathml",
	strict: "warn",
	throwOnError: false,
	trust: false,
} as const satisfies KatexOptions;

// TipTap math attributes may contain soft line breaks. They remain inline
// Markdown until a blank line, so retain them across Edit -> Raw -> Edit.
const INLINE_MATH_RE = /^\$(?!\$)(?!\s)((?:\\.|[^$\\])+?)(?<!\s)\$(?!\$)/;
const BLOCK_MATH_RE = /^\$\$[\t ]*\n([\s\S]*?)\n\$\$(?:[\t ]*(?:\n|$))/;

export function matchInlineMath(source: string): RegExpMatchArray | null {
	const match = source.match(INLINE_MATH_RE);
	if (!match) return null;
	const latex = match[1] ?? "";
	if (/^[\d.,]+$/.test(latex)) return null;
	return match;
}

export function matchBlockMath(source: string): RegExpMatchArray | null {
	return source.match(BLOCK_MATH_RE);
}

export function inlineMathMarkdown(latex: string): string {
	return `$${latex}$`;
}

export function blockMathMarkdown(latex: string): string {
	return `$$\n${latex}\n$$`;
}
