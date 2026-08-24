import type { ReactNode } from "react";
import { dispatchWikiLinkClick } from "../markdown/editorEvents";
import {
	findWikiLinkSpans,
	parseWikiLink,
	wikiLinkDisplayName,
} from "../markdown/wikiLinkCodec";

interface WikiLinkedTextProps {
	value: string;
	sourcePath?: string | null;
}

export function WikiLinkedText({ value, sourcePath }: WikiLinkedTextProps) {
	const spans = findWikiLinkSpans(value);
	if (!spans.length) return <>{value}</>;

	const nodes: ReactNode[] = [];
	let cursor = 0;
	for (const span of spans) {
		if (cursor < span.start) {
			nodes.push(value.slice(cursor, span.start));
		}
		const detail = parseWikiLink(span.raw);
		if (!detail) {
			nodes.push(span.raw);
		} else {
			const label = wikiLinkDisplayName(detail);
			nodes.push(
				<button
					key={`${span.start}:${span.end}`}
					type="button"
					className="wikiLink notePropertyWikiLink"
					data-target={detail.target}
					data-unresolved={String(detail.unresolved)}
					onClick={() =>
						dispatchWikiLinkClick(
							sourcePath == null ? detail : { ...detail, sourcePath },
						)
					}
					title={label}
				>
					<span className="wikiLinkIcon" aria-hidden="true" />
					<span className="wikiLinkLabel">{label}</span>
				</button>,
			);
		}
		cursor = span.end;
	}
	if (cursor < value.length) {
		nodes.push(value.slice(cursor));
	}
	return <span className="notePropertyWikiText">{nodes}</span>;
}
