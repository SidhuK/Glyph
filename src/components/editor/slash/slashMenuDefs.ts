import {
	Alert02Icon,
	BlocksIcon,
	BulbIcon,
	CancelCircleIcon,
	CheckmarkCircle02Icon,
	CodeSquareIcon,
	EraserIcon,
	FlowchartIcon,
	FunctionOfXIcon,
	Heading1,
	Heading2,
	Heading3,
	HeadingIcon,
	HighlighterIcon,
	HtmlFiveIcon,
	InformationCircleIcon,
	LeftToRightBlockQuoteIcon,
	LeftToRightListBulletIcon,
	LeftToRightListDashIcon,
	LeftToRightListNumberIcon,
	ListChecks,
	ListChevronsDownUpIcon,
	MathIcon,
	NotepadTextDashedIcon,
	PenToolIcon,
	SeparatorHorizontalIcon,
	SourceCodeIcon,
	StickyNote01Icon,
	SummationIcon,
	TableIcon,
	TextClearIcon,
	TextColorIcon,
} from "@hugeicons/core-free-icons";
import { type EditorActionId, executeEditorAction } from "../editorActions";
import { INLINE_TOC_EDITOR_MARKER } from "../markdown/inlineTocMarkdown";
import { EDITOR_TEXT_COLORS } from "../textColors";
import { EDITOR_TEXT_HIGHLIGHTS } from "../textHighlights";
import { insertMathAndOpen, requestTemplateInsertion } from "./slashCommandActions";
import type { SlashCommandDef, SlashCommandGroupDef } from "./slashMenuItems";

type SlashCommandMeta = Omit<SlashCommandDef, "command">;

const SWATCH_GLYPH = "A";

function capitalize(value: string): string {
	return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function embedCommand({
	language,
	starterText,
	...meta
}: SlashCommandMeta & { language: "html" | "svg"; starterText: string }): SlashCommandDef {
	return {
		...meta,
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertContent({
					type: "codeBlock",
					attrs: { language },
					content: [{ type: "text", text: starterText }],
				})
				.run(),
	};
}

function actionCommand({
	action,
	...meta
}: SlashCommandMeta & { action: EditorActionId }): SlashCommandDef {
	return {
		...meta,
		command: ({ editor, range }) => {
			executeEditorAction({
				action,
				editor,
				chain: editor.chain().focus().deleteRange(range),
			});
		},
	};
}

function calloutTone(cssVar: string) {
	return {
		color: `var(${cssVar})`,
		background: `color-mix(in srgb, var(${cssVar}) 14%, transparent)`,
	};
}

export const SLASH_MENU: (SlashCommandDef | SlashCommandGroupDef)[] = [
	{
		groupId: "headings",
		icon: HeadingIcon,
		children: [
			actionCommand({
				id: "heading1",
				icon: Heading1,
				keywords: ["h1", "header", "title"],
				action: "heading_1",
			}),
			actionCommand({
				id: "heading2",
				icon: Heading2,
				keywords: ["h2", "header"],
				action: "heading_2",
			}),
			actionCommand({
				id: "heading3",
				icon: Heading3,
				keywords: ["h3", "header"],
				action: "heading_3",
			}),
		],
	},
	{
		groupId: "lists",
		icon: LeftToRightListBulletIcon,
		children: [
			actionCommand({
				id: "bulletList",
				icon: LeftToRightListBulletIcon,
				keywords: ["ul", "bullet", "list"],
				action: "bullet_list",
			}),
			actionCommand({
				id: "numberedList",
				icon: LeftToRightListNumberIcon,
				keywords: ["ol", "ordered", "list"],
				action: "numbered_list",
			}),
			actionCommand({
				id: "todoList",
				icon: ListChecks,
				keywords: ["todo", "task", "checklist", "list"],
				action: "todo_list",
			}),
		],
	},
	actionCommand({
		id: "table",
		icon: TableIcon,
		keywords: ["table", "columns", "rows", "grid"],
		action: "table",
	}),
	{
		groupId: "blocks",
		icon: BlocksIcon,
		children: [
			actionCommand({
				id: "quote",
				icon: LeftToRightBlockQuoteIcon,
				keywords: ["blockquote", "quote"],
				action: "quote",
			}),
			actionCommand({
				id: "codeBlock",
				icon: SourceCodeIcon,
				keywords: ["code", "block"],
				action: "code_block",
			}),
			actionCommand({
				id: "divider",
				icon: SeparatorHorizontalIcon,
				keywords: ["hr", "divider", "rule"],
				action: "divider",
			}),
			actionCommand({
				id: "detailsBlock",
				icon: ListChevronsDownUpIcon,
				keywords: ["details", "toggle", "collapse", "accordion", "summary"],
				action: "details_block",
			}),
			{
				id: "tableOfContents",
				icon: LeftToRightListDashIcon,
				keywords: ["toc", "outline", "contents", "headings", "navigation"],
				command: ({ editor, range }) =>
					editor
						.chain()
						.focus()
						.deleteRange(range)
						.insertContent([
							{
								type: "paragraph",
								content: [{ type: "text", text: INLINE_TOC_EDITOR_MARKER }],
							},
							{ type: "paragraph" },
						])
						.run(),
			},
		],
	},
	{
		groupId: "callouts",
		icon: StickyNote01Icon,
		children: [
			actionCommand({
				id: "calloutInfo",
				icon: InformationCircleIcon,
				tone: calloutTone("--callout-info"),
				keywords: ["callout", "info", "admonition"],
				action: "callout_info",
			}),
			actionCommand({
				id: "calloutTip",
				icon: BulbIcon,
				tone: calloutTone("--callout-tip"),
				keywords: ["callout", "tip", "hint", "admonition"],
				action: "callout_tip",
			}),
			actionCommand({
				id: "calloutSuccess",
				icon: CheckmarkCircle02Icon,
				tone: calloutTone("--callout-tip"),
				keywords: ["callout", "success", "done", "admonition"],
				action: "callout_success",
			}),
			actionCommand({
				id: "calloutWarning",
				icon: Alert02Icon,
				tone: calloutTone("--callout-warning"),
				keywords: ["callout", "warning", "warn", "admonition"],
				action: "callout_warning",
			}),
			actionCommand({
				id: "calloutError",
				icon: CancelCircleIcon,
				tone: calloutTone("--callout-error"),
				keywords: ["callout", "error", "danger", "admonition"],
				action: "callout_error",
			}),
		],
	},
	{
		groupId: "math",
		icon: MathIcon,
		children: [
			{
				id: "mathInline",
				icon: FunctionOfXIcon,
				keywords: ["latex", "math", "formula", "equation", "inline"],
				command: ({ editor, range, onMathEditRequest }) =>
					insertMathAndOpen(editor, range, "inline", onMathEditRequest),
			},
			{
				id: "mathDisplay",
				icon: SummationIcon,
				keywords: ["latex", "math", "formula", "equation", "block", "display"],
				command: ({ editor, range, onMathEditRequest }) =>
					insertMathAndOpen(editor, range, "block", onMathEditRequest),
			},
		],
	},
	{
		groupId: "embeds",
		icon: CodeSquareIcon,
		children: [
			actionCommand({
				id: "mermaidChart",
				icon: FlowchartIcon,
				keywords: ["mermaid", "diagram", "flowchart", "graph"],
				action: "mermaid_chart",
			}),
			embedCommand({
				id: "htmlEmbed",
				icon: HtmlFiveIcon,
				keywords: ["html", "embed", "widget", "preview"],
				language: "html",
				starterText:
					'<div id="app"></div>\n<style>\n  #app { padding: 16px; }\n</style>\n<script>\n  document.querySelector("#app").textContent = "Live HTML block";\n</script>',
			}),
			embedCommand({
				id: "svgEmbed",
				icon: PenToolIcon,
				keywords: ["svg", "vector", "graphic", "embed", "preview"],
				language: "svg",
				starterText:
					'<svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg">\n  <rect width="200" height="80" rx="12" fill="tomato" />\n  <text x="100" y="48" text-anchor="middle">Glyph</text>\n</svg>',
			}),
		],
	},
	{
		groupId: "textColor",
		icon: TextColorIcon,
		children: [
			...EDITOR_TEXT_COLORS.map((color) =>
				actionCommand({
					id: `color${capitalize(color.id)}`,
					icon: SWATCH_GLYPH,
					tone: { color: `var(${color.cssVar}, ${color.fallbackHex})` },
					keywords: ["color", "text", color.id],
					action: `color_${color.id}`,
				}),
			),
			actionCommand({
				id: "colorClear",
				icon: TextClearIcon,
				keywords: ["color", "text", "clear", "reset"],
				action: "color_clear",
			}),
		],
	},
	{
		groupId: "highlight",
		icon: HighlighterIcon,
		children: [
			...EDITOR_TEXT_HIGHLIGHTS.map((highlight) =>
				actionCommand({
					id: `highlight${capitalize(highlight.id)}`,
					icon: SWATCH_GLYPH,
					tone: {
						background: `var(${highlight.backgroundCssVar}, ${highlight.backgroundFallback})`,
					},
					keywords: ["highlight", "text", highlight.id],
					action: `highlight_${highlight.id}`,
				}),
			),
			actionCommand({
				id: "highlightClear",
				icon: EraserIcon,
				keywords: ["highlight", "text", "clear", "reset"],
				action: "highlight_clear",
			}),
		],
	},
	{
		id: "insertTemplate",
		icon: NotepadTextDashedIcon,
		keywords: ["template", "snippet", "date", "time", "title", "title_slug"],
		command: requestTemplateInsertion,
	},
];
