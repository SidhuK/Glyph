const DETAILS_BLOCK_END_RE = /^:::\s*$/;
const DETAILS_SUMMARY_START_RE = /^:::detailsSummary\s*$/;
const DETAILS_CONTENT_START_RE = /^:::detailsContent\s*$/;

function readFencedSection(
	lines: string[],
	startIndex: number,
): { content: string; endIndex: number } {
	const contentLines: string[] = [];
	let index = startIndex + 1;

	while (index < lines.length) {
		if (DETAILS_BLOCK_END_RE.test(lines[index] ?? "")) {
			return { content: contentLines.join("\n").trim(), endIndex: index };
		}
		contentLines.push(lines[index] ?? "");
		index += 1;
	}

	return { content: contentLines.join("\n").trim(), endIndex: index };
}

function postprocessDetailsFences(input: string): string {
	const lines = input.split("\n");
	const output: string[] = [];
	let index = 0;

	while (index < lines.length) {
		const line = lines[index] ?? "";
		const startMatch = line.match(/^:::details(?:\s+\{open\})?\s*$/);
		if (!startMatch) {
			output.push(line);
			index += 1;
			continue;
		}

		const isOpen = /:::details\s+\{open\}/.test(line);
		let summary = "";
		let content = "";
		index += 1;

		while (index < lines.length) {
			const sectionLine = lines[index] ?? "";
			if (DETAILS_BLOCK_END_RE.test(sectionLine)) {
				index += 1;
				break;
			}
			if (DETAILS_SUMMARY_START_RE.test(sectionLine)) {
				const section = readFencedSection(lines, index);
				summary = section.content;
				index = section.endIndex + 1;
				continue;
			}
			if (DETAILS_CONTENT_START_RE.test(sectionLine)) {
				const section = readFencedSection(lines, index);
				content = section.content;
				index = section.endIndex + 1;
				continue;
			}
			index += 1;
		}

		const openAttr = isOpen ? " open" : "";
		const blocks = [`<details${openAttr}>`, `<summary>${summary}</summary>`];
		if (content) blocks.push("", content);
		blocks.push("", "</details>");
		output.push(...blocks);
	}

	return output.join("\n");
}

const HTML_DETAILS_RE = /<details(\s+open)?\s*>([\s\S]*?)<\/details>/gi;

function preprocessHtmlDetails(input: string): string {
	if (!/<details\b/i.test(input)) return input;

	return input.replace(
		HTML_DETAILS_RE,
		(_match, openAttr: string | undefined, inner: string) => {
			const summaryMatch = inner.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
			const summary = (summaryMatch?.[1] ?? "").trim();
			const content = inner
				.replace(/<summary[^>]*>[\s\S]*?<\/summary>/i, "")
				.trim();
			const openLine = openAttr ? ":::details {open}" : ":::details";
			const blocks = [
				openLine,
				"",
				":::detailsSummary",
				"",
				summary,
				"",
				":::",
			];
			blocks.push("", ":::detailsContent", "", content, "", ":::", "", ":::");
			return blocks.join("\n");
		},
	);
}

export function preprocessDetailsMarkdown(markdown: string): string {
	return preprocessHtmlDetails(markdown);
}

export function postprocessDetailsMarkdown(markdown: string): string {
	return postprocessDetailsFences(markdown);
}
