/**
 * Turns git's unified diff for one note into rows the version history view can draw as
 * the rendered note: markdown blocks marked added, removed or changed in place.
 */

export interface DiffSegment {
	kind: "same" | "add" | "delete";
	text: string;
}

export type DiffBlock =
	| { type: "heading"; level: number }
	| { type: "item"; marker: string; depth: number }
	| { type: "row" }
	| { type: "quote" }
	| { type: "code" }
	| { type: "text" };

export type NoteDiffRow =
	| { kind: "fold"; count: number }
	| {
			kind: "context" | "add" | "delete" | "change";
			block: DiffBlock;
			/** One entry per table cell; other blocks have a single cell. */
			cells: DiffSegment[][];
	  };

export interface NoteDiff {
	/** The commit added the note, so every line is new. */
	created: boolean;
	rows: NoteDiffRow[];
}

interface ParsedLine {
	block: DiffBlock;
	/** The markdown prefix that picks the block (`## `, `- [ ] `, …). */
	prefix: string;
	cells: string[];
}

/** Longest line pair (in tokens²) worth a word diff; beyond it the lines show as removed + added. */
const MAX_WORD_DIFF_CELLS = 250_000;
/** Share of a changed line that must survive for it to read as an edit, not a replacement. */
const MIN_PAIR_SIMILARITY = 0.4;

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
const HEADING = /^(#{1,6})\s+/;
const LIST_ITEM = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(?:\[([ xX])\]\s+)?/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const FENCE = /^\s*(```|~~~)/;

function splitTableCells(line: string): string[] {
	const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
	return inner.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

function parseLine(line: string, inCode: boolean): ParsedLine {
	if (inCode || FENCE.test(line)) {
		return { block: { type: "code" }, prefix: "```", cells: [line] };
	}
	const heading = HEADING.exec(line);
	if (heading) {
		return {
			block: { type: "heading", level: heading[1].length },
			prefix: heading[0],
			cells: [line.slice(heading[0].length)],
		};
	}
	const item = LIST_ITEM.exec(line);
	if (item) {
		const [prefix, indent, , ordinal, task] = item;
		const marker = task === undefined ? (ordinal ? `${ordinal}.` : "•") : task === " " ? "☐" : "☑";
		return {
			block: { type: "item", marker, depth: Math.floor(indent.replace(/\t/g, "  ").length / 2) },
			prefix,
			cells: [line.slice(prefix.length)],
		};
	}
	if (line.trimStart().startsWith("|")) {
		return { block: { type: "row" }, prefix: "|", cells: splitTableCells(line) };
	}
	if (line.startsWith(">")) {
		return { block: { type: "quote" }, prefix: ">", cells: [line.replace(/^>\s?/, "")] };
	}
	return { block: { type: "text" }, prefix: "", cells: [line] };
}

function tokenize(text: string): string[] {
	return text.match(/\s+|\w+|[^\s\w]/gu) ?? [];
}

/** Word-level diff of one line, or null when the lines are too long to compare. */
export function diffWords(before: string, after: string): DiffSegment[] | null {
	const a = tokenize(before);
	const b = tokenize(after);
	if (a.length * b.length > MAX_WORD_DIFF_CELLS) return null;
	const width = b.length + 1;
	// lcs[i * width + j] = longest common subsequence of a[i..] and b[j..].
	const lcs = new Uint32Array((a.length + 1) * width);
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			lcs[i * width + j] =
				a[i] === b[j]
					? lcs[(i + 1) * width + j + 1] + 1
					: Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
		}
	}
	const segments: DiffSegment[] = [];
	const push = (kind: DiffSegment["kind"], text: string) => {
		const last = segments[segments.length - 1];
		if (last?.kind === kind) last.text += text;
		else segments.push({ kind, text });
	};
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			push("same", a[i]);
			i++;
			j++;
		} else if (
			j >= b.length ||
			(i < a.length && lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])
		) {
			push("delete", a[i]);
			i++;
		} else {
			push("add", b[j]);
			j++;
		}
	}
	return segments;
}

function similarity(cells: DiffSegment[][]): number {
	let same = 0;
	let removed = 0;
	let added = 0;
	for (const segment of cells.flat()) {
		const size = segment.text.replace(/\s/g, "").length;
		if (segment.kind === "same") same += size;
		else if (segment.kind === "delete") removed += size;
		else added += size;
	}
	const longest = same + Math.max(removed, added);
	return longest === 0 ? 0 : same / longest;
}

/** A removed line and the added line that replaced it, as one row edited in place. */
function pairChange(before: ParsedLine, after: ParsedLine): NoteDiffRow | null {
	if (before.prefix !== after.prefix || before.cells.length !== after.cells.length) return null;
	if (before.block.type === "code") return null;
	const cells: DiffSegment[][] = [];
	for (const [index, cell] of after.cells.entries()) {
		const segments = diffWords(before.cells[index], cell);
		if (!segments) return null;
		cells.push(segments);
	}
	if (similarity(cells) < MIN_PAIR_SIMILARITY) return null;
	return { kind: "change", block: after.block, cells };
}

function plainRow(kind: "context" | "add" | "delete", line: ParsedLine): NoteDiffRow {
	const segment = kind === "context" ? "same" : kind;
	return { kind, block: line.block, cells: line.cells.map((text) => [{ kind: segment, text }]) };
}

export function parseNoteDiff(diff: string): NoteDiff {
	const rows: NoteDiffRow[] = [];
	let created = false;
	let inHunk = false;
	let inCode = false;
	let nextNewLine = 1;
	let removed: ParsedLine[] = [];
	let added: ParsedLine[] = [];

	const flushChanges = () => {
		const paired =
			removed.length === added.length
				? removed.map((line, index) => pairChange(line, added[index]))
				: [];
		if (paired.length > 0 && paired.every((row) => row !== null)) {
			rows.push(...paired.filter((row) => row !== null));
		} else {
			rows.push(...removed.map((line) => plainRow("delete", line)));
			rows.push(...added.map((line) => plainRow("add", line)));
		}
		removed = [];
		added = [];
	};
	const parse = (text: string): ParsedLine | null => {
		const fence = FENCE.test(text);
		const line = parseLine(text, inCode);
		if (fence) inCode = !inCode;
		// Blank lines and table dividers carry no content once the note is rendered.
		if (!fence && !inCode && (text.trim() === "" || TABLE_DIVIDER.test(text))) return null;
		return line;
	};

	for (const line of diff.split("\n")) {
		const hunk = HUNK_HEADER.exec(line);
		if (hunk) {
			flushChanges();
			inHunk = true;
			inCode = false;
			const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
			// A hunk that only removes lines names the line before it.
			const start = count === 0 ? Number(hunk[1]) + 1 : Number(hunk[1]);
			if (start > nextNewLine) rows.push({ kind: "fold", count: start - nextNewLine });
			nextNewLine = start + count;
			continue;
		}
		if (!inHunk) {
			if (line.startsWith("new file mode")) created = true;
			continue;
		}
		const text = line.slice(1);
		if (line.startsWith("-")) {
			// Removed lines never open a fence for the lines that follow in the new note.
			const fenceBefore: boolean = inCode;
			const parsed = parse(text);
			inCode = fenceBefore;
			if (parsed) removed.push(parsed);
		} else if (line.startsWith("+")) {
			const parsed = parse(text);
			if (parsed) added.push(parsed);
		} else if (line.startsWith(" ")) {
			flushChanges();
			const parsed = parse(text);
			if (parsed) rows.push(plainRow("context", parsed));
		}
	}
	flushChanges();
	return { created, rows };
}
