import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { blocksToMarkdown } from "../markdown/selectionMarkdown";
import { type TableGrid, tableToGrid } from "./tableGrid";

export type TableCopyFormat = "rich" | "markdown" | "csv" | "tsv";

const CSV_QUOTE_RE = /[",\r\n]/;
const TSV_QUOTE_RE = /[\t"\r\n]/;

function delimited(grid: TableGrid, delimiter: string, quoteRe: RegExp, lineEnd: string): string {
	return grid
		.map((row) =>
			row
				.map((cell) => {
					const text = cell?.text ?? "";
					return quoteRe.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
				})
				.join(delimiter),
		)
		.join(lineEnd);
}

/** RFC 4180: comma-separated, CRLF rows, quotes doubled inside quoted fields. */
export function tableGridToCsv(grid: TableGrid): string {
	return delimited(grid, ",", CSV_QUOTE_RE, "\r\n");
}

/** Tab-separated with the same quoting Excel and Google Sheets emit and read back. */
export function tableGridToTsv(grid: TableGrid): string {
	return delimited(grid, "\t", TSV_QUOTE_RE, "\n");
}

export function tableGridToHtml(grid: TableGrid): string {
	const rows = grid.map((row) => {
		const cells = row.map((cell) => {
			if (!cell) return "";
			const tag = cell.header ? "th" : "td";
			const colspan = cell.colspan > 1 ? ` colspan="${cell.colspan}"` : "";
			const rowspan = cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : "";
			return `<${tag}${colspan}${rowspan}>${cell.html}</${tag}>`;
		});
		return `<tr>${cells.join("")}</tr>`;
	});
	const [first, ...rest] = rows;
	const headerRow = grid[0]?.every((cell) => !cell || cell.header) ?? false;
	const body =
		headerRow && first
			? `<thead>${first}</thead><tbody>${rest.join("")}</tbody>`
			: `<tbody>${rows.join("")}</tbody>`;
	return `<meta charset="utf-8"><table>${body}</table>`;
}

export function tableToMarkdown(editor: Editor, table: ProseMirrorNode): string {
	return blocksToMarkdown(editor, [table.toJSON()]);
}

/**
 * Plain text for ⌘C on a cell selection: tab-separated, so it pastes into
 * spreadsheets as a grid. Returns "" for other selections, which the editor
 * copies as markdown instead.
 */
export function cellSelectionClipboardText(slice: Slice, state: EditorState): string {
	if (!(state.selection instanceof CellSelection)) return "";
	const first = slice.content.firstChild;
	const table =
		first?.type.name === "table" ? first : state.schema.nodes.table?.create(null, slice.content);
	return table ? tableGridToTsv(tableToGrid(table)) : "";
}

function textBlob(type: "text/html" | "text/plain", value: string): Blob {
	return new Blob([value], { type });
}

/**
 * Writes the table to the clipboard. Call synchronously from a click handler:
 * WebKit rejects clipboard writes that happen outside a user gesture.
 */
export function copyTableToClipboard(
	editor: Editor,
	table: ProseMirrorNode,
	format: TableCopyFormat,
): Promise<void> {
	const clipboard = navigator.clipboard;
	if (!clipboard) return Promise.reject(new Error("Clipboard API is unavailable."));
	switch (format) {
		case "markdown":
			return clipboard.writeText(tableToMarkdown(editor, table));
		case "csv":
			return clipboard.writeText(tableGridToCsv(tableToGrid(table)));
		case "tsv":
			return clipboard.writeText(tableGridToTsv(tableToGrid(table)));
		case "rich": {
			// HTML pastes as a real table in spreadsheets and rich editors;
			// plain-text targets get Markdown.
			const item = new ClipboardItem({
				"text/html": textBlob("text/html", tableGridToHtml(tableToGrid(table))),
				"text/plain": textBlob("text/plain", tableToMarkdown(editor, table)),
			});
			return clipboard.write([item]);
		}
		default: {
			const _exhaustive: never = format;
			return _exhaustive;
		}
	}
}
