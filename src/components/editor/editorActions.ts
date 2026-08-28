import type { Editor, JSONContent } from "@tiptap/core";
import { createDetailsBlockContent } from "./extensions/detailsBlock";
import {
	EDITOR_TEXT_COLORS,
	type EditorTextColor,
	isEditorTextColor,
} from "./textColors";
import {
	EDITOR_TEXT_HIGHLIGHTS,
	type EditorTextHighlight,
	isEditorTextHighlight,
} from "./textHighlights";

const BASE_EDITOR_ACTION_IDS = [
	"ai_selection_to_context",
	"bold",
	"italic",
	"underline",
	"strikethrough",
	"heading_1",
	"heading_2",
	"heading_3",
	"collapse_all_headings",
	"expand_all_headings",
	"toggle_heading_or_list_collapse",
	"bullet_list",
	"numbered_list",
	"todo_list",
	"quote",
	"code_block",
	"mermaid_chart",
	"table",
	"divider",
	"details_block",
	"callout_info",
	"callout_warning",
	"callout_error",
	"callout_success",
	"callout_tip",
	"link_set",
	"link_clear",
	"extract_selection_to_note",
	"color_clear",
	"highlight_clear",
] as const;

type BaseEditorActionId = (typeof BASE_EDITOR_ACTION_IDS)[number];
export type EditorActionId =
	| BaseEditorActionId
	| `color_${EditorTextColor}`
	| `highlight_${EditorTextHighlight}`;

export const EDITOR_ACTIONS: EditorActionId[] = [
	...BASE_EDITOR_ACTION_IDS,
	...EDITOR_TEXT_COLORS.map<`color_${EditorTextColor}`>(
		(color) => `color_${color.id}`,
	),
	...EDITOR_TEXT_HIGHLIGHTS.map<`highlight_${EditorTextHighlight}`>(
		(highlight) => `highlight_${highlight.id}`,
	),
];

type EditorChain = ReturnType<Editor["chain"]>;

interface ExecuteEditorActionOptions {
	action: string;
	editor: Editor;
	chain: EditorChain;
	onOpenLinkDialog?: (href: string, target: "_self" | "_blank") => void;
	onSendSelectionToAi?: () => void;
	onTriggerExtractToNote?: () => void;
}

function normalizeCalloutType(type: string): string {
	return type.toLowerCase() === "warn" ? "warning" : type.toLowerCase();
}

export function createCalloutContent(type: string): JSONContent {
	return {
		type: "blockquote",
		content: [
			{
				type: "paragraph",
				content: [{ type: "text", text: `[!${normalizeCalloutType(type)}]` }],
			},
			{ type: "paragraph" },
		],
	};
}

export function executeEditorAction({
	action,
	editor,
	chain,
	onOpenLinkDialog,
	onSendSelectionToAi,
	onTriggerExtractToNote,
}: ExecuteEditorActionOptions): boolean {
	switch (action) {
		case "bold":
			return chain.toggleBold().run();
		case "italic":
			return chain.toggleItalic().run();
		case "underline":
			return chain.toggleUnderline().run();
		case "strikethrough":
			return chain.toggleStrike().run();
		case "heading_1":
			return chain.toggleHeading({ level: 1 }).run();
		case "heading_2":
			return chain.toggleHeading({ level: 2 }).run();
		case "heading_3":
			return chain.toggleHeading({ level: 3 }).run();
		case "collapse_all_headings":
			return chain.collapseAllHeadings().run();
		case "expand_all_headings":
			return chain.expandAllHeadings().run();
		case "toggle_heading_or_list_collapse":
			return editor.commands.toggleCurrentCollapse();
		case "bullet_list":
			return chain.toggleBulletList().run();
		case "numbered_list":
			return chain.toggleOrderedList().run();
		case "todo_list":
			return chain.toggleTaskList().run();
		case "quote":
			return chain.toggleBlockquote().run();
		case "code_block":
			return chain.toggleCodeBlock().run();
		case "mermaid_chart":
			return chain
				.insertContent({
					type: "codeBlock",
					attrs: { language: "mermaid" },
					content: [
						{ type: "text", text: "flowchart TD\n  A[Start] --> B[End]" },
					],
				})
				.run();
		case "table":
			return chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
		case "divider":
			return chain.setHorizontalRule().run();
		case "details_block":
			return chain.insertContent(createDetailsBlockContent()).run();
		case "callout_info":
		case "callout_warning":
		case "callout_error":
		case "callout_success":
		case "callout_tip":
			return chain
				.insertContent(createCalloutContent(action.slice("callout_".length)))
				.run();
		case "extract_selection_to_note":
			onTriggerExtractToNote?.();
			return true;
		case "ai_selection_to_context":
			onSendSelectionToAi?.();
			return true;
		case "link_set": {
			const linkAttrs = editor.getAttributes("link");
			onOpenLinkDialog?.(
				typeof linkAttrs.href === "string" ? linkAttrs.href : "",
				typeof linkAttrs.target === "string" && linkAttrs.target === "_blank"
					? "_blank"
					: "_self",
			);
			return true;
		}
		case "link_clear":
			return chain.unsetLink().run();
		case "color_clear":
			return chain.unsetTextColor().run();
		case "highlight_clear":
			return chain.unsetTextHighlight().run();
		default: {
			if (action.startsWith("color_")) {
				const color = action.slice("color_".length);
				return isEditorTextColor(color) && chain.setTextColor(color).run();
			}
			if (action.startsWith("highlight_")) {
				const highlight = action.slice("highlight_".length);
				return (
					isEditorTextHighlight(highlight) &&
					chain.setTextHighlight(highlight).run()
				);
			}
			return false;
		}
	}
}
