export interface SearchJumpRequest {
	path: string;
	query: string;
	matchIndex: number;
}

export const SEARCH_JUMP_EVENT = "glyph:search-jump";

let pending: SearchJumpRequest | null = null;

export function requestSearchJump(request: SearchJumpRequest): void {
	const next: SearchJumpRequest = {
		path: request.path,
		query: request.query,
		matchIndex: Math.max(0, request.matchIndex),
	};
	pending = next;
	window.dispatchEvent(new CustomEvent(SEARCH_JUMP_EVENT, { detail: next }));
}

/** Consume a pending jump for a note path (once). */
export function consumeSearchJump(path: string): SearchJumpRequest | null {
	if (!pending || pending.path !== path) return null;
	const next = pending;
	pending = null;
	return next;
}

export function peekSearchJump(path: string): SearchJumpRequest | null {
	if (!pending || pending.path !== path) return null;
	return pending;
}
