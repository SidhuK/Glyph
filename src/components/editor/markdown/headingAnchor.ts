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
		.replace(/[^\w\s-]/g, "")
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

	const counts = new Map<string, number>();
	let textMatch: TOCHeading | null = null;

	for (const heading of headings) {
		const base = slugifyHeading(heading.text);
		const seen = counts.get(base) ?? 0;
		counts.set(base, seen + 1);
		const slug = seen === 0 ? base : `${base}-${seen}`;
		if (slug === normalized) return heading;
		if (!textMatch && heading.text.trim().toLowerCase() === normalized) {
			textMatch = heading;
		}
	}

	return textMatch;
}
