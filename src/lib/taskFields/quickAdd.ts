import { INLINE_TAG_PATTERN, isHexColorCode } from "@/components/editor/noteProperties/utils";
import type { TaskPriority } from "@/lib/tauri";
import { parseNaturalDate } from "./naturalDate";

export type QuickAddToken = {
	kind: "due" | "priority" | "tag";
	start: number;
	end: number;
	value: string;
};

export type QuickAddParse = {
	title: string;
	due: string | null;
	priority: TaskPriority | null;
	tokens: QuickAddToken[];
};

type Word = { start: number; end: number; text: string };

type DueMatch = { token: QuickAddToken; due: string };

const WORD_PATTERN = /\S+/g;

const PRIORITY_BY_MARKS: ReadonlyMap<string, TaskPriority> = new Map([
	["!", 1],
	["!!", 2],
	["!!!", 3],
	["!!!!", 4],
]);

function wordsOf(input: string): Word[] {
	return Array.from(input.matchAll(WORD_PATTERN), (match) => ({
		start: match.index,
		end: match.index + match[0].length,
		text: match[0],
	}));
}

function dueMatch(input: string, first: Word, last: Word, today: Date): DueMatch | null {
	const value = input.slice(first.start, last.end);
	const due = parseNaturalDate(value, today);
	return due ? { due, token: { kind: "due", start: first.start, end: last.end, value } } : null;
}

function lastDueMatch(input: string, words: Word[], today: Date): DueMatch | null {
	let latest: DueMatch | null = null;
	let index = 0;
	while (index < words.length) {
		const word = words[index];
		const next = words[index + 1];
		const pair = next ? dueMatch(input, word, next, today) : null;
		const single = pair ? null : dueMatch(input, word, word, today);
		latest = pair ?? single ?? latest;
		index += pair ? 2 : 1;
	}
	return latest;
}

function lastPriorityToken(words: Word[]): QuickAddToken | null {
	const word = [...words].reverse().find((candidate) => PRIORITY_BY_MARKS.has(candidate.text));
	return word ? { kind: "priority", start: word.start, end: word.end, value: word.text } : null;
}

function tagTokens(input: string): QuickAddToken[] {
	return Array.from(input.matchAll(INLINE_TAG_PATTERN))
		.filter((match) => !isHexColorCode(match[2]))
		.map((match) => {
			const start = match.index + match[1].length;
			const value = `#${match[2]}`;
			return { kind: "tag", start, end: start + value.length, value } satisfies QuickAddToken;
		});
}

function titleWithout(input: string, removed: QuickAddToken[]): string {
	const ordered = [...removed].sort((left, right) => left.start - right.start);
	let title = "";
	let cursor = 0;
	for (const token of ordered) {
		title += `${input.slice(cursor, token.start)} `;
		cursor = token.end;
	}
	title += input.slice(cursor);
	return title.replace(/\s+/g, " ").trim();
}

export function parseQuickAdd(input: string, today: Date): QuickAddParse {
	const words = wordsOf(input);
	const tags = tagTokens(input);
	const due = lastDueMatch(input, words, today);
	const priorityToken = lastPriorityToken(words);
	const removed = [due?.token, priorityToken].filter((token) => token != null);
	const tokens = [...removed, ...tags].sort((left, right) => left.start - right.start);
	return {
		title: titleWithout(input, removed),
		due: due?.due ?? null,
		priority: priorityToken ? (PRIORITY_BY_MARKS.get(priorityToken.value) ?? null) : null,
		tokens,
	};
}
