const EDITOR_OVERLAY_SELECTOR =
	".slashCommandMenu, .wikiLinkSuggestionMenu, .editorColorDropdown[data-open], .tableInlineControlsMenu[data-open]";

export function isEditorOverlayOpen(root: ParentNode = document): boolean {
	return Boolean(root.querySelector(EDITOR_OVERLAY_SELECTOR));
}
