import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { splitYamlFrontmatter } from "../../../lib/notePreview";
import { resolveAnchorHeading } from "./headingAnchor";

/** Trailing block pin, e.g. `Paragraph text ^abc12`. */
export const BLOCK_ID_PATTERN = /(?:^|\s)(\^[A-Za-z0-9-]+)(?=\s*$)/;

const BLOCK_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const BLOCK_ID_LENGTH = 6;
const HEADING_LINE_PATTERN = /^(#{1,6})[\t ]+(.+?)[\t ]*#*[\t ]*$/;
const FENCE_PATTERN = /^\s*(`{3,}|~{3,})/;

export function parseTrailingBlockId(line: string): string | null {
	const match = line.match(BLOCK_ID_PATTERN);
	const token = match?.[1];
	if (!token || token.length < 2) return null;
	return token.slice(1);
}

function eachMarkdownLine(
	markdown: string,
	visit: (line: string, lineStart: number) => boolean | undefined,
): void {
	let lineStart = 0;
	while (lineStart <= markdown.length) {
		const lineEnd = markdown.indexOf("\n", lineStart);
		const end = lineEnd === -1 ? markdown.length : lineEnd;
		const line = markdown.slice(lineStart, end).replace(/\r$/, "");
		if (visit(line, lineStart) === false) return;
		if (lineEnd === -1) break;
		lineStart = lineEnd + 1;
	}
}

export function findBlockIdOffset(
	markdown: string,
	blockId: string,
): number | null {
	const needle = blockId.trim();
	if (!needle) return null;
	let found: number | null = null;
	eachMarkdownLine(markdown, (line, lineStart) => {
		if (parseTrailingBlockId(line) !== needle) return;
		found = lineStart;
		return false;
	});
	return found;
}

export function collectBlockIdsFromDoc(doc: ProseMirrorNode): Set<string> {
	const ids = new Set<string>();
	doc.descendants((node) => {
		if (!node.isTextblock) return;
		const id = parseTrailingBlockId(node.textContent ?? "");
		if (id) ids.add(id);
	});
	return ids;
}

export function collectBlockIds(markdown: string): Set<string> {
	const ids = new Set<string>();
	eachMarkdownLine(markdown, (line) => {
		const id = parseTrailingBlockId(line);
		if (id) ids.add(id);
	});
	return ids;
}

export function generateBlockId(existing: ReadonlySet<string>): string {
	for (let attempt = 0; attempt < 32; attempt += 1) {
		let id = "";
		const bytes = crypto.getRandomValues(new Uint8Array(BLOCK_ID_LENGTH));
		for (const byte of bytes) {
			id += BLOCK_ID_ALPHABET[byte % BLOCK_ID_ALPHABET.length];
		}
		if (!existing.has(id)) return id;
	}
	return Date.now().toString(36);
}

export function ensureTrailingBlockId(
	line: string,
	existing: ReadonlySet<string>,
): { id: string; line: string } {
	const current = parseTrailingBlockId(line);
	if (current) return { id: current, line };
	const id = generateBlockId(existing);
	const trimmed = line.replace(/\s+$/, "");
	const next = trimmed.length > 0 ? `${trimmed} ^${id}` : `^${id}`;
	return { id, line: next };
}

function headingsInMarkdown(markdown: string) {
	const headings: Array<{
		id: string;
		level: number;
		text: string;
		pos: number;
	}> = [];
	let fenceMarker: string | null = null;
	eachMarkdownLine(markdown, (line, lineStart) => {
		const fenceMatch = line.match(FENCE_PATTERN);
		if (fenceMatch?.[1]) {
			const marker = fenceMatch[1];
			if (!fenceMarker) {
				fenceMarker = marker;
			} else if (
				marker[0] === fenceMarker[0] &&
				marker.length >= fenceMarker.length &&
				line.slice(fenceMatch[0].length).trim().length === 0
			) {
				fenceMarker = null;
			}
			return;
		}
		if (fenceMarker) return;
		const headingMatch = line.match(HEADING_LINE_PATTERN);
		const headingText = headingMatch?.[2]?.trim();
		if (!headingMatch?.[1] || !headingText) return;
		headings.push({
			id: `slice-${lineStart}`,
			level: headingMatch[1].length,
			text: headingText,
			pos: lineStart,
		});
	});
	return headings;
}

export function extractHeadingSlice(
	markdown: string,
	anchor: string,
): string | null {
	const headings = headingsInMarkdown(markdown);
	const heading = resolveAnchorHeading(headings, anchor);
	if (!heading) return null;

	const start = heading.pos;
	let end = markdown.length;
	for (const candidate of headings) {
		if (candidate.pos <= start) continue;
		if (candidate.level <= heading.level) {
			end = candidate.pos;
			break;
		}
	}
	const slice = markdown.slice(start, end).trim();
	return slice || null;
}

export function extractBlockSlice(
	markdown: string,
	blockId: string,
): string | null {
	const offset = findBlockIdOffset(markdown, blockId);
	if (offset === null) return null;
	const lineEnd = markdown.indexOf("\n", offset);
	const end = lineEnd === -1 ? markdown.length : lineEnd;
	const line = markdown.slice(offset, end).replace(/\r$/, "");
	const withoutId = line.replace(BLOCK_ID_PATTERN, "").trimEnd();
	return withoutId || line;
}

export function extractNoteBodySlice(markdown: string): string {
	return splitYamlFrontmatter(markdown).body.trim();
}

export function headingTextFromLine(line: string): string | null {
	const match = line.match(HEADING_LINE_PATTERN);
	const text = match?.[2]?.trim();
	return text || null;
}
