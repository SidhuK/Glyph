export interface SearchJumpRequest {
	path: string;
	query: string;
	matchIndex: number;
	targetPaneId: string;
}

export const SEARCH_JUMP_EVENT = "glyph:search-jump";

let pending: SearchJumpRequest | null = null;

export function requestSearchJump(request: SearchJumpRequest): void {
	const next: SearchJumpRequest = {
		path: request.path,
		query: request.query,
		matchIndex: Math.max(0, request.matchIndex),
		targetPaneId: request.targetPaneId,
	};
	pending = next;
	window.dispatchEvent(new CustomEvent(SEARCH_JUMP_EVENT, { detail: next }));
}

/** Consume a pending jump for a note in a specific editor pane (once). */
export function consumeSearchJump(
	path: string,
	targetPaneId: string,
): SearchJumpRequest | null {
	if (
		!pending ||
		pending.path !== path ||
		pending.targetPaneId !== targetPaneId
	)
		return null;
	const next = pending;
	pending = null;
	return next;
}
