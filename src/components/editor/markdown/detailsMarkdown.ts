const DETAILS_BLOCK_END_RE = /^:::\s*$/;
const DETAILS_SUMMARY_START_RE = /^:::detailsSummary\s*$/;
const DETAILS_CONTENT_START_RE = /^:::detailsContent\s*$/;
const DETAILS_TAG_RE = /<\/?details\b[^>]*>/gi;

function escapeHtmlText(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function htmlFragmentToPlainText(html: string): string {
	if (!html.trim() || typeof DOMParser === "undefined") return html.trim();
	const doc = new DOMParser().parseFromString(
		`<div>${html}</div>`,
		"text/html",
	);
	return doc.body.textContent?.trim() ?? html.trim();
}

function nextNonBlankLine(lines: string[], startIndex: number): string | null {
	let index = startIndex;
	while (index < lines.length) {
		const line = lines[index] ?? "";
		if (line.trim() !== "") return line;
		index += 1;
	}
	return null;
}

function isDetailsSectionEnd(
	lines: string[],
	index: number,
	section: "summary" | "content",
): boolean {
	if (!DETAILS_BLOCK_END_RE.test(lines[index] ?? "")) return false;
	const next = nextNonBlankLine(lines, index + 1);
	if (section === "summary") {
		return next === null || DETAILS_CONTENT_START_RE.test(next);
	}
	return (
		next === null ||
		DETAILS_BLOCK_END_RE.test(next) ||
		/^:::details(?:\s+\{open\})?\s*$/.test(next)
	);
}

function readFencedSection(
	lines: string[],
	startIndex: number,
	section: "summary" | "content",
): { content: string; endIndex: number } {
	const contentLines: string[] = [];
	let index = startIndex + 1;

	while (index < lines.length) {
		if (isDetailsSectionEnd(lines, index, section)) {
			return { content: contentLines.join("\n").trim(), endIndex: index };
		}
		contentLines.push(lines[index] ?? "");
		index += 1;
	}

	return { content: contentLines.join("\n").trim(), endIndex: index };
}

function isMarkdownCodeFenceToggle(line: string): boolean {
	return /^(`{3,}|~{3,})/.test(line.trim());
}

function detailsFencesToHtml(
	isOpen: boolean,
	summary: string,
	content: string,
) {
	const openAttr = isOpen ? " open" : "";
	const blocks = [
		`<details${openAttr}>`,
		`<summary>${escapeHtmlText(summary)}</summary>`,
	];
	if (content) blocks.push("", content);
	blocks.push("", "</details>");
	return blocks.join("\n");
}

function detailsInnerHtmlToFences(isOpen: boolean, inner: string): string {
	const summaryMatch = inner.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
	const summary = htmlFragmentToPlainText(summaryMatch?.[1] ?? "");
	const content = inner
		.replace(/<summary[^>]*>[\s\S]*?<\/summary>/i, "")
		.trim();
	const openLine = isOpen ? ":::details {open}" : ":::details";
	return [
		openLine,
		"",
		":::detailsSummary",
		"",
		summary,
		"",
		":::",
		"",
		":::detailsContent",
		"",
		content,
		"",
		":::",
		"",
		":::",
	].join("\n");
}

function findTopLevelDetailsBlocks(input: string) {
	const blocks: Array<{
		start: number;
		end: number;
		isOpen: boolean;
		inner: string;
	}> = [];
	let depth = 0;
	let openStart = -1;
	let openHasOpenAttr = false;
	DETAILS_TAG_RE.lastIndex = 0;
	let match = DETAILS_TAG_RE.exec(input);
	while (match !== null) {
		const isClose = match[0].startsWith("</");
		if (!isClose) {
			if (depth === 0) {
				openStart = match.index;
				openHasOpenAttr = /\bopen\b/i.test(match[0]);
			}
			depth += 1;
			match = DETAILS_TAG_RE.exec(input);
			continue;
		}

		depth -= 1;
		if (depth !== 0 || openStart === -1) {
			match = DETAILS_TAG_RE.exec(input);
			continue;
		}

		const openTagEnd = input.indexOf(">", openStart);
		if (openTagEnd === -1) {
			match = DETAILS_TAG_RE.exec(input);
			continue;
		}

		blocks.push({
			start: openStart,
			end: match.index + match[0].length,
			isOpen: openHasOpenAttr,
			inner: input.slice(openTagEnd + 1, match.index),
		});
		openStart = -1;
		match = DETAILS_TAG_RE.exec(input);
	}

	return blocks;
}

function postprocessDetailsFences(input: string): string {
	const lines = input.split("\n");
	const output: string[] = [];
	let index = 0;
	let inCodeFence = false;

	while (index < lines.length) {
		const line = lines[index] ?? "";
		if (isMarkdownCodeFenceToggle(line)) {
			inCodeFence = !inCodeFence;
			output.push(line);
			index += 1;
			continue;
		}

		if (inCodeFence || !/^:::details(?:\s+\{open\})?\s*$/.test(line)) {
			output.push(line);
			index += 1;
			continue;
		}

		const isOpen = /\{open\}/.test(line);
		let summary = "";
		let content = "";
		index += 1;

		while (index < lines.length) {
			const sectionLine = lines[index] ?? "";
			if (DETAILS_BLOCK_END_RE.test(sectionLine)) {
				const next = nextNonBlankLine(lines, index + 1);
				if (
					next === null ||
					DETAILS_BLOCK_END_RE.test(next) ||
					/^:::details(?:\s+\{open\})?\s*$/.test(next)
				) {
					index += 1;
					break;
				}
			}
			if (DETAILS_SUMMARY_START_RE.test(sectionLine)) {
				const section = readFencedSection(lines, index, "summary");
				summary = section.content;
				index = section.endIndex + 1;
				continue;
			}
			if (DETAILS_CONTENT_START_RE.test(sectionLine)) {
				const section = readFencedSection(lines, index, "content");
				content = section.content;
				index = section.endIndex + 1;
				continue;
			}
			index += 1;
		}

		output.push(detailsFencesToHtml(isOpen, summary, content));
	}

	return output.join("\n");
}

function preprocessHtmlDetails(input: string): string {
	if (!/<details\b/i.test(input)) return input;

	const lines = input.split("\n");
	const output: string[] = [];
	let chunk: string[] = [];
	let inCodeFence = false;

	for (const line of lines) {
		if (isMarkdownCodeFenceToggle(line)) {
			if (chunk.length) {
				output.push(preprocessHtmlDetailsChunk(chunk.join("\n")));
				chunk = [];
			}
			inCodeFence = !inCodeFence;
			output.push(line);
			continue;
		}
		if (inCodeFence) {
			output.push(line);
			continue;
		}
		chunk.push(line);
	}
	if (chunk.length) output.push(preprocessHtmlDetailsChunk(chunk.join("\n")));
	return output.join("\n");
}

function preprocessHtmlDetailsChunk(input: string): string {
	const blocks = findTopLevelDetailsBlocks(input);
	let result = input;
	for (let index = blocks.length - 1; index >= 0; index -= 1) {
		const block = blocks[index];
		result =
			result.slice(0, block.start) +
			detailsInnerHtmlToFences(block.isOpen, block.inner) +
			result.slice(block.end);
	}
	return result;
}

export function preprocessDetailsMarkdown(markdown: string): string {
	return preprocessHtmlDetails(markdown);
}

export function postprocessDetailsMarkdown(markdown: string): string {
	return postprocessDetailsFences(markdown);
}
