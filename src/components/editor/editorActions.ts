import { EDITOR_TEXT_COLORS } from "./textColors";
import { EDITOR_TEXT_HIGHLIGHTS } from "./textHighlights";

export type EditorActionId = string;
export type EditorActionCategory =
	| "format"
	| "structure"
	| "insert"
	| "callout"
	| "color"
	| "highlight"
	| "link";

export interface EditorActionDefinition {
	id: EditorActionId;
	label: string;
	description: string;
	category: EditorActionCategory;
	menuId: string;
}

const BASE_EDITOR_ACTIONS: EditorActionDefinition[] = [
	{
		id: "bold",
		label: "Bold",
		description: "Toggle bold formatting for the current selection.",
		category: "format",
		menuId: "editor.bold",
	},
	{
		id: "italic",
		label: "Italic",
		description: "Toggle italic formatting for the current selection.",
		category: "format",
		menuId: "editor.italic",
	},
	{
		id: "underline",
		label: "Underline",
		description: "Toggle underline formatting for the current selection.",
		category: "format",
		menuId: "editor.underline",
	},
	{
		id: "strikethrough",
		label: "Strikethrough",
		description: "Toggle strikethrough formatting for the current selection.",
		category: "format",
		menuId: "editor.strikethrough",
	},
	{
		id: "heading_1",
		label: "Heading 1",
		description: "Convert the current block to a level 1 heading.",
		category: "structure",
		menuId: "editor.heading_1",
	},
	{
		id: "heading_2",
		label: "Heading 2",
		description: "Convert the current block to a level 2 heading.",
		category: "structure",
		menuId: "editor.heading_2",
	},
	{
		id: "heading_3",
		label: "Heading 3",
		description: "Convert the current block to a level 3 heading.",
		category: "structure",
		menuId: "editor.heading_3",
	},
	{
		id: "collapse_all_headings",
		label: "Collapse All Headings",
		description: "Collapse every heading in the current note.",
		category: "structure",
		menuId: "editor.collapse_all_headings",
	},
	{
		id: "expand_all_headings",
		label: "Expand All Headings",
		description: "Expand every heading in the current note.",
		category: "structure",
		menuId: "editor.expand_all_headings",
	},
	{
		id: "bullet_list",
		label: "Bullet List",
		description: "Toggle a bullet list.",
		category: "structure",
		menuId: "editor.bullet_list",
	},
	{
		id: "numbered_list",
		label: "Numbered List",
		description: "Toggle a numbered list.",
		category: "structure",
		menuId: "editor.numbered_list",
	},
	{
		id: "todo_list",
		label: "To-do List",
		description: "Toggle a task list.",
		category: "structure",
		menuId: "editor.todo_list",
	},
	{
		id: "quote",
		label: "Quote",
		description: "Toggle a blockquote.",
		category: "insert",
		menuId: "editor.quote",
	},
	{
		id: "code_block",
		label: "Code Block",
		description: "Toggle a code block.",
		category: "insert",
		menuId: "editor.code_block",
	},
	{
		id: "mermaid_chart",
		label: "Mermaid Chart",
		description: "Insert a Mermaid code block.",
		category: "insert",
		menuId: "editor.mermaid_chart",
	},
	{
		id: "table",
		label: "Table",
		description: "Insert a markdown table.",
		category: "insert",
		menuId: "editor.table",
	},
	{
		id: "divider",
		label: "Divider",
		description: "Insert a horizontal divider.",
		category: "insert",
		menuId: "editor.divider",
	},
	{
		id: "callout_info",
		label: "Info Callout",
		description: "Insert an info callout block.",
		category: "callout",
		menuId: "editor.callout_info",
	},
	{
		id: "callout_warning",
		label: "Warning Callout",
		description: "Insert a warning callout block.",
		category: "callout",
		menuId: "editor.callout_warning",
	},
	{
		id: "callout_error",
		label: "Error Callout",
		description: "Insert an error callout block.",
		category: "callout",
		menuId: "editor.callout_error",
	},
	{
		id: "callout_success",
		label: "Success Callout",
		description: "Insert a success callout block.",
		category: "callout",
		menuId: "editor.callout_success",
	},
	{
		id: "callout_tip",
		label: "Tip Callout",
		description: "Insert a tip callout block.",
		category: "callout",
		menuId: "editor.callout_tip",
	},
	{
		id: "link_set",
		label: "Insert or Edit Link",
		description: "Insert a link or edit the current link.",
		category: "link",
		menuId: "editor.link_set",
	},
	{
		id: "link_clear",
		label: "Remove Link",
		description: "Remove the current link from the selection.",
		category: "link",
		menuId: "editor.link_clear",
	},
	{
		id: "color_clear",
		label: "Clear Text Color",
		description: "Remove text color formatting.",
		category: "color",
		menuId: "editor.color_clear",
	},
	{
		id: "highlight_clear",
		label: "Clear Highlight",
		description: "Remove text highlight formatting.",
		category: "highlight",
		menuId: "editor.highlight_clear",
	},
];

export const EDITOR_ACTIONS: EditorActionDefinition[] = [
	...BASE_EDITOR_ACTIONS,
	...EDITOR_TEXT_COLORS.map<EditorActionDefinition>((color) => ({
		id: `color_${color.id}`,
		label: `Text Color: ${color.label}`,
		description: `Apply ${color.label.toLowerCase()} text color.`,
		category: "color",
		menuId: `editor.color_${color.id}`,
	})),
	...EDITOR_TEXT_HIGHLIGHTS.map<EditorActionDefinition>((highlight) => ({
		id: `highlight_${highlight.id}`,
		label: `Highlight: ${highlight.label}`,
		description: `Apply ${highlight.label.toLowerCase()} text highlight.`,
		category: "highlight",
		menuId: `editor.highlight_${highlight.id}`,
	})),
];

const EDITOR_ACTION_RECORD: Record<string, EditorActionDefinition> =
	Object.fromEntries(EDITOR_ACTIONS.map((action) => [action.id, action]));

export function isEditorActionId(value: string): value is EditorActionId {
	return value in EDITOR_ACTION_RECORD;
}

export function getEditorActionDefinition(actionId: EditorActionId) {
	return EDITOR_ACTION_RECORD[actionId];
}
