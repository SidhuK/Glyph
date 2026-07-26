export const AI_CONTEXT_ATTACH_EVENT = "glyph:ai-context-attach";

export type AiSelectionApplyResult =
	| "applied"
	| "selection-changed"
	| "failed";

export interface AiSelectionContext {
	label: string;
	text: string;
	applyResponse: (
		mode: "replace" | "insert",
		markdown: string,
	) => AiSelectionApplyResult;
}

export interface AiContextAttachDetail {
	paths?: string[];
	selection?: AiSelectionContext;
}

let pendingSelectionContext: AiSelectionContext | null = null;

export function consumePendingAiSelectionContext(): AiSelectionContext | null {
	const pending = pendingSelectionContext;
	pendingSelectionContext = null;
	return pending;
}

export function dispatchAiContextAttach(detail: AiContextAttachDetail): void {
	if (detail.selection) {
		pendingSelectionContext = detail.selection;
	}
	window.dispatchEvent(
		new CustomEvent<AiContextAttachDetail>(AI_CONTEXT_ATTACH_EVENT, { detail }),
	);
}
