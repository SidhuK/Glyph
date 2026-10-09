import type { TaskItem, TaskNoteGroup } from "../../lib/tauri";
import { displayNameFromPath } from "../../utils/path";
import { taskKey } from "./taskModel";

/** The title a note row shows (and search matches): file name when the note has none. */
export function noteTitle(group: TaskNoteGroup): string {
	return group.title || displayNameFromPath(group.note_path);
}

/** Deepest visual nesting level; deeper tasks render at this level. */
const MAX_TASK_DEPTH = 4;

export type TaskRow =
	| { kind: "note"; id: string; group: TaskNoteGroup; openCount: number; collapsed: boolean }
	| { kind: "heading"; id: string; text: string }
	| {
			kind: "task";
			id: string;
			group: TaskNoteGroup;
			item: TaskItem;
			/** Display text with light inline Markdown stripped. */
			text: string;
			depth: number;
			completing: boolean;
	  };

interface TaskRowsResult {
	rows: TaskRow[];
	openTasks: number;
	notes: number;
	/** Character count of the widest localized fraction label among note rows. */
	fractionWidth: number;
}

const LINK = /!?\[([^\]]*)\]\([^)]*\)/g;
const WIKILINK_LABEL = /\[\[[^\]|]+\|([^\]]+)\]\]/g;
const WIKILINK = /\[\[([^\]]+)\]\]/g;
const STRONG = /(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g;
const EM_STAR = /(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?!\w)/g;
const EM_UNDERSCORE = /(?<![\w_])_(?=\S)(.+?)(?<=\S)_(?!\w)/g;

function stripSpans(text: string): string {
	return text
		.replace(LINK, "$1")
		.replace(WIKILINK_LABEL, "$1")
		.replace(WIKILINK, "$1")
		.replace(STRONG, "$2")
		.replace(EM_STAR, "$1")
		.replace(EM_UNDERSCORE, "$1");
}

/** Display-only cleanup of light inline Markdown. Code spans are kept verbatim. */
export function stripInlineMarkdown(text: string): string {
	return text
		.split(/(`[^`]+`)/)
		.map((part, index) => (index % 2 === 1 ? part.slice(1, -1) : stripSpans(part)))
		.join("");
}

interface TaskDisplay {
	text: string;
	heading: string | null;
	/** Lowercased text and heading, for search. */
	haystack: string;
}

/** Stripped once per item: query data items are stable objects until the next fetch. */
const displayCache = new WeakMap<TaskItem, TaskDisplay>();

function taskDisplay(item: TaskItem): TaskDisplay {
	const cached = displayCache.get(item);
	if (cached) return cached;
	const text = stripInlineMarkdown(item.text);
	const heading = item.heading === null ? null : stripInlineMarkdown(item.heading);
	const display = { text, heading, haystack: `${text}\n${heading ?? ""}`.toLowerCase() };
	displayCache.set(item, display);
	return display;
}

/**
 * Nesting depth per item from an indent stack. `indent` is Rust's byte count of the
 * leading whitespace, so a tab and a space weigh the same; the stack still nests by
 * relative indent within a note.
 */
function taskDepths(items: readonly TaskItem[]): number[] {
	const stack: number[] = [];
	return items.map((item) => {
		while (stack.length > 0 && item.indent < stack[stack.length - 1]) stack.pop();
		if (stack.length === 0 || item.indent > stack[stack.length - 1]) stack.push(item.indent);
		return stack.length - 1;
	});
}

export function buildTaskRows(
	groups: readonly TaskNoteGroup[],
	/** Trimmed, lowercased search text. */
	query: string,
	isExpanded: (notePath: string) => boolean,
	completing: { has: (key: string) => boolean },
	formatFraction: (done: number, total: number) => string,
): TaskRowsResult {
	const rows: TaskRow[] = [];
	let openTasks = 0;
	let notes = 0;
	let fractionWidth = 0;
	for (const group of groups) {
		const depths = taskDepths(group.items);
		const titleMatches = noteTitle(group).toLowerCase().includes(query);
		const visible = group.items
			.map((item, index) => ({ item, depth: Math.min(MAX_TASK_DEPTH, depths[index]) }))
			.filter(({ item }) => titleMatches || taskDisplay(item).haystack.includes(query));
		if (visible.length === 0) continue;
		const isOpen = (item: TaskItem) => !completing.has(taskKey(group.note_path, item.start));
		const openCount = group.items.filter(isOpen).length;
		const visibleOpen = visible.filter(({ item }) => isOpen(item)).length;
		openTasks += visibleOpen;
		if (visibleOpen > 0) notes += 1;
		// An active search shows matches inside collapsed groups without changing stored state.
		const isCollapsed = !query && !isExpanded(group.note_path);
		const fraction = formatFraction(group.total_count - openCount, group.total_count);
		fractionWidth = Math.max(fractionWidth, fraction.length);
		rows.push({
			kind: "note",
			id: `note:${group.note_path}`,
			group,
			openCount,
			collapsed: isCollapsed,
		});
		if (isCollapsed) continue;
		let heading: string | null = null;
		for (const { item, depth } of visible) {
			const display = taskDisplay(item);
			if (display.heading !== null && item.heading !== heading) {
				rows.push({
					kind: "heading",
					id: `heading:${group.note_path}:${item.start}`,
					text: display.heading,
				});
			}
			heading = item.heading;
			rows.push({
				kind: "task",
				id: `task:${group.note_path}:${item.start}`,
				group,
				item,
				text: display.text,
				depth,
				completing: !isOpen(item),
			});
		}
	}
	return { rows, openTasks, notes, fractionWidth };
}
