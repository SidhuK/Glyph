import {
	createMarkdownFenceTracker,
	isInsideMarkdownCodeFence,
	maskInlineCode,
	updateMarkdownFenceTracker,
} from "./markdownFence";

const ESCAPED_LIST_TASK_MARKER_RE =
	/^([ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)\\\[(\\[\\`*_[\]~]|[^\\\]\n])\\\](?=[ \t]|$)/u;
const ESCAPED_TASK_FIELD_RE =
	/(?<![\\\w])\\\[([A-Za-z](?:[A-Za-z0-9-]|\\_)*)::((?:\[\[[^[\]\n]+\]\]|\\[^[\]\n]|[^\\[\]\n])*?)\\\](?!\()/gu;
const ESCAPED_UNDERSCORE_RE = /\\_/g;
const ESCAPED_CHAR_RE = /^\\(.)$/u;

function unescapeStatusChar(char: string): string {
	return char.replace(ESCAPED_CHAR_RE, "$1");
}

function restoreListTaskMarker(line: string): string {
	return line.replace(
		ESCAPED_LIST_TASK_MARKER_RE,
		(_match, prefix: string, status: string) => `${prefix}[${unescapeStatusChar(status)}]`,
	);
}

function restoreTaskFields(line: string): string {
	const masked = maskInlineCode(line);
	let output = "";
	let cursor = 0;
	for (const match of masked.matchAll(ESCAPED_TASK_FIELD_RE)) {
		const start = match.index;
		const end = start + match[0].length;
		const key = match[1].replace(ESCAPED_UNDERSCORE_RE, "_");
		const value = line.slice(start + 2 + match[1].length + 2, end - 2);
		output += `${line.slice(cursor, start)}[${key}::${value}]`;
		cursor = end;
	}
	return output + line.slice(cursor);
}

export function restoreEscapedTaskSyntax(markdown: string): string {
	if (!markdown.includes("\\[")) return markdown;
	const tracker = createMarkdownFenceTracker();
	return markdown
		.split("\n")
		.map((line) => {
			if (updateMarkdownFenceTracker(line, tracker)) return line;
			if (isInsideMarkdownCodeFence(tracker)) return line;
			return restoreTaskFields(restoreListTaskMarker(line));
		})
		.join("\n");
}
