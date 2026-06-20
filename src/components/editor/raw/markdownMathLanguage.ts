import { syntaxTree } from "@codemirror/language";
import type { Diagnostic } from "@codemirror/lint";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { IterMode, parseMixed } from "@lezer/common";
import { tags } from "@lezer/highlight";
import type { MarkdownExtension } from "@lezer/markdown";
import { latexLanguage } from "codemirror-lang-latex";

const DOLLAR = "$".charCodeAt(0);
const BACKSLASH = "\\".charCodeAt(0);

export const markdownMathExtension: MarkdownExtension = {
	defineNodes: [
		{ name: "InlineMath", style: tags.special(tags.string) },
		{ name: "BlockMath", block: true, style: tags.special(tags.string) },
		{ name: "MathMark", style: tags.processingInstruction },
		"MathContent",
	],
	parseInline: [
		{
			name: "InlineMath",
			before: "Escape",
			parse(context, next, pos) {
				if (next !== DOLLAR || context.char(pos + 1) === DOLLAR) return -1;
				if (pos > context.offset && context.char(pos - 1) === BACKSLASH)
					return -1;
				const first = context.char(pos + 1);
				if (first < 0 || /\s/.test(String.fromCharCode(first))) return -1;
				let cursor = pos + 1;
				for (; cursor < context.end; cursor += 1) {
					if (context.char(cursor) !== DOLLAR) continue;
					if (context.char(cursor - 1) === BACKSLASH) continue;
					if (context.char(cursor + 1) === DOLLAR) return -1;
					if (/\s/.test(String.fromCharCode(context.char(cursor - 1)))) {
						return -1;
					}
					if (/^[\d.,]+$/.test(context.slice(pos + 1, cursor))) return -1;
					return context.addElement(
						context.elt("InlineMath", pos, cursor + 1, [
							context.elt("MathMark", pos, pos + 1),
							context.elt("MathContent", pos + 1, cursor),
							context.elt("MathMark", cursor, cursor + 1),
						]),
					);
				}
				return -1;
			},
		},
	],
	parseBlock: [
		{
			name: "BlockMath",
			before: "FencedCode",
			parse(context, line) {
				const opening = line.text.slice(line.pos);
				if (!/^\$\$[\t ]*$/.test(opening)) return false;
				const from = context.lineStart + line.pos;
				const openTo = from + opening.trimEnd().length;
				let contentFrom = openTo;
				let contentTo = openTo;
				let closeFrom = openTo;
				let closeTo = openTo;
				let sawContent = false;
				while (context.nextLine()) {
					const current = line.text.slice(line.pos);
					if (/^\$\$[\t ]*$/.test(current)) {
						closeFrom = context.lineStart + line.pos;
						closeTo = closeFrom + current.trimEnd().length;
						context.nextLine();
						const children = [context.elt("MathMark", from, openTo)];
						if (sawContent) {
							children.push(context.elt("MathContent", contentFrom, contentTo));
						}
						children.push(context.elt("MathMark", closeFrom, closeTo));
						context.addElement(
							context.elt("BlockMath", from, closeTo, children),
						);
						return true;
					}
					const lineFrom = context.lineStart + line.basePos;
					if (!sawContent) contentFrom = lineFrom;
					sawContent = true;
					contentTo = context.lineStart + line.text.length;
				}
				const children = [context.elt("MathMark", from, openTo)];
				if (sawContent) {
					children.push(context.elt("MathContent", contentFrom, contentTo));
				}
				context.addElement(
					context.elt("BlockMath", from, Math.max(openTo, contentTo), children),
				);
				return true;
			},
		},
	],
	wrap: parseMixed((node) =>
		node.type.name === "MathContent"
			? { parser: latexLanguage.parser, bracketed: true }
			: null,
	),
};

export function isPositionInMath(
	state: EditorState,
	position: number,
): boolean {
	let node = syntaxTree(state).resolve(position, -1);
	while (node) {
		if (
			node.name === "MathContent" ||
			node.name === "InlineMath" ||
			node.name === "BlockMath"
		) {
			return true;
		}
		if (!node.parent) return false;
		node = node.parent;
	}
	return false;
}

function validateFormula(source: string, offset: number): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	const braces: number[] = [];
	let consecutiveBackslashes = 0;
	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];
		const isEscaped = consecutiveBackslashes % 2 !== 0;
		if (!isEscaped) {
			if (character === "{") braces.push(index);
			if (character === "}") {
				const opening = braces.pop();
				if (opening === undefined) {
					diagnostics.push({
						from: offset + index,
						to: offset + index + 1,
						severity: "error",
						message: "Unmatched closing brace",
					});
				}
			}
		}
		consecutiveBackslashes =
			character === "\\" ? consecutiveBackslashes + 1 : 0;
	}
	for (const opening of braces) {
		diagnostics.push({
			from: offset + opening,
			to: offset + opening + 1,
			severity: "error",
			message: "Unclosed brace",
		});
	}

	const environments: Array<{ name: string; position: number }> = [];
	for (const match of source.matchAll(/\\(begin|end)\{([A-Za-z0-9*+@-]+)\}/g)) {
		const position = match.index ?? 0;
		const name = match[2] ?? "";
		if (match[1] === "begin") {
			environments.push({ name, position });
			continue;
		}
		const opening = environments.pop();
		if (opening?.name === name) continue;
		if (opening) environments.push(opening);
		diagnostics.push({
			from: offset + position,
			to: offset + position + match[0].length,
			severity: "error",
			message: `Unmatched \\end{${name}}`,
		});
	}
	for (const environment of environments) {
		diagnostics.push({
			from: offset + environment.position,
			to: offset + environment.position + environment.name.length + 8,
			severity: "error",
			message: `Missing \\end{${environment.name}}`,
		});
	}
	return diagnostics;
}

export function embeddedMathLinter(view: EditorView): Diagnostic[] {
	const diagnostics: Diagnostic[] = [];
	syntaxTree(view.state).iterate({
		mode: IterMode.IgnoreMounts,
		enter(node) {
			if (node.name !== "MathContent") return;
			const source = view.state.doc.sliceString(node.from, node.to);
			diagnostics.push(...validateFormula(source, node.from));
		},
	});
	return diagnostics;
}
