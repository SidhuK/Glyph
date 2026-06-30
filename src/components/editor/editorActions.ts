import { EDITOR_TEXT_COLORS } from "./textColors";
import { EDITOR_TEXT_HIGHLIGHTS } from "./textHighlights";

type EditorActionId = string;

interface EditorActionDefinition {
	id: EditorActionId;
	label: string;
}

const BASE_EDITOR_ACTIONS: EditorActionDefinition[] = [
	{
		id: "bold",
		label: "Bold",
	},
	{
		id: "italic",
		label: "Italic",
	},
	{
		id: "underline",
		label: "Underline",
	},
	{
		id: "strikethrough",
		label: "Strikethrough",
	},
	{
		id: "heading_1",
		label: "Heading 1",
	},
	{
		id: "heading_2",
		label: "Heading 2",
	},
	{
		id: "heading_3",
		label: "Heading 3",
	},
	{
		id: "collapse_all_headings",
		label: "Collapse All Headings",
	},
	{
		id: "expand_all_headings",
		label: "Expand All Headings",
	},
	{
		id: "bullet_list",
		label: "Bullet List",
	},
	{
		id: "numbered_list",
		label: "Numbered List",
	},
	{
		id: "todo_list",
		label: "To-do List",
	},
	{
		id: "quote",
		label: "Quote",
	},
	{
		id: "code_block",
		label: "Code Block",
	},
	{
		id: "mermaid_chart",
		label: "Mermaid Chart",
	},
	{
		id: "table",
		label: "Table",
	},
	{
		id: "divider",
		label: "Divider",
	},
	{
		id: "details_block",
		label: "Details Block",
	},
	{
		id: "callout_info",
		label: "Info Callout",
	},
	{
		id: "callout_warning",
		label: "Warning Callout",
	},
	{
		id: "callout_error",
		label: "Error Callout",
	},
	{
		id: "callout_success",
		label: "Success Callout",
	},
	{
		id: "callout_tip",
		label: "Tip Callout",
	},
	{
		id: "link_set",
		label: "Insert or Edit Link",
	},
	{
		id: "link_clear",
		label: "Remove Link",
	},
	{
		id: "extract_selection_to_note",
		label: "Extract to Note",
	},
	{
		id: "color_clear",
		label: "Clear Text Color",
	},
	{
		id: "highlight_clear",
		label: "Clear Highlight",
	},
];

export const EDITOR_ACTIONS: EditorActionDefinition[] = [
	...BASE_EDITOR_ACTIONS,
	...EDITOR_TEXT_COLORS.map<EditorActionDefinition>((color) => ({
		id: `color_${color.id}`,
		label: `Text Color: ${color.label}`,
	})),
	...EDITOR_TEXT_HIGHLIGHTS.map<EditorActionDefinition>((highlight) => ({
		id: `highlight_${highlight.id}`,
		label: `Highlight: ${highlight.label}`,
	})),
];
