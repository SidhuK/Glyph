import { Fragment, type ReactNode } from "react";

const SNIPPET_ESCAPE = "\u001b";
const SNIPPET_HIGHLIGHT_START = "\u001c";
const SNIPPET_HIGHLIGHT_END = "\u001d";

/**
 * Body snippets arrive as raw markdown flattened onto one line, so block markers sit
 * mid-string. These rules drop the syntax and keep the words; list items read as "a · b".
 */
const MARKDOWN_SNIPPET_RULES: readonly (readonly [RegExp, string])[] = [
	[/!?\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1"],
	[/!?\[\[|\]\]/g, ""],
	[/!?\[([^\]]*)\]\([^)]*\)/g, "$1"],
	[/\[![\w-]+\][+-]?/g, ""],
	[/(^|[\s…])(?:[-*+]\s+)?\[[ xX]\](?=\s|$)/g, "$1·"],
	[/(^|[\s…])#{1,6}(?=\s|$)/g, "$1·"],
	[/(^|[\s…])>(?=\s|$)/g, "$1"],
	[/\|?(?:\s*:?-{3,}:?\s*\|)+(?:\s*:?-{3,}:?)?/g, " "],
	[/(^|[\s…])(?:-{3,}|\*{3,}|_{3,})(?=\s|$)/g, "$1"],
	[/(^|\s)\|(?=\s|$)/g, "$1"],
	[/^(…?\s*)[-*+](?=\s)/, "$1"],
	[/(\s)[-*+](?=\s)/g, "$1·"],
	[/\*\*|__|~~|==|`/g, ""],
	[/(^|[\s(])[*_](?=[^\s*_])/g, "$1"],
	[/([^\s*_])[*_](?=$|[\s).,;:!?])/g, "$1"],
	[/\s{2,}/g, " "],
	[/·(?:\s*·)+/g, "·"],
	[/^(…?)\s*(?:·\s*)?/, "$1"],
	[/\s*·\s*$/, ""],
];

export function stripSnippetMarkdown(snippet: string): string {
	return MARKDOWN_SNIPPET_RULES.reduce(
		(text, [pattern, replacement]) => text.replace(pattern, replacement),
		snippet,
	).trim();
}

/** Renders a backend snippet: escapes are unwrapped and the matched span is marked. */
export function PaletteSnippet({ snippet }: { snippet: string }) {
	const source = stripSnippetMarkdown(snippet);
	const output: ReactNode[] = [];
	let highlighted = false;
	let text = "";
	const pushText = (index: number) => {
		if (!text) return;
		output.push(
			<Fragment key={`${index}:${text.slice(0, 8)}`}>
				{highlighted ? <mark>{text}</mark> : text}
			</Fragment>,
		);
		text = "";
	};
	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		const next = source[index + 1];
		if (char === SNIPPET_ESCAPE && next) {
			text += next;
			index += 1;
		} else if (char === SNIPPET_HIGHLIGHT_START) {
			pushText(index);
			highlighted = true;
		} else if (char === SNIPPET_HIGHLIGHT_END) {
			pushText(index);
			highlighted = false;
		} else {
			text += char;
		}
	}
	pushText(source.length);
	return <>{output}</>;
}
