import { basename } from "../utils/path";

function titleForFile(relPath: string): string {
	const name = basename(relPath);
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

export function parseNotePreview(
	relPath: string,
	text: string,
): { title: string; content: string } {
	const normalizedText = text.replace(/\r\n/g, "\n");
	// Extract title from frontmatter or first heading
	let title = titleForFile(relPath);
	// Check for YAML frontmatter title
	const frontmatterTitleMatch = normalizedText.match(/^---\n([\s\S]*?)\n---\n?/);
	let titleFoundInFrontmatter = false;
	if (frontmatterTitleMatch?.[1]) {
		for (const line of frontmatterTitleMatch[1].split("\n")) {
			const match = line.match(
				/^\s*title\s*:\s*(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^#\n]+))\s*$/,
			);
			if (!match) continue;
			const raw = match[1] ?? match[2] ?? match[3] ?? "";
			const parsed = raw.trim().replace(/^['"]|['"]$/g, "");
			if (parsed) {
				title = parsed;
				titleFoundInFrontmatter = true;
				break;
			}
		}
	}
	if (!titleFoundInFrontmatter) {
		// Check for first # heading
		const headingMatch = normalizedText.match(/^#\s+(.+)$/m);
		if (headingMatch?.[1]) {
			title = headingMatch[1].trim();
		}
	}
	// Strip frontmatter from content for display
	let content = normalizedText;
	if (normalizedText.startsWith("---\n")) {
		const endIdx = normalizedText.indexOf("\n---\n", 4);
		if (endIdx !== -1) {
			content = normalizedText.slice(endIdx + 5).trim();
		}
	}
	// Limit to first 20 lines for performance
	const lines = content.split("\n", 21);
	if (lines.length > 20) {
		content = `${lines.slice(0, 20).join("\n")}\n…`;
	}
	return { title, content };
}

export function splitYamlFrontmatter(markdown: string): {
	frontmatter: string | null;
	body: string;
} {
	const text = (markdown ?? "").replace(/\r\n?/g, "\n");
	if (!text.startsWith("---\n")) return { frontmatter: null, body: text };
	const endIdx = text.indexOf("\n---\n", 4);
	if (endIdx === -1) return { frontmatter: null, body: text };
	const frontmatter = text.slice(0, endIdx + 5);
	const body = text.slice(endIdx + 5);
	return { frontmatter, body };
}

export function joinYamlFrontmatter(frontmatter: string | null, body: string): string {
	const fm = frontmatter?.trimEnd() ?? "";
	const b = body ?? "";
	if (!fm) return b;
	// Ensure exactly one blank line between frontmatter and body (unless body is empty).
	const normalizedBody = b.length ? b.replace(/^\n+/, "\n") : "";
	return `${fm}\n${normalizedBody}`;
}

const HEADING_LINE = /^#{1,6}\s+/;

function plainMarkdownLine(line: string): string {
	return line
		.replace(HEADING_LINE, "")
		.replace(/^>\s?/, "")
		.replace(/^[-*+]\s+\[[ xX]\]\s+/, "")
		.replace(/^[-*+]\s+/, "")
		.replace(/^\d+\.\s+/, "")
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/[*_`~]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

interface MarkdownPreviewSnippetOptions {
	readonly lineLimit?: number;
	readonly skipHeadings?: boolean;
}

export function markdownPreviewSnippet(
	markdown: string,
	{ lineLimit = 1, skipHeadings = false }: MarkdownPreviewSnippetOptions = {},
): string {
	const { body } = splitYamlFrontmatter(markdown);
	const lines: string[] = [];
	let inFence = false;

	for (const rawLine of body.replace(/\r\n?/g, "\n").split("\n")) {
		const trimmed = rawLine.trim();
		if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
			inFence = !inFence;
			continue;
		}
		if (inFence || !trimmed) continue;
		if (skipHeadings && HEADING_LINE.test(trimmed)) continue;
		const line = plainMarkdownLine(trimmed);
		if (!line) continue;
		lines.push(line);
		if (lines.length >= lineLimit) break;
	}

	return lines.join(" ");
}
