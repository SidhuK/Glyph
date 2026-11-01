import type { Mark, Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TableMap } from "@tiptap/pm/tables";
import { wikiLinkDisplayName } from "../markdown/wikiLinkCodec";
import { inlineMathMarkdown } from "../extensions/math/mathOptions";

export interface TableGridCell {
	text: string;
	html: string;
	header: boolean;
	colspan: number;
	rowspan: number;
}

/** Row-major grid; `null` marks a slot covered by a merged cell's span. */
export type TableGrid = (TableGridCell | null)[][];

const SAFE_HREF_RE = /^(https?:|mailto:)/i;

function stringAttr(node: ProseMirrorNode, name: string): string {
	const value: unknown = node.attrs[name];
	return typeof value === "string" ? value : "";
}

/** Visible text for inline atoms, which have no text content of their own. */
function leafText(node: ProseMirrorNode): string {
	switch (node.type.name) {
		case "hardBreak":
			return "\n";
		case "wikiLink": {
			const anchorKind = stringAttr(node, "anchorKind");
			return wikiLinkDisplayName({
				target: stringAttr(node, "target"),
				alias: stringAttr(node, "alias") || null,
				anchor: stringAttr(node, "anchor") || null,
				anchorKind: anchorKind === "heading" || anchorKind === "block" ? anchorKind : "none",
			});
		}
		case "inlineMath":
			return inlineMathMarkdown(stringAttr(node, "latex"));
		case "image":
			return stringAttr(node, "alt") || stringAttr(node, "src");
		default:
			return "";
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function wrapMark(html: string, mark: Mark): string {
	switch (mark.type.name) {
		case "bold":
			return `<strong>${html}</strong>`;
		case "italic":
			return `<em>${html}</em>`;
		case "strike":
			return `<s>${html}</s>`;
		case "underline":
			return `<u>${html}</u>`;
		case "code":
			return `<code>${html}</code>`;
		case "link": {
			const href: unknown = mark.attrs.href;
			if (typeof href !== "string" || !SAFE_HREF_RE.test(href)) return html;
			return `<a href="${escapeHtml(href)}">${html}</a>`;
		}
		default:
			return html;
	}
}

function textblockHtml(block: ProseMirrorNode): string {
	let html = "";
	block.forEach((child) => {
		const text = child.isText ? (child.text ?? "") : leafText(child);
		const escaped = escapeHtml(text).replace(/\n/g, "<br>");
		html += child.marks.reduce(wrapMark, escaped);
	});
	return html;
}

function cellHtml(cell: ProseMirrorNode): string {
	const blocks: string[] = [];
	cell.descendants((node) => {
		if (!node.isTextblock) return true;
		blocks.push(textblockHtml(node));
		return false;
	});
	return blocks.join("<br>");
}

export function cellText(cell: ProseMirrorNode): string {
	return cell.textBetween(0, cell.content.size, "\n", leafText);
}

function spanAttr(cell: ProseMirrorNode, name: "colspan" | "rowspan"): number {
	const value: unknown = cell.attrs[name];
	return typeof value === "number" && value > 1 ? value : 1;
}

/** Flattens a table node into a grid, resolving merged cells via TableMap. */
export function tableToGrid(table: ProseMirrorNode): TableGrid {
	const map = TableMap.get(table);
	const seen = new Set<number>();
	const grid: TableGrid = [];
	for (let row = 0; row < map.height; row++) {
		const cells: (TableGridCell | null)[] = [];
		for (let col = 0; col < map.width; col++) {
			const pos = map.map[row * map.width + col];
			const cell = pos === undefined || seen.has(pos) ? null : table.nodeAt(pos);
			if (pos !== undefined) seen.add(pos);
			cells.push(
				cell
					? {
							text: cellText(cell),
							html: cellHtml(cell),
							header: cell.type.name === "tableHeader",
							colspan: spanAttr(cell, "colspan"),
							rowspan: spanAttr(cell, "rowspan"),
						}
					: null,
			);
		}
		grid.push(cells);
	}
	return grid;
}
