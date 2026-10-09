import type { NoteTaskSummary } from "./tauri";

const CHECKLIST_LINE = /^[ \t]*[-*+] \[([ xX])\] /;
// A run of 3+ backticks or tildes after any leading whitespace (Rust trim_start).
const FENCE_LINE = /^\s*(`{3,}|~{3,})/;

// Mirrors the Rust checklist scanner: skips frontmatter, fenced code, and HTML
// comment regions opened by a line that starts with an unclosed `<!--`.
export function summarizeChecklistsFromMarkdown(markdown: string): NoteTaskSummary {
	const lines = markdown.split(/\r?\n/);
	let index = 0;
	if (lines[0] === "---") {
		// Like Rust, the closing `---` needs a line of its own after the opener.
		const close = lines.indexOf("---", 2);
		if (close > 0 && close < lines.length - 1) index = close + 1;
	}

	let total_count = 0;
	let completed_count = 0;
	let fence: string | null = null;
	let inComment = false;
	for (; index < lines.length; index += 1) {
		const line = lines[index];
		const fenceRun = line.match(FENCE_LINE)?.[1];
		if (fence !== null) {
			const closes =
				fenceRun !== undefined &&
				fenceRun[0] === fence[0] &&
				fenceRun.length >= fence.length &&
				line.trim() === fenceRun;
			if (closes) fence = null;
			continue;
		}
		if (inComment) {
			inComment = !line.includes("-->");
			continue;
		}
		if (fenceRun !== undefined) {
			fence = fenceRun;
			continue;
		}
		const trimmed = line.trimStart();
		if (trimmed.startsWith("<!--")) {
			inComment = !trimmed.slice(4).includes("-->");
			continue;
		}
		const match = line.match(CHECKLIST_LINE);
		if (!match) continue;
		total_count += 1;
		if (match[1] !== " ") completed_count += 1;
	}

	return {
		total_count,
		completed_count,
		open_count: total_count - completed_count,
	};
}
