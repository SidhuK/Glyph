import type { NoteTaskSummary } from "./tauri";

const FENCE_MARKER = /^(`+|~+)/;
const FENCE_START = /^(`{3,}|~{3,})/;
const CHECKBOX = /^[\t ]*[-*+] \[([ xX])\] /;

export function summarizeChecklistsFromMarkdown(markdown: string): NoteTaskSummary {
	let total_count = 0;
	let completed_count = 0;
	let fence: { marker: string; length: number } | null = null;
	let frontmatter = false;
	let comment = false;

	for (const [index, line] of markdown.split(/\r?\n/).entries()) {
		const trimmed = line.trimStart();
		if (index === 0 && trimmed === "---") {
			frontmatter = true;
			continue;
		}
		if (frontmatter) {
			if (trimmed === "---" || trimmed === "...") frontmatter = false;
			continue;
		}
		if (fence) {
			const marker = trimmed.match(FENCE_MARKER)?.[0];
			if (
				marker &&
				marker[0] === fence.marker &&
				marker.length >= fence.length &&
				!trimmed.slice(marker.length).trim()
			) {
				fence = null;
			}
			continue;
		}
		if (comment || trimmed.startsWith("<!--")) {
			comment = !trimmed.includes("-->");
			continue;
		}
		const marker = trimmed.match(FENCE_START)?.[0];
		if (marker) {
			fence = { marker: marker.charAt(0), length: marker.length };
			continue;
		}
		const match = line.match(CHECKBOX);
		if (!match) continue;
		total_count += 1;
		if (match[1] === "x" || match[1] === "X") {
			completed_count += 1;
		}
	}

	return {
		total_count,
		completed_count,
		open_count: total_count - completed_count,
	};
}
