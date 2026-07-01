import type { TOCHeading } from "../editor/hooks/useTableOfContents";
import { withHeadingSlugs } from "../editor/markdown/headingAnchor";

interface NoteInfoAnalysis {
	stats: {
		words: number;
		characters: number;
		readingTime: string;
	};
	taskSummary: {
		total_count: number;
		completed_count: number;
		open_count: number;
	};
	headings: TOCHeading[];
	lineCount: number;
}

const WORDS_PER_MINUTE = 200;
const HEADING_PATTERN = /^(#{1,6})[\t ]+(.+?)[\t ]*#*[\t ]*$/;
const TASK_PATTERN = /^\s*[-*+] \[([ xX])\] /;
const FENCE_PATTERN = /^\s*(`{3,}|~{3,})/;

function readingTime(words: number): string {
	if (words <= 0) return "0s";
	const totalSeconds = Math.ceil((words / WORDS_PER_MINUTE) * 60);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes <= 0) return `${seconds}s`;
	if (seconds === 0) return `${minutes}m`;
	return `${minutes}m ${seconds}s`;
}

export function analyzeNoteInfo(
	markdown: string,
	body: string,
	includeHeadings: boolean,
): NoteInfoAnalysis {
	let words = 0;
	const wordPattern = /\S+/gu;
	const headings: TOCHeading[] = [];
	let totalTasks = 0;
	let completedTasks = 0;
	let lineCount = markdown.length > 0 ? 1 : 0;
	let lineStart = 0;
	let fenceMarker: string | null = null;
	const bodyStart = Math.max(0, markdown.length - body.length);

	while (lineStart <= markdown.length) {
		const lineEnd = markdown.indexOf("\n", lineStart);
		const end = lineEnd === -1 ? markdown.length : lineEnd;
		const line = markdown.slice(lineStart, end).replace(/\r$/, "");
		if (lineEnd !== -1) lineCount += 1;
		if (lineStart >= bodyStart) {
			while (wordPattern.exec(line)) {
				words += 1;
			}

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
			} else if (!fenceMarker) {
				const taskMatch = line.match(TASK_PATTERN);
				if (taskMatch?.[1]) {
					totalTasks += 1;
					if (taskMatch[1].toLowerCase() === "x") completedTasks += 1;
				}

				if (includeHeadings) {
					const headingMatch = line.match(HEADING_PATTERN);
					const headingText = headingMatch?.[2]?.trim();
					if (headingMatch?.[1] && headingText) {
						headings.push({
							id: `raw-toc-${lineStart}`,
							level: headingMatch[1].length,
							text: headingText,
							pos: lineStart,
						});
					}
				}
			}
		}

		if (lineEnd === -1) break;
		lineStart = lineEnd + 1;
	}

	return {
		stats: {
			words,
			characters: body.length,
			readingTime: readingTime(words),
		},
		taskSummary: {
			total_count: totalTasks,
			completed_count: completedTasks,
			open_count: totalTasks - completedTasks,
		},
		headings: includeHeadings ? withHeadingSlugs(headings) : headings,
		lineCount,
	};
}
