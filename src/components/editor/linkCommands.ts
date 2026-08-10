import type { Editor } from "@tiptap/core";

export interface EditorLinkState {
	href: string;
	range: { from: number; to: number } | null;
	target: "_self" | "_blank";
}

export function normalizeEditorHref(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (
		trimmed.startsWith("http://") ||
		trimmed.startsWith("https://") ||
		trimmed.startsWith("mailto:") ||
		trimmed.startsWith("tel:") ||
		trimmed.startsWith("#") ||
		trimmed.startsWith("/")
	) {
		return trimmed;
	}
	return `https://${trimmed}`;
}

function selectLinkRange(
	chain: ReturnType<Editor["chain"]>,
	range: EditorLinkState["range"],
) {
	if (range) chain.setTextSelection(range);
	return chain.extendMarkRange("link");
}

export function applyEditorLink(
	chain: ReturnType<Editor["chain"]>,
	{ href: rawHref, range, target }: EditorLinkState,
): boolean {
	const href = normalizeEditorHref(rawHref);
	const linkChain = selectLinkRange(chain, range);
	if (!href) return linkChain.unsetLink().run();
	return linkChain
		.setLink({
			href,
			target,
			rel: target === "_blank" ? "noopener noreferrer" : undefined,
		})
		.run();
}

export function removeEditorLink(
	chain: ReturnType<Editor["chain"]>,
	range: EditorLinkState["range"],
): boolean {
	return selectLinkRange(chain, range).unsetLink().run();
}
