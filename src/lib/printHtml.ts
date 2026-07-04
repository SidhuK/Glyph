import DOMPurify from "dompurify";
import { Marked } from "marked";
import { wikiLinksToStandardMarkdown } from "../components/editor/markdown/wikiLinkCodec";
import { displayNameFromPath, parentDir } from "../utils/path";
import { splitYamlFrontmatter } from "./notePreview";

interface BuildPrintHtmlOptions {
	markdown: string;
	notePath: string;
	noteAbsPath: string;
}

const PRINT_CSS = `
:root {
	color-scheme: light;
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	color: #171717;
	background: #ffffff;
}
body {
	margin: 0;
	background: #ffffff;
}
.glyph-print {
	box-sizing: border-box;
	width: min(760px, calc(100vw - 48px));
	margin: 0 auto;
	padding: 48px 0 72px;
	line-height: 1.62;
	font-size: 16px;
}
h1, h2, h3, h4, h5, h6 {
	line-height: 1.2;
	margin: 1.6em 0 0.55em;
}
h1:first-child, h2:first-child, h3:first-child {
	margin-top: 0;
}
p, ul, ol, blockquote, pre, table {
	margin: 0 0 1em;
}
a {
	color: #0f62fe;
	text-decoration-thickness: 0.08em;
	text-underline-offset: 0.16em;
}
img {
	max-width: 100%;
	height: auto;
}
blockquote {
	border-left: 3px solid #d7d7d7;
	padding-left: 1em;
	color: #4b5563;
}
pre {
	overflow: auto;
	padding: 14px 16px;
	border: 1px solid #e5e7eb;
	border-radius: 8px;
	background: #f7f7f8;
}
.glyph-print-fallback {
	white-space: pre-wrap;
}
code {
	font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
	font-size: 0.92em;
}
:not(pre) > code {
	padding: 0.12em 0.34em;
	border-radius: 5px;
	background: #f2f3f5;
}
table {
	width: 100%;
	border-collapse: collapse;
}
th, td {
	border: 1px solid #e5e7eb;
	padding: 8px 10px;
	vertical-align: top;
}
th {
	background: #f8fafc;
	text-align: left;
}
@media print {
	body {
		background: #ffffff;
	}
	.glyph-print {
		width: auto;
		max-width: none;
		padding: 0;
	}
	a {
		color: inherit;
	}
}
`;

const printMarked = new Marked();

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function fileUrlForPath(path: string): string {
	const encoded = path.split("/").map(encodeURIComponent).join("/");
	return `file://${encoded}`;
}

function baseHrefForNote(noteAbsPath: string): string {
	const dir = parentDir(noteAbsPath);
	return `${fileUrlForPath(dir)}/`;
}

function parseMarkdownSync(markdown: string): string {
	const rendered = printMarked.parse(markdown, {
		async: false,
		breaks: false,
		gfm: true,
	});
	return typeof rendered === "string" ? rendered : "";
}

export function buildPrintHtml({
	markdown,
	notePath,
	noteAbsPath,
}: BuildPrintHtmlOptions): string {
	const { body: markdownBody } = splitYamlFrontmatter(markdown);
	const preparedMarkdown = wikiLinksToStandardMarkdown(markdownBody);
	const rendered = parseMarkdownSync(preparedMarkdown);
	let body = DOMPurify.sanitize(rendered, {
		ADD_ATTR: ["class", "checked"],
	});
	if (!body.trim() && preparedMarkdown.trim()) {
		body = `<pre class="glyph-print-fallback">${escapeHtml(preparedMarkdown)}</pre>`;
	}
	const title = displayNameFromPath(notePath).trim() || "Glyph Print";
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="${escapeHtml(baseHrefForNote(noteAbsPath))}">
<title>${escapeHtml(title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<main class="glyph-print">
${body}
</main>
<script>
window.addEventListener("load", () => window.print(), { once: true });
</script>
</body>
</html>
`;
}
