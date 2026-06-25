const EDITOR_OVERLAY_SELECTOR =
	'.slashCommandMenu, .wikiLinkSuggestionMenu, [role="menu"][data-state="open"], [data-radix-menu-content][data-state="open"]';

export function isEditorOverlayOpen(root: ParentNode = document): boolean {
	return Boolean(root.querySelector(EDITOR_OVERLAY_SELECTOR));
}
