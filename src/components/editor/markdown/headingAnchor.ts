import { normalizeRelPath } from "../../../utils/path";
import type { TOCHeading } from "../hooks/useTableOfContents";

/**
 * Convert a heading's text into a GitHub-style anchor slug, e.g.
 * "Heading 1" -> "heading-1". This mirrors what markdown table-of-contents
 * generators emit so in-document links like `[Heading 1](#heading-1)` resolve.
 */
export function slugifyHeading(text: string): string {
	return text
		.trim()
		.toLowerCase()
		.replace(/[^\p{L}\p{N}_\s-]/gu, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function normalizeAnchor(anchor: string): string {
	let value = anchor.trim();
	if (value.startsWith("#")) value = value.slice(1);
	try {
		value = decodeURIComponent(value);
	} catch {
		// Keep the raw value when it isn't valid percent-encoding.
	}
	return value.trim().toLowerCase();
}

/** Attach GitHub-style disambiguated anchor slugs to a heading list. */
export function withHeadingSlugs(
	headings: readonly TOCHeading[],
): TOCHeading[] {
	const counts = new Map<string, number>();
	return headings.map((heading) => {
		const base = slugifyHeading(heading.text);
		const seen = counts.get(base) ?? 0;
		counts.set(base, seen + 1);
		const slug = seen === 0 ? base : `${base}-${seen}`;
		return { ...heading, slug };
	});
}

/**
 * Resolve an in-document anchor (e.g. "#heading-1") to the heading it targets.
 * Duplicate heading texts are disambiguated the same way GitHub does, by
 * appending "-1", "-2", ... to repeated slugs. Falls back to a case-insensitive
 * exact text match when no slug matches.
 */
export function resolveAnchorHeading(
	headings: readonly TOCHeading[],
	anchor: string,
): TOCHeading | null {
	const normalized = normalizeAnchor(anchor);
	if (!normalized) return null;

	const indexed =
		headings.length > 0 && headings[0]?.slug !== undefined
			? headings
			: withHeadingSlugs(headings);

	for (const heading of indexed) {
		if (heading.slug === normalized) return heading;
	}

	return (
		indexed.find(
			(heading) => heading.text.trim().toLowerCase() === normalized,
		) ?? null
	);
}

type PendingHeadingJump = {
	path: string;
	anchor: string;
};

let pendingHeadingJump: PendingHeadingJump | null = null;

export function requestHeadingNavigation(jump: PendingHeadingJump): void {
	const path = normalizeRelPath(jump.path);
	const anchor = jump.anchor.trim();
	if (!path || !anchor) return;
	pendingHeadingJump = { path, anchor };
}

export function discardPendingHeadingJump(path: string): void {
	const normalized = normalizeRelPath(path);
	if (pendingHeadingJump?.path === normalized) pendingHeadingJump = null;
}

export function applyPendingHeadingJump(options: {
	path: string;
	headings: readonly TOCHeading[];
	selectHeading: (heading: TOCHeading) => void;
}): boolean {
	const path = normalizeRelPath(options.path);
	if (!pendingHeadingJump || pendingHeadingJump.path !== path) return false;
	const heading = resolveAnchorHeading(
		options.headings,
		pendingHeadingJump.anchor,
	);
	if (!heading) return false;
	pendingHeadingJump = null;
	options.selectHeading(heading);
	return true;
}
