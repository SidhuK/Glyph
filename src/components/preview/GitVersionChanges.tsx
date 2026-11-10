import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DiffSegment, NoteDiff, NoteDiffRow } from "../../lib/noteDiff";

/** Inline markdown worth drawing in a diff: code, bold, wiki links, links and emphasis. */
const INLINE_MARKDOWN =
	/(`+)\s?(.+?)\s?\1|\*\*(.+?)\*\*|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\([^)]*\)|(?<![\w*])\*([^*\s][^*]*)\*(?![\w*])/g;

/** Start of the text a match displays, within the match. */
function innerStart(match: RegExpMatchArray): number {
	const [whole, ticks, code, bold, wikiTarget, wikiAlias] = match;
	if (code !== undefined) return whole.indexOf(code, ticks.length);
	if (wikiAlias !== undefined) return whole.indexOf("|") + 1;
	// `**bold**` and `[[wiki]]` open with two characters, `[link](url)` and `*emphasis*` with one.
	return bold !== undefined || wikiTarget !== undefined ? 2 : 1;
}

/**
 * Markdown is read across the whole line and the added and removed words are marked inside it,
 * so an edit within bold text or a link never leaves its delimiters showing.
 */
function renderInline(segments: DiffSegment[]): ReactNode[] {
	const text = segments.map((segment) => segment.text).join("");
	const marked = (start: number, end: number): ReactNode[] => {
		const nodes: ReactNode[] = [];
		let offset = 0;
		for (const segment of segments) {
			const from = Math.max(start, offset);
			const to = Math.min(end, offset + segment.text.length);
			offset += segment.text.length;
			if (from >= to) continue;
			const slice = text.slice(from, to);
			if (segment.kind === "add") nodes.push(<ins key={from}>{slice}</ins>);
			else if (segment.kind === "delete") nodes.push(<del key={from}>{slice}</del>);
			else nodes.push(slice);
		}
		return nodes;
	};
	const nodes: ReactNode[] = [];
	let cursor = 0;
	for (const match of text.matchAll(INLINE_MARKDOWN)) {
		nodes.push(...marked(cursor, match.index));
		const [whole, , code, bold, wikiTarget, wikiAlias, linkText, emphasis] = match;
		const shown = code ?? bold ?? emphasis ?? linkText ?? wikiAlias ?? wikiTarget;
		const start = match.index + innerStart(match);
		const inner = marked(start, start + shown.length);
		const key = `${match.index}:${whole}`;
		if (code !== undefined) nodes.push(<code key={key}>{inner}</code>);
		else if (bold !== undefined) nodes.push(<strong key={key}>{inner}</strong>);
		else if (emphasis !== undefined) nodes.push(<em key={key}>{inner}</em>);
		else {
			nodes.push(
				<span key={key} className="gitVersionLink">
					{inner}
				</span>,
			);
		}
		cursor = match.index + whole.length;
	}
	nodes.push(...marked(cursor, text.length));
	return nodes;
}

const MARKS = { add: "+", delete: "−", change: "", context: "" } as const;

function Block({ row }: { row: Exclude<NoteDiffRow, { kind: "fold" }> }) {
	const { block, cells } = row;
	// Whole-line adds and removals are marked by the row itself, not word by word.
	const cell = (segments: DiffSegment[]) =>
		renderInline(
			row.kind === "change"
				? segments
				: [{ kind: "same", text: segments.map((segment) => segment.text).join("") }],
		);
	return (
		<div
			className="gitVersionBlock"
			data-kind={row.kind}
			data-block={block.type}
			data-level={block.type === "heading" ? block.level : undefined}
		>
			<span className="gitVersionMark" aria-hidden="true">
				{MARKS[row.kind]}
			</span>
			{block.type === "row" ? (
				<div
					className="gitVersionBlockContent"
					style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
				>
					{cells.map((segments, index) => (
						<span key={`${index}:${segments.length}`}>{cell(segments)}</span>
					))}
				</div>
			) : block.type === "item" ? (
				<div className="gitVersionBlockContent" style={{ paddingInlineStart: block.depth * 18 }}>
					<span className="gitVersionItemMarker">{block.marker}</span>
					<span>{cell(cells[0])}</span>
				</div>
			) : (
				<div className="gitVersionBlockContent">
					{block.type === "code"
						? cells[0].map((segment) => segment.text).join("")
						: cell(cells[0])}
				</div>
			)}
		</div>
	);
}

/** One version's changes, drawn on the rendered note instead of as a raw patch. */
export function GitVersionChanges({ diff }: { diff: NoteDiff }) {
	const { t } = useTranslation("editor");
	if (diff.rows.length === 0 && !diff.created) {
		return <div className="gitVersionNotice">{t("infoSidebar.history.noChanges")}</div>;
	}
	return (
		<>
			{diff.created ? (
				<div className="gitVersionNotice">{t("infoSidebar.history.createdNote")}</div>
			) : null}
			{diff.rows.map((row, index) =>
				row.kind === "fold" ? (
					<div key={`${index}:fold`} className="gitVersionFold">
						{t("infoSidebar.history.unchangedLines", { count: row.count })}
					</div>
				) : (
					<Block
						key={`${index}:${row.kind}`}
						row={diff.created ? { ...row, kind: "context" } : row}
					/>
				),
			)}
		</>
	);
}
