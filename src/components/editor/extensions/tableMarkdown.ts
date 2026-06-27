import type { JSONContent, MarkdownToken } from "@tiptap/core";
import { Table } from "@tiptap/extension-table";

type TableTokenCell = {
	tokens?: MarkdownToken[];
};

type TableToken = MarkdownToken & {
	header?: TableTokenCell[];
	rows?: TableTokenCell[][];
};

interface MarkdownParseHelpers {
	parseInline: (tokens: MarkdownToken[]) => JSONContent[];
	createNode: (
		type: string,
		attrs?: Record<string, unknown>,
		content?: JSONContent[],
	) => JSONContent;
}

interface MarkdownRenderHelpers {
	renderChildren: (
		nodes: JSONContent | JSONContent[],
		separator?: string,
	) => string;
}

const TABLE_CELL_BREAK = "<br>";
const EMPTY_PARAGRAPH_MARKDOWN = "&nbsp;";
const NBSP_CHAR = "\u00A0";
const LIST_ITEM_MARKER = /^(\s*)([-+*]|\d+\.)\s+/;
const ORDERED_LIST_MARKER = /^\s*\d+\.\s+/;

function isTableCell(node: JSONContent) {
	return node.type === "tableCell" || node.type === "tableHeader";
}

function textFromTokens(tokens: MarkdownToken[]) {
	return tokens
		.map((token) => {
			const raw = token.raw ?? token.text;
			return typeof raw === "string" ? raw : "";
		})
		.join("");
}

function splitCellTokens(tokens: MarkdownToken[]) {
	const lines: MarkdownToken[][] = [[]];

	for (const token of tokens) {
		const raw = token.raw ?? token.text;
		if (
			token.type === "html" &&
			typeof raw === "string" &&
			/^<br\s*\/?>$/i.test(raw.trim())
		) {
			lines.push([]);
			continue;
		}

		lines[lines.length - 1]?.push(token);
	}

	return lines;
}

function tokensWithoutListMarker(tokens: MarkdownToken[]) {
	const nextTokens = tokens.map((token) => ({ ...token }));

	for (const token of nextTokens) {
		const raw = token.raw ?? token.text;
		if (typeof raw !== "string") continue;

		const match = raw.match(LIST_ITEM_MARKER);
		if (!match) return tokens;

		const marker = match[0];
		if (typeof token.raw === "string")
			token.raw = token.raw.slice(marker.length);
		if (typeof token.text === "string")
			token.text = token.text.slice(marker.length);
		return nextTokens;
	}

	return tokens;
}

function parseTableCellInline(
	tokens: MarkdownToken[],
	h: MarkdownParseHelpers,
) {
	const content = h.parseInline(tokens);
	if (
		content.length === 1 &&
		content[0]?.type === "text" &&
		(content[0].text === EMPTY_PARAGRAPH_MARKDOWN ||
			content[0].text === NBSP_CHAR)
	) {
		return [];
	}
	return content;
}

function paragraph(content: JSONContent[]) {
	return content.length > 0
		? { type: "paragraph", content }
		: { type: "paragraph" };
}

function parseTableCellContent(
	tokens: MarkdownToken[],
	h: MarkdownParseHelpers,
) {
	const lines = splitCellTokens(tokens).filter(
		(line) => textFromTokens(line).trim().length > 0,
	);
	if (lines.length === 0) return [{ type: "paragraph" }];

	const allListItems = lines.every((line) =>
		LIST_ITEM_MARKER.test(textFromTokens(line)),
	);
	if (allListItems) {
		const listType = ORDERED_LIST_MARKER.test(textFromTokens(lines[0] ?? []))
			? "orderedList"
			: "bulletList";
		return [
			{
				type: listType,
				content: lines.map((line) => ({
					type: "listItem",
					content: [
						paragraph(parseTableCellInline(tokensWithoutListMarker(line), h)),
					],
				})),
			},
		];
	}

	return lines.map((line) => paragraph(parseTableCellInline(line, h)));
}

function escapeTableCell(text: string) {
	return text.replace(/\n+/g, TABLE_CELL_BREAK).replace(/\|/g, "\\|").trim();
}

function renderTableCellContent(cell: JSONContent, h: MarkdownRenderHelpers) {
	const children = cell.content ?? [];
	if (children.length === 0) return "";

	if (children.length === 1 && children[0]?.type === "paragraph") {
		return escapeTableCell(h.renderChildren(children[0].content ?? []));
	}

	return children
		.map((child) => {
			if (child.type === "paragraph") {
				return h.renderChildren(child.content ?? []);
			}
			return h.renderChildren([child]);
		})
		.map(escapeTableCell)
		.join(TABLE_CELL_BREAK);
}

function renderGlyphTableToMarkdown(
	node: JSONContent,
	h: MarkdownRenderHelpers,
) {
	const rows =
		node.content?.map((row) =>
			(row.content ?? []).filter(isTableCell).map((cell) => ({
				text: renderTableCellContent(cell, h),
				isHeader: cell.type === "tableHeader",
			})),
		) ?? [];
	const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
	if (columnCount === 0) return "";

	const widths = Array.from({ length: columnCount }, (_, index) =>
		Math.max(3, ...rows.map((row) => row[index]?.text.length ?? 0)),
	);
	const pad = (text: string, index: number) =>
		text + " ".repeat(Math.max(0, (widths[index] ?? 3) - text.length));
	const firstRow = rows[0] ?? [];
	const hasHeader = firstRow.some((cell) => cell.isHeader);
	const header = Array.from({ length: columnCount }, (_, index) =>
		pad(hasHeader ? (firstRow[index]?.text ?? "") : "", index),
	);
	const body = hasHeader ? rows.slice(1) : rows;
	const lines = [
		`| ${header.join(" | ")} |`,
		`| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`,
		...body.map(
			(row) =>
				`| ${Array.from({ length: columnCount }, (_, index) =>
					pad(row[index]?.text ?? "", index),
				).join(" | ")} |`,
		),
	];

	return `\n${lines.join("\n")}\n`;
}

export const GlyphTable = Table.extend({
	parseMarkdown: (token: TableToken, h: MarkdownParseHelpers) => {
		const rows: JSONContent[] = [];

		if (token.header) {
			rows.push(
				h.createNode(
					"tableRow",
					{},
					token.header.map((cell) =>
						h.createNode(
							"tableHeader",
							{},
							parseTableCellContent(cell.tokens ?? [], h),
						),
					),
				),
			);
		}

		for (const row of token.rows ?? []) {
			rows.push(
				h.createNode(
					"tableRow",
					{},
					row.map((cell) =>
						h.createNode(
							"tableCell",
							{},
							parseTableCellContent(cell.tokens ?? [], h),
						),
					),
				),
			);
		}

		return h.createNode("table", undefined, rows);
	},
	renderMarkdown: (node: JSONContent, h: MarkdownRenderHelpers) =>
		renderGlyphTableToMarkdown(node, h),
});
