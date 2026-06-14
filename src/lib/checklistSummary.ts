import type { NoteTaskSummary } from "./tauri";

export const EMPTY_CHECKLIST_SUMMARY: NoteTaskSummary = {
	total_count: 0,
	completed_count: 0,
	open_count: 0,
};

export function summarizeChecklistsFromMarkdown(
	markdown: string,
): NoteTaskSummary {
	let total_count = 0;
	let completed_count = 0;

	for (const line of markdown.split(/\r?\n/)) {
		const match = line.match(/^\s*[-*+] \[([ xX])\] /);
		if (!match) continue;
		total_count += 1;
		if (match[1].toLowerCase() === "x") {
			completed_count += 1;
		}
	}

	return {
		total_count,
		completed_count,
		open_count: total_count - completed_count,
	};
}
