type WritableTaskField = "priority" | "due";

interface TaskFieldSpan {
	key: string;
	value: string;
	start: number;
	end: number;
}

export interface TaskLineEdit {
	from: number;
	to: number;
	insert: string;
}

const FIELD_WRITE_ORDER = ["priority", "due", "completion", "cancelled"];
const FIELD_SEPARATOR = "  ";
const BRACKET_FIELD_RE =
	/(?<![\\\w])\[([A-Za-z][A-Za-z0-9_-]*)::[ \t]*((?:\[\[[^[\]\n]+\]\]|[^[\]\n])*?)[ \t]*\](?!\()/gu;
const EMOJI_FIELDS: ReadonlyArray<{ key: string; pattern: RegExp }> = [
	{ key: "due", pattern: /(?:📅|📆|🗓)️?[ \t]*(\d{4}-\d{2}-\d{2})/gu },
	{ key: "completion", pattern: /✅️?[ \t]*(\d{4}-\d{2}-\d{2})/gu },
	{ key: "cancelled", pattern: /❌️?[ \t]*(\d{4}-\d{2}-\d{2})/gu },
	{ key: "priority", pattern: /(🔺|⏫|🔼|🔽|⏬)️?/gu },
];
const PRIORITY_EMOJI_NAMES: Readonly<Record<string, string>> = {
	"🔺": "highest",
	"⏫": "high",
	"🔼": "medium",
	"🔽": "low",
	"⏬": "lowest",
};

function bracketSpans(text: string): TaskFieldSpan[] {
	return Array.from(text.matchAll(BRACKET_FIELD_RE), (match) => ({
		key: match[1].toLowerCase(),
		value: match[2],
		start: match.index,
		end: match.index + match[0].length,
	}));
}

function emojiSpans(text: string): TaskFieldSpan[] {
	return EMOJI_FIELDS.flatMap(({ key, pattern }) =>
		Array.from(text.matchAll(pattern), (match) => ({
			key,
			value: key === "priority" ? (PRIORITY_EMOJI_NAMES[match[1]] ?? "") : match[1],
			start: match.index,
			end: match.index + match[0].length,
		})),
	);
}

function scanTaskFields(text: string, limit: number = text.length): TaskFieldSpan[] {
	const bracket = bracketSpans(text);
	const emoji = emojiSpans(text).filter(
		(span) => !bracket.some((field) => span.start < field.end && field.start < span.end),
	);
	return [...bracket, ...emoji]
		.filter((span) => span.start < limit)
		.sort((left, right) => left.start - right.start);
}

export function findTaskField(
	text: string,
	key: WritableTaskField,
	limit: number = text.length,
): TaskFieldSpan | null {
	const spans = scanTaskFields(text, limit).filter((span) => span.key === key);
	return spans.find((span) => text[span.start] === "[") ?? spans[0] ?? null;
}

function startOfTrailingWhitespace(text: string, end: number): number {
	let position = end;
	while (position > 0 && (text[position - 1] === " " || text[position - 1] === "\t")) position -= 1;
	return position;
}

function writeOrder(key: string): number {
	const index = FIELD_WRITE_ORDER.indexOf(key);
	return index === -1 ? FIELD_WRITE_ORDER.length : index;
}

export function planTaskFieldWrite({
	text,
	limit,
	key,
	value,
}: {
	text: string;
	limit: number;
	key: WritableTaskField;
	value: string;
}): TaskLineEdit {
	const field = `[${key}:: ${value}]`;
	const existing = findTaskField(text, key, limit);
	if (existing) return { from: existing.start, to: existing.end, insert: field };
	const later = scanTaskFields(text, limit).find(
		(span) => FIELD_WRITE_ORDER.includes(span.key) && writeOrder(span.key) > writeOrder(key),
	);
	const anchor = later?.start ?? limit;
	const position = startOfTrailingWhitespace(text, anchor);
	const to = anchor === text.length ? anchor : position;
	return { from: position, to, insert: position === 0 ? field : FIELD_SEPARATOR + field };
}

export function planTaskFieldRemoval({
	text,
	limit,
	key,
}: {
	text: string;
	limit: number;
	key: WritableTaskField;
}): TaskLineEdit | null {
	const existing = findTaskField(text, key, limit);
	if (!existing) return null;
	return { from: startOfTrailingWhitespace(text, existing.start), to: existing.end, insert: "" };
}
