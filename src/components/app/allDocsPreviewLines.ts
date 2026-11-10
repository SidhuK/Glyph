import { normalizeInlineMarkdown } from "../../lib/markdownUtils";

type PreviewLineKind = "heading" | "quote" | "list" | "code" | "body";

export type PreviewLine = {
	key: string;
	kind: PreviewLineKind;
	text: string;
};

const TABLE_SEPARATOR_ROW = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?$/;
const HORIZONTAL_RULE = /^(?:[-*_]\s*){3,}$/;
const STANDALONE_HTML_TAG = /^<\/?[a-z][\w-]*(?:\s[^>]*)?\/?>$/i;
const CALLOUT_MARKER = /^\[![\w-]+\][+-]?\s*/;
const MARKDOWN_ESCAPE = /\\([\\`*_{}[\]()#+\-.!|<>~])/g;

function plainText(markdown: string): string {
	return normalizeInlineMarkdown(markdown.replace(MARKDOWN_ESCAPE, "$1"));
}

const TEMPLATE_PLACEHOLDER = /\{\{[^}]*\}\}/g;
const NON_WORD = /[\p{Extended_Pictographic}\p{P}\p{S}\p{M}\p{Cf}\s]+/gu;

/** Lowercase words only: no emoji (or their joiners and selectors), `{{…}}` placeholders,
    punctuation or extra spaces. */
function comparableText(text: string): string {
	return text.replace(TEMPLATE_PLACEHOLDER, " ").replace(NON_WORD, " ").trim().toLowerCase();
}

export function titleFromPath(notePath: string): string {
	const fileName = notePath.split("/").pop() ?? notePath;
	return fileName.replace(/\.md$/i, "");
}

/** A frontmatter title wins; a title that is only the file name gives way to a leading H1,
    which keeps characters the file name had to sanitise. */
export function noteDisplayTitle(note: { note_path: string; title: string; preview: string }) {
	const indexedTitle = note.title.trim();
	const fileTitle = titleFromPath(note.note_path);
	if (indexedTitle && indexedTitle !== fileTitle) return indexedTitle;
	const heading = note.preview
		.trimStart()
		.split("\n", 1)[0]
		?.match(/^#\s+(.+)$/)?.[1];
	return (heading && plainText(heading)) || indexedTitle || fileTitle;
}

function pushPreviewLine(parsed: PreviewLine[], kind: PreviewLineKind, markdown: string) {
	const text = plainText(markdown);
	if (text) parsed.push({ key: `${kind}:${parsed.length}:${text}`, kind, text });
}

/** Turns a raw markdown excerpt into plain-text preview lines for note cards. */
export function previewLines(preview: string, title: string): PreviewLine[] {
	const lines = preview.replace(/\r\n?/g, "\n").split("\n");
	const parsed: PreviewLine[] = [];
	const comparableTitle = comparableText(plainText(title));
	let inFence = false;
	let inComment = false;

	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		if (inComment) {
			if (line.includes("-->")) inComment = false;
			continue;
		}
		if (line.startsWith("```")) {
			inFence = !inFence;
			continue;
		}
		if (inFence) {
			pushPreviewLine(parsed, "code", line);
			continue;
		}
		if (line.startsWith("<!--")) {
			inComment = !line.includes("-->");
			continue;
		}
		if (STANDALONE_HTML_TAG.test(line) || HORIZONTAL_RULE.test(line)) continue;

		if (line.startsWith("|")) {
			if (TABLE_SEPARATOR_ROW.test(line)) continue;
			const cells = line
				.replace(/^\||\|$/g, "")
				.split("|")
				.map((cell) => cell.trim())
				.filter(Boolean);
			pushPreviewLine(parsed, "body", cells.join(" · "));
			continue;
		}

		const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
		if (headingMatch) {
			pushPreviewLine(parsed, "heading", headingMatch[1] ?? "");
			continue;
		}

		const quoteMatch = line.match(/^>+\s?(.*)$/);
		if (quoteMatch) {
			pushPreviewLine(parsed, "quote", (quoteMatch[1] ?? "").replace(CALLOUT_MARKER, ""));
			continue;
		}

		// Checkbox markers are dropped: a task reads as a plain list line on a calm card.
		const taskMatch = line.match(/^(?:(?:[-*+]|\d+\.)\s+)?\\?\[[ xX/-]\\?\]\s+(.*)$/);
		if (taskMatch) {
			pushPreviewLine(parsed, "list", taskMatch[1] ?? "");
			continue;
		}

		const listMatch = line.match(/^(?:[-*+]|\d+\.)\s+(.*)$/);
		if (listMatch) {
			pushPreviewLine(parsed, "list", listMatch[1] ?? "");
			continue;
		}

		pushPreviewLine(parsed, "body", line);
	}

	if (!comparableTitle) return parsed;
	return parsed.filter((line, index) => {
		const text = comparableText(line.text);
		if (text === comparableTitle) return false;
		// A leading heading that restates the title, longer or cut short, is the title again.
		return !(
			index === 0 &&
			line.kind === "heading" &&
			(text.startsWith(`${comparableTitle} `) || comparableTitle.startsWith(`${text} `))
		);
	});
}
