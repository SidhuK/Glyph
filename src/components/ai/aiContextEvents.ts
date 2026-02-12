export const AI_CONTEXT_ATTACH_EVENT = "lattice:ai-context-attach";

export interface AiContextAttachDetail {
	paths: string[];
}

export function dispatchAiContextAttach(detail: AiContextAttachDetail): void {
	window.dispatchEvent(
		new CustomEvent<AiContextAttachDetail>(AI_CONTEXT_ATTACH_EVENT, { detail }),
	);
}
