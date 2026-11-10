import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { DiffSegment, NoteDiff, NoteDiffRow } from "../../lib/noteDiff";

/** Inline markdown worth drawing in a diff: code, bold, wiki links, links and emphasis. */
const INLINE_MARKDOWN =
	/(`+)\s?(.+?)\s?\1|\*\*(.+?)\*\*|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\([^)]*\)|(?<![\w*])\*([^*\s][^*]*)\*(?![\w*])/g;

function renderInline(text: string): ReactNode[] {
	const nodes: ReactNode[] = [];
	let cursor = 0;
	for (const match of text.matchAll(INLINE_MARKDOWN)) {
		if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
		const [whole, , code, bold, wikiTarget, wikiAlias, linkText, emphasis] = match;
		const key = `${match.index}:${whole}`;
		if (code !== undefined) nodes.push(<code key={key}>{code}</code>);
		else if (bold !== undefined) nodes.push(<strong key={key}>{bold}</strong>);
		else if (emphasis !== undefined) nodes.push(<em key={key}>{emphasis}</em>);
		else {
			nodes.push(
				<span key={key} className="gitVersionLink">
					{linkText ?? wikiAlias ?? wikiTarget}
				</span>,
			);
		}
		cursor = match.index + whole.length;
	}
	if (cursor < text.length) nodes.push(text.slice(cursor));
	return nodes;
}

function Segments({ segments }: { segments: DiffSegment[] }) {
	return segments.map((segment, index) => {
		const key = `${index}:${segment.kind}`;
		if (segment.kind === "add") return <ins key={key}>{renderInline(segment.text)}</ins>;
		if (segment.kind === "delete") return <del key={key}>{renderInline(segment.text)}</del>;
		return <span key={key}>{renderInline(segment.text)}</span>;
	});
}

const MARKS = { add: "+", delete: "−", change: "", context: "" } as const;

function Block({ row }: { row: Exclude<NoteDiffRow, { kind: "fold" }> }) {
	const { block, cells } = row;
	// Whole-line adds and removals are marked by the row itself, not word by word.
	const cell = (segments: DiffSegment[]) =>
		row.kind === "change" ? (
			<Segments segments={segments} />
		) : (
			renderInline(segments.map((segment) => segment.text).join(""))
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
	if (diff.rows.length === 0) {
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
