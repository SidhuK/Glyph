import type { Editor } from "@tiptap/core";

const EDITOR_SCROLL_HOST_SELECTOR = ".rfNodeNoteEditorBody";

type UnlockEditorScroll = () => void;
type SuggestionMenuGetter = () => HTMLElement | null;

export function lockEditorScrollDuringSuggestion(
	editor: Editor,
	getSuggestionMenu?: SuggestionMenuGetter,
): UnlockEditorScroll {
	const host = editor.view.dom.closest<HTMLElement>(
		EDITOR_SCROLL_HOST_SELECTOR,
	);
	if (!host) return () => {};

	const scrollTop = host.scrollTop;
	const scrollLeft = host.scrollLeft;

	const restoreScroll = () => {
		host.scrollTop = scrollTop;
		host.scrollLeft = scrollLeft;
	};
	const preventDocumentScroll = (event: Event) => {
		const target = event.target;
		const menu = getSuggestionMenu?.();
		if (menu && target instanceof Node && menu.contains(target)) return;
		event.preventDefault();
	};

	host.addEventListener("scroll", restoreScroll);
	document.addEventListener("wheel", preventDocumentScroll, {
		capture: true,
		passive: false,
	});
	document.addEventListener("touchmove", preventDocumentScroll, {
		capture: true,
		passive: false,
	});
	restoreScroll();

	return () => {
		host.removeEventListener("scroll", restoreScroll);
		document.removeEventListener("wheel", preventDocumentScroll, {
			capture: true,
		});
		document.removeEventListener("touchmove", preventDocumentScroll, {
			capture: true,
		});
	};
}
