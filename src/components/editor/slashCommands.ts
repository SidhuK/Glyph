import { type Editor, Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { i18n } from "../../i18n";
import { type EditorActionId, executeEditorAction } from "./editorActions";
import {
	BLOCK_MATH_STARTER,
	INLINE_MATH_STARTER,
	type MathEditRequest,
} from "./extensions/math/mathOptions";
import { INLINE_TOC_EDITOR_MARKER } from "./markdown/inlineTocMarkdown";
import {
	createTipTapSuggestionMenu,
	exitTipTapSuggestion,
} from "./suggestions/tiptapSuggestionMenu";
import { EDITOR_TEXT_COLORS } from "./textColors";
import { EDITOR_TEXT_HIGHLIGHTS } from "./textHighlights";

interface SlashCommandDef {
	id: string;
	icon: string;
	keywords: string[];
	command: (ctx: {
		editor: Editor;
		onMathEditRequest?: (request: MathEditRequest) => void;
		range: { from: number; to: number };
	}) => void;
}

interface SlashCommandItem extends SlashCommandDef {
	title: string;
	description: string;
}

function slashCommandMatchesQuery(item: SlashCommandItem, query: string) {
	const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
	if (!terms.length) return true;
	const searchText = [item.title, ...item.keywords].join(" ").toLowerCase();
	return terms.every((term) => searchText.includes(term));
}

function localizeSlashCommandItem(item: SlashCommandDef): SlashCommandItem {
	return {
		...item,
		title: i18n.t(`editor:slash.${item.id}.title`),
		description: i18n.t(`editor:slash.${item.id}.description`),
	};
}

function createEmbedSlashCommand({
	id,
	icon,
	keywords,
	language,
	starterText,
}: {
	id: string;
	icon: string;
	keywords: string[];
	language: "html" | "svg";
	starterText: string;
}): SlashCommandDef {
	return {
		id,
		icon,
		keywords,
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

function createEditorActionSlashCommand({
	id,
	icon,
	keywords,
	action,
}: {
	id: string;
	icon: string;
	keywords: string[];
	action: EditorActionId;
}): SlashCommandDef {
	return {
		id,
		icon,
		keywords,
		command: ({ editor, range }) => {
			executeEditorAction({
				action,
				editor,
				chain: editor.chain().focus().deleteRange(range),
			});
		},
	};
}

function insertMathAndOpen(
	editor: Editor,
	range: { from: number; to: number },
	kind: "inline" | "block",
	onMathEditRequest?: (request: MathEditRequest) => void,
) {
	const type = kind === "inline" ? "inlineMath" : "blockMath";
	const latex = kind === "inline" ? INLINE_MATH_STARTER : BLOCK_MATH_STARTER;
	const inserted = editor
		.chain()
		.focus()
		.deleteRange(range)
		.insertContent({ type, attrs: { latex } })
		.run();
	if (!inserted) return;
	const candidates: number[] = [];
	editor.state.doc.descendants((node, pos) => {
		if (node.type.name !== type) return;
		candidates.push(pos);
	});
	const nearestPos = candidates.reduce<number | null>((nearest, pos) => {
		if (nearest === null) return pos;
		return Math.abs(pos - range.from) < Math.abs(nearest - range.from)
			? pos
			: nearest;
	}, null);
	if (nearestPos === null) return;
	onMathEditRequest?.({ kind, latex, pos: nearestPos });
}

const SLASH_COMMANDS: SlashCommandDef[] = [
	createEditorActionSlashCommand({
		id: "heading1",
		icon: "H1",
		keywords: ["h1", "header", "title"],
		action: "heading_1",
	}),
	createEditorActionSlashCommand({
		id: "heading2",
		icon: "H2",
		keywords: ["h2", "header"],
		action: "heading_2",
	}),
	createEditorActionSlashCommand({
		id: "heading3",
		icon: "H3",
		keywords: ["h3", "header"],
		action: "heading_3",
	}),
	createEditorActionSlashCommand({
		id: "bulletList",
		icon: "•",
		keywords: ["ul", "bullet", "list"],
		action: "bullet_list",
	}),
	createEditorActionSlashCommand({
		id: "numberedList",
		icon: "1.",
		keywords: ["ol", "ordered", "list"],
		action: "numbered_list",
	}),
	createEditorActionSlashCommand({
		id: "todoList",
		icon: "✓",
		keywords: ["todo", "task", "checklist", "list"],
		action: "todo_list",
	}),
	createEditorActionSlashCommand({
		id: "quote",
		icon: "❝",
		keywords: ["blockquote", "quote"],
		action: "quote",
	}),
	createEditorActionSlashCommand({
		id: "codeBlock",
		icon: "</>",
		keywords: ["code", "block"],
		action: "code_block",
	}),
	createEditorActionSlashCommand({
		id: "divider",
		icon: "—",
		keywords: ["hr", "divider", "rule"],
		action: "divider",
	}),
	createEditorActionSlashCommand({
		id: "table",
		icon: "▦",
		keywords: ["table", "columns", "rows", "grid"],
		action: "table",
	}),
	{
		id: "tableOfContents",
		icon: "☰",
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
	createEditorActionSlashCommand({
		id: "mermaidChart",
		icon: "M",
		keywords: ["mermaid", "diagram", "flowchart", "graph"],
		action: "mermaid_chart",
	}),
	createEmbedSlashCommand({
		id: "htmlEmbed",
		icon: "</>",
		keywords: ["html", "embed", "widget", "preview"],
		language: "html",
		starterText:
			'<div id="app"></div>\n<style>\n  #app { padding: 16px; }\n</style>\n<script>\n  document.querySelector("#app").textContent = "Live HTML block";\n</script>',
	}),
	createEmbedSlashCommand({
		id: "svgEmbed",
		icon: "◇",
		keywords: ["svg", "vector", "graphic", "embed", "preview"],
		language: "svg",
		starterText:
			'<svg viewBox="0 0 200 80" xmlns="http://www.w3.org/2000/svg">\n  <rect width="200" height="80" rx="12" fill="tomato" />\n  <text x="100" y="48" text-anchor="middle">Glyph</text>\n</svg>',
	}),
	createEditorActionSlashCommand({
		id: "detailsBlock",
		icon: "▸",
		keywords: ["details", "toggle", "collapse", "accordion", "summary"],
		action: "details_block",
	}),
	createEditorActionSlashCommand({
		id: "calloutInfo",
		icon: "i",
		keywords: ["callout", "info", "admonition"],
		action: "callout_info",
	}),
	createEditorActionSlashCommand({
		id: "calloutTip",
		icon: "?",
		keywords: ["callout", "tip", "hint", "admonition"],
		action: "callout_tip",
	}),
	createEditorActionSlashCommand({
		id: "calloutSuccess",
		icon: "+",
		keywords: ["callout", "success", "done", "admonition"],
		action: "callout_success",
	}),
	createEditorActionSlashCommand({
		id: "calloutWarning",
		icon: "!",
		keywords: ["callout", "warning", "warn", "admonition"],
		action: "callout_warning",
	}),
	createEditorActionSlashCommand({
		id: "calloutError",
		icon: "×",
		keywords: ["callout", "error", "danger", "admonition"],
		action: "callout_error",
	}),
	{
		id: "mathInline",
		icon: "ƒx",
		keywords: ["latex", "math", "formula", "equation", "inline"],
		command: ({ editor, range, onMathEditRequest }) =>
			insertMathAndOpen(editor, range, "inline", onMathEditRequest),
	},
	{
		id: "mathDisplay",
		icon: "∑",
		keywords: ["latex", "math", "formula", "equation", "block", "display"],
		command: ({ editor, range, onMathEditRequest }) =>
			insertMathAndOpen(editor, range, "block", onMathEditRequest),
	},
	...EDITOR_TEXT_COLORS.map((color) =>
		createEditorActionSlashCommand({
			id: `color${color.id[0].toUpperCase()}${color.id.slice(1)}`,
			icon: "A",
			keywords: ["color", "text", color.id],
			action: `color_${color.id}`,
		}),
	),
	createEditorActionSlashCommand({
		id: "colorClear",
		icon: "A",
		keywords: ["color", "text", "clear", "reset"],
		action: "color_clear",
	}),
	...EDITOR_TEXT_HIGHLIGHTS.map((highlight) =>
		createEditorActionSlashCommand({
			id: `highlight${highlight.id[0].toUpperCase()}${highlight.id.slice(1)}`,
			icon: "H",
			keywords: ["highlight", "text", highlight.id],
			action: `highlight_${highlight.id}`,
		}),
	),
	createEditorActionSlashCommand({
		id: "highlightClear",
		icon: "H",
		keywords: ["highlight", "text", "clear", "reset"],
		action: "highlight_clear",
	}),
];

export const SlashCommand = Extension.create({
	name: "slash-command",
	addOptions() {
		return {
			onMathEditRequest: null as ((request: MathEditRequest) => void) | null,
			suggestion: {
				char: "/",
				startOfLine: false,
				allowSpaces: true,
				allow: ({ state }: { state: EditorState }) => {
					const { $from } = state.selection;
					return $from.parent.type.name === "paragraph";
				},
				items: ({ query }: { query: string }) => {
					return SLASH_COMMANDS.map(localizeSlashCommandItem).filter((item) =>
						slashCommandMatchesQuery(item, query),
					);
				},
				render: () =>
					createTipTapSuggestionMenu<SlashCommandItem>({
						menuClassName: "slashCommandMenu",
						onEscape: exitTipTapSuggestion,
						renderItem: ({ item, isActive, select }) => {
							const button = document.createElement("button");
							button.type = "button";
							button.className = "slashCommandItem";
							button.classList.toggle("active", isActive);
							const icon = document.createElement("span");
							icon.className = "slashCommandIcon";
							icon.textContent = item.icon;
							const title = document.createElement("div");
							title.className = "slashCommandTitle";
							title.textContent = item.title;
							button.append(icon, title);
							button.addEventListener("mousedown", (event) => {
								event.preventDefault();
								select(item);
							});
							return button;
						},
					}),
			},
		};
	},
	addProseMirrorPlugins() {
		const { suggestion, onMathEditRequest } = this.options;
		return [
			Suggestion({
				editor: this.editor,
				...suggestion,
				command: ({
					editor,
					range,
					props,
				}: {
					editor: Editor;
					range: { from: number; to: number };
					props: SlashCommandItem;
				}) => {
					props.command({
						editor,
						range,
						onMathEditRequest: onMathEditRequest ?? undefined,
					});
				},
			}),
		];
	},
});
