/** Canonical `glyph://` types and builders. Keep this module dependency-free. */

export type DeeplinkAction =
	| { kind: "open_note"; space: string; path: string }
	| { kind: "open_space"; space: string }
	| { kind: "search"; space: string; q: string }
	| { kind: "open_daily_note"; space: string };

/**
 * A dispatched action carries a process-unique id so the frontend can discard
 * the pending-queue mirror of an action it already handled live.
 */
export type DeeplinkEvent = DeeplinkAction & { id: number };

/** Mirrors `DeeplinkError::code()`; unknown values fall back to "malformed". */
export type DeeplinkErrorPayload = { id: number; code: string };

export type PendingDeeplinks = {
	actions: DeeplinkEvent[];
	errors: DeeplinkErrorPayload[];
};

function encodeQueryValue(value: string): string {
	return encodeURIComponent(value).replace(/%2F/gi, "/");
}

function buildQuery(params: Record<string, string>): string {
	return Object.entries(params)
		.map(
			([key, value]) => `${encodeURIComponent(key)}=${encodeQueryValue(value)}`,
		)
		.join("&");
}

/** Build a canonical note deeplink for the file-tree copy action. */
export function buildNoteDeeplink(spacePath: string, relPath: string): string {
	const space = spacePath.trim();
	const path = relPath.trim().replace(/\\/g, "/").replace(/^\/+/, "");
	if (!space) {
		throw new Error("No space is open.");
	}
	if (!path) {
		throw new Error("Note path is empty.");
	}
	return `glyph://open/note?${buildQuery({ space, path })}`;
}

export function isGlyphDeeplink(href: string): boolean {
	return /^glyph:/i.test(href.trim());
}

/**
 * Compare space paths the way the filesystem does: separators and a trailing
 * slash are cosmetic, but case is not. Both sides are canonicalized natively,
 * so no further normalization is warranted.
 */
export function isSameSpacePath(left: string | null, right: string): boolean {
	if (!left) return false;
	const normalize = (value: string) =>
		value.replace(/\\/g, "/").replace(/\/+$/, "");
	return normalize(left) === normalize(right);
}
