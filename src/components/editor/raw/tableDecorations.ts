import type { Range } from "@codemirror/state";
import { Decoration, type EditorView } from "@codemirror/view";

const TABLE_DELIMITER_PATTERN =
	/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

interface TableCell {
	from: number;
	to: number;
	text: string;
}

function tableCells(text: string): TableCell[] {
	const pipes: number[] = [];
	for (let index = 0; index < text.length; index += 1) {
		if (text[index] === "|" && text[index - 1] !== "\\") pipes.push(index);
	}
	if (!pipes.length) return [];
	const cells: TableCell[] = [];
	let from = pipes[0] === 0 ? 1 : 0;
	for (const pipe of pipes) {
		if (pipe < from) continue;
		cells.push({ from, to: pipe, text: text.slice(from, pipe).trim() });
		from = pipe + 1;
	}
	if (from < text.length) {
		cells.push({ from, to: text.length, text: text.slice(from).trim() });
	}
	return cells;
}

export function decorateRecognizedTable(
	ranges: Range<Decoration>[],
	view: EditorView,
	from: number,
	to: number,
	visibleFrom: number,
	visibleTo: number,
) {
	const document = view.state.doc;
	const first = document.lineAt(from).number;
	const last = document.lineAt(Math.max(from, to - 1)).number;
	const rows = Array.from({ length: last - first + 1 }, (_, index) =>
		document.line(first + index),
	);
	const widths: number[] = [];
	for (const row of rows) {
		for (const [index, cell] of tableCells(row.text).entries()) {
			widths[index] = Math.max(
				widths[index] ?? 0,
				Math.min(38, Math.max(7, cell.text.length + 2)),
			);
		}
	}
	const totalWidth = widths.reduce((sum, width) => sum + width, 0);
	for (const [index, line] of rows.entries()) {
		if (line.to < visibleFrom || line.from > visibleTo) continue;
		const kind =
			index === 0
				? "header"
				: TABLE_DELIMITER_PATTERN.test(line.text)
					? "separator"
					: "row";
		const isLast = index === rows.length - 1;
		ranges.push(
			Decoration.line({
				class: `cm-raw-table-line is-${kind}${isLast ? " is-last" : ""}`,
				attributes: {
					style: `--raw-table-width: ${totalWidth + widths.length + 1}ch`,
				},
			}).range(line.from),
		);
		for (const [cellIndex, cell] of tableCells(line.text).entries()) {
			if (cell.from === cell.to) continue;
			ranges.push(
				Decoration.mark({
					class: `cm-raw-table-cell is-${kind}`,
					attributes: {
						style: `--raw-table-cell-width: ${widths[cellIndex] ?? 7}ch`,
					},
				}).range(line.from + cell.from, line.from + cell.to),
			);
		}
		for (let position = 0; position < line.text.length; position += 1) {
			if (line.text[position] === "|" && line.text[position - 1] !== "\\") {
				ranges.push(
					Decoration.mark({ class: "cm-raw-table-pipe" }).range(
						line.from + position,
						line.from + position + 1,
					),
				);
			}
		}
	}
}
