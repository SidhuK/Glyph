import type { Editor, JSONContent } from "@tiptap/core";
import { postprocessMarkdownFromEditor } from "./markdown/wikiLinkMarkdownBridge";

interface ExtractSelectionDraft {
	markdown: string;
	range: { from: number; to: number };
	suggestedTitle: string;
	text: string;
}

export interface ExtractToNoteDialogState extends ExtractSelectionDraft {
	destinationDir: string;
	loading: boolean;
	title: string;
}

const FALLBACK_TITLE = "Untitled";
const MAX_TITLE_LENGTH = 80;
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const MARKDOWN_LINK_RE = /(!?)\[([^\]\n]*)\]\(([^)\n]+)\)/g;

function normalizeRelPath(path: string): string {
	return path
		.trim()
		.replace(/\u200b/g, "")
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

function parentDir(relPath: string): string {
	const normalized = normalizeRelPath(relPath);
	const idx = normalized.lastIndexOf("/");
	return idx === -1 ? "" : normalized.slice(0, idx);
}

function normalizeSegments(path: string): string {
	const out: string[] = [];
	for (const part of path.replace(/\\/g, "/").split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") {
			out.pop();
			continue;
		}
		out.push(part);
	}
	return out.join("/");
}

function relativePath(fromDir: string, toPath: string): string {
	const from = normalizeRelPath(fromDir).split("/").filter(Boolean);
	const to = normalizeRelPath(toPath).split("/").filter(Boolean);
	let index = 0;
	while (
		index < from.length &&
		index < to.length &&
		from[index] === to[index]
	) {
		index += 1;
	}
	const parts = [
		...Array.from({ length: from.length - index }, () => ".."),
		...to.slice(index),
	];
	return parts.join("/") || to[to.length - 1] || "";
}

function stripInlineMarkdown(value: string): string {
	return value
		.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, "$1")
		.replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, "$1")
		.replace(
			/!?\[\[([^\]\n|#]+)(?:#[^\]\n|]+)?(?:\|([^\]\n]+))?\]\]/g,
			(_match, target: string, alias: string | undefined) => alias ?? target,
		)
		.replace(/`([^`\n]+)`/g, "$1")
		.replace(/[*_~>#-]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function truncateTitle(value: string): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	if (normalized.length <= MAX_TITLE_LENGTH) return normalized;
	return normalized.slice(0, MAX_TITLE_LENGTH).trim();
}

function suggestExtractedNoteTitle(markdown: string, text: string): string {
	const heading = markdown.match(/^#{1,6}\s+(.+)$/m)?.[1];
	if (heading) {
		const title = truncateTitle(stripInlineMarkdown(heading));
		if (title) return title;
	}

	for (const line of markdown.split("\n")) {
		const title = truncateTitle(stripInlineMarkdown(line));
		if (title) return title;
	}

	const fallback = truncateTitle(stripInlineMarkdown(text));
	return fallback || FALLBACK_TITLE;
}

export function sanitizeExtractedNoteTitle(title: string): string {
	const sanitized = title
		.replace(INVALID_FILENAME_CHARS, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/\.+$/g, "");
	return sanitized || FALLBACK_TITLE;
}

export function uniqueExtractedNoteTitle(
	title: string,
	siblingNames: Iterable<string>,
): string {
	const base = sanitizeExtractedNoteTitle(title);
	const unavailable = new Set(
		Array.from(siblingNames, (name) => name.toLowerCase()),
	);
	if (!unavailable.has(`${base}.md`.toLowerCase())) return base;
	let index = 2;
	while (unavailable.has(`${base} ${index}.md`.toLowerCase())) {
		index += 1;
	}
	return `${base} ${index}`;
}

export function buildExtractedNotePath(title: string, destinationDir: string) {
	const safeTitle = sanitizeExtractedNoteTitle(title);
	const dir = normalizeRelPath(destinationDir);
	return dir ? `${dir}/${safeTitle}.md` : `${safeTitle}.md`;
}

function splitDestination(raw: string): {
	destination: string;
	suffix: string;
	wrapper: "<" | "";
} {
	const trimmed = raw.trim();
	const wrapper = trimmed.startsWith("<") && trimmed.includes(">") ? "<" : "";
	const wrappedEnd = wrapper ? trimmed.indexOf(">") : -1;
	const rawValue = wrapper ? trimmed.slice(1, wrappedEnd) : trimmed;
	const wrapperSuffix = wrapper ? trimmed.slice(wrappedEnd + 1) : "";
	const titleMatch = wrapper ? null : rawValue.match(/^(\S+)(\s+["'][\s\S]*)$/);
	const value = titleMatch ? (titleMatch[1] ?? "") : rawValue;
	const titleSuffix = titleMatch ? (titleMatch[2] ?? "") : "";
	const baseSuffix = `${titleSuffix}${wrapperSuffix}`;
	const hashIndex = value.indexOf("#");
	if (hashIndex === -1)
		return { destination: value, suffix: baseSuffix, wrapper };
	return {
		destination: value.slice(0, hashIndex),
		suffix: `${value.slice(hashIndex)}${baseSuffix}`,
		wrapper,
	};
}

function isRewritableDestination(destination: string): boolean {
	const lower = destination.trim().toLowerCase();
	return (
		Boolean(lower) &&
		!lower.startsWith("#") &&
		!lower.startsWith("http://") &&
		!lower.startsWith("https://") &&
		!lower.startsWith("mailto:") &&
		!lower.startsWith("tel:") &&
		!lower.startsWith("data:")
	);
}

function decodeDestination(destination: string): string {
	try {
		return decodeURI(destination);
	} catch {
		return destination;
	}
}

function encodeDestination(destination: string): string {
	try {
		return encodeURI(destination);
	} catch {
		return destination;
	}
}

export function rewriteRelativeMarkdownLinks(
	markdown: string,
	sourcePath: string,
	destinationDir: string,
): string {
	const sourceDir = parentDir(sourcePath);
	const nextDir = normalizeRelPath(destinationDir);
	if (sourceDir === nextDir) return markdown;

	return markdown.replace(
		MARKDOWN_LINK_RE,
		(match, embed: string, label: string, rawDestination: string) => {
			const { destination, suffix, wrapper } = splitDestination(rawDestination);
			if (!isRewritableDestination(destination)) return match;
			const decoded = decodeDestination(destination);
			const absoluteTarget = decoded.startsWith("/")
				? normalizeSegments(decoded)
				: normalizeSegments(`${sourceDir}/${decoded}`);
			const nextDestination = encodeDestination(
				relativePath(nextDir, absoluteTarget),
			);
			const wrappedDestination =
				wrapper === "<" ? `<${nextDestination}>` : nextDestination;
			return `${embed}[${label}](${wrappedDestination}${suffix})`;
		},
	);
}

function normalizeSelectedMarkdown(markdown: string): string {
	return postprocessMarkdownFromEditor(markdown)
		.replace(/^\n+/, "")
		.replace(/\n+$/, "");
}

export function buildExtractSelectionDraft(
	editor: Editor,
): ExtractSelectionDraft | null {
	if (!editor.markdown) return null;
	const { selection } = editor.state;
	if (selection.empty) return null;
	const slice = selection.content();
	const content = slice.content.toJSON() as JSONContent[] | null;
	if (!content?.length) return null;
	const rawMarkdown = editor.markdown.serialize(content);
	const markdown = normalizeSelectedMarkdown(rawMarkdown);
	const text = slice.content.textBetween(0, slice.content.size, "\n").trim();
	if (!markdown.trim() && !text) return null;
	return {
		markdown,
		range: { from: selection.from, to: selection.to },
		suggestedTitle: suggestExtractedNoteTitle(markdown, text),
		text,
	};
}
