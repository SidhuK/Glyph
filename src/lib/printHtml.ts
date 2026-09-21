import DOMPurify from "dompurify";
import { Marked } from "marked";
import { preprocessHtmlEmbeds } from "../components/editor/markdown/htmlEmbedMarkdown";
import {
	findWikiLinkSpans,
	parseWikiLink,
	wikiLinksToStandardMarkdown,
} from "../components/editor/markdown/wikiLinkCodec";
import { displayNameFromPath } from "../utils/path";
import {
	type HtmlEmbedKind,
	replaceHtmlEmbedFences,
	stripHtmlEmbedRawSentinel,
	wrapHtmlEmbedBody,
} from "./htmlEmbed";
import { splitYamlFrontmatter } from "./notePreview";
import { invoke, spaceAssetUrl } from "./tauri";

interface BuildPrintHtmlOptions {
	markdown: string;
	notePath: string;
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
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	line-height: 1.62;
	font-size: 16px;
	color: #171717;
	background: #ffffff;
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
.glyph-print-html-embed {
	margin: 0 0 1em;
	padding: 14px 16px;
	border: 1px solid #e5e7eb;
	border-radius: 8px;
	background: #ffffff;
	overflow: auto;
}
.glyph-print-html-embed main svg {
	display: block;
	max-width: 100%;
	height: auto;
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

function sanitizeHtmlEmbedForPrint(source: string, kind: HtmlEmbedKind): string {
	const cleaned = stripHtmlEmbedRawSentinel(source).trim();
	if (!cleaned) return "";

	const body = wrapHtmlEmbedBody(cleaned, kind);
	const sanitized = DOMPurify.sanitize(body, {
		USE_PROFILES: { html: true, svg: true },
		FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "base", "link"],
		FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
		ALLOWED_URI_REGEXP: /^(?:(?:data|blob):|#)/i,
	});
	return `<div class="glyph-print-html-embed" data-kind="${kind}">${sanitized}</div>`;
}

function replaceHtmlEmbedsForPrint(markdown: string): string {
	return replaceHtmlEmbedFences(markdown, (block) =>
		sanitizeHtmlEmbedForPrint(block.body, block.kind),
	);
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function replaceWikiLinksForDocument(markdown: string): string {
	const spans = findWikiLinkSpans(markdown);
	if (spans.length === 0) return markdown;
	let cursor = 0;
	let output = "";
	for (const span of spans) {
		output += markdown.slice(cursor, span.start);
		const link = parseWikiLink(span.raw);
		if (link?.embed) {
			const alt = link.alias?.trim() || displayNameFromPath(link.target);
			output += `<img src="${escapeHtml(link.target)}" alt="${escapeHtml(alt)}" data-wikilink-embed="true">`;
		} else {
			output += wikiLinksToStandardMarkdown(span.raw);
		}
		cursor = span.end;
	}
	return output + markdown.slice(cursor);
}

function parseMarkdownSync(markdown: string): string {
	const rendered = printMarked.parse(markdown, {
		async: false,
		breaks: false,
		gfm: true,
	});
	return typeof rendered === "string" ? rendered : "";
}

export function buildPrintHtml({ markdown, notePath }: BuildPrintHtmlOptions): string {
	const { body: markdownBody } = splitYamlFrontmatter(markdown);
	const preparedMarkdown = replaceHtmlEmbedsForPrint(
		replaceWikiLinksForDocument(preprocessHtmlEmbeds(markdownBody)),
	);
	const rendered = parseMarkdownSync(preparedMarkdown);
	let body = DOMPurify.sanitize(rendered, {
		ADD_ATTR: ["class", "checked", "data-wikilink-embed"],
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
<title>${escapeHtml(title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
<main class="glyph-print">
${body}
</main>
</body>
</html>
`;
}

function isRemoteOrEmbeddedImage(src: string): boolean {
	return /^(?:https?:|data:|blob:|glyphasset:|\/\/)/i.test(src);
}

export async function resolveDocumentImages(
	html: string,
	notePath: string,
	spacePath: string,
): Promise<string> {
	const document = new DOMParser().parseFromString(html, "text/html");
	const localImages = Array.from(document.querySelectorAll("img[src]")).filter((image) => {
		const src = image.getAttribute("src")?.trim() ?? "";
		return src.length > 0 && !isRemoteOrEmbeddedImage(src);
	});
	if (localImages.length === 0) return html;

	const paths = await invoke("space_resolve_image_sources_batch", {
		expectedSpacePath: spacePath,
		sourcePath: notePath,
		sources: localImages.map((image) => ({
			href: image.getAttribute("src")?.trim() ?? "",
			wikiEmbed: image.getAttribute("data-wikilink-embed") === "true",
		})),
	});
	for (const [index, image] of localImages.entries()) {
		const relPath = paths[index];
		if (!relPath) continue;
		image.setAttribute("src", spaceAssetUrl(relPath));
		image.setAttribute("data-glyph-export-path", relPath);
	}
	return `<!doctype html>\n${document.documentElement.outerHTML}`;
}
