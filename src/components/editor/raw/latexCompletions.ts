import {
	type CompletionContext,
	type CompletionSource,
	snippetCompletion,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { latexCompletionSource } from "codemirror-lang-latex";
import { isPositionInMath } from "./markdownMathLanguage";

const latexSource = latexCompletionSource(true);

export const embeddedLatexCompletionSource: CompletionSource = (context) => {
	if (!isPositionInMath(context.state, context.pos)) return null;
	return latexSource(context);
};

function isCodeContext(context: CompletionContext): boolean {
	let node = syntaxTree(context.state).resolveInner(context.pos, -1);
	while (node) {
		if (node.name.includes("Code")) return true;
		if (!node.parent) return false;
		node = node.parent;
	}
	return false;
}

export const latexSnippetCompletionSource: CompletionSource = (context) => {
	if (isPositionInMath(context.state, context.pos) || isCodeContext(context)) {
		return null;
	}
	const match = context.matchBefore(/\/latex\w*/i);
	if (!match) return null;
	return {
		from: match.from,
		options: [
			snippetCompletion("$${}$", {
				label: "/latex inline",
				detail: "Inline equation",
				type: "keyword",
			}),
			snippetCompletion("$$\n\t${}\n$$", {
				label: "/latex display",
				detail: "Display equation",
				type: "keyword",
			}),
		],
	};
};
