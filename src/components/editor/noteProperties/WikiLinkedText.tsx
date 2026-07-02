import type { ReactNode } from "react";
import {
	type WikiLinkClickDetail,
	dispatchWikiLinkClick,
} from "../markdown/editorEvents";
import { findWikiLinkSpans, parseWikiLink } from "../markdown/wikiLinkCodec";

function displayNameForTarget(target: string): string {
	return target.split("/").pop()?.replace(/\.md$/i, "") || target;
}

function clickDetailFromRaw(raw: string): WikiLinkClickDetail | null {
	const parsed = parseWikiLink(raw);
	if (!parsed) return null;
	return {
		raw: parsed.raw,
		target: parsed.target,
		alias: parsed.alias,
		anchorKind: parsed.anchorKind,
		anchor: parsed.anchor,
		unresolved: parsed.unresolved,
		embed: parsed.embed,
	};
}

export function WikiLinkedText({ value }: { value: string }) {
	const spans = findWikiLinkSpans(value);
	if (!spans.length) return <>{value}</>;

	const nodes: ReactNode[] = [];
	let cursor = 0;
	for (const span of spans) {
		if (cursor < span.start) {
			nodes.push(value.slice(cursor, span.start));
		}
		const detail = clickDetailFromRaw(span.raw);
		if (!detail) {
			nodes.push(span.raw);
		} else {
			nodes.push(
				<button
					key={`${span.start}:${span.end}`}
					type="button"
					className="wikiLink notePropertyWikiLink"
					data-target={detail.target}
					data-unresolved={String(detail.unresolved)}
					onClick={() => dispatchWikiLinkClick(detail)}
					title={detail.target}
				>
					<span className="wikiLinkIcon" aria-hidden="true" />
					<span className="wikiLinkLabel">
						{detail.alias || displayNameForTarget(detail.target)}
					</span>
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
