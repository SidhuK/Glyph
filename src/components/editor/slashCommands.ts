import { type Editor, Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { i18n } from "../../i18n";
import { createDetailsBlockContent } from "./extensions/detailsBlock";
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
	{
		id: "heading1",
		icon: "H1",
		keywords: ["h1", "header", "title"],
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.toggleHeading({ level: 1 })
				.run(),
	},
	{
		id: "heading2",
		icon: "H2",
		keywords: ["h2", "header"],
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.toggleHeading({ level: 2 })
				.run(),
	},
	{
		id: "heading3",
		icon: "H3",
		keywords: ["h3", "header"],
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.toggleHeading({ level: 3 })
				.run(),
	},
	{
		id: "bulletList",
		icon: "•",
		keywords: ["ul", "bullet", "list"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleBulletList().run(),
	},
	{
		id: "numberedList",
		icon: "1.",
		keywords: ["ol", "ordered", "list"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
	},
	{
		id: "todoList",
		icon: "✓",
		keywords: ["todo", "task", "checklist", "list"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleTaskList().run(),
	},
	{
		id: "quote",
		icon: "❝",
		keywords: ["blockquote", "quote"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
	},
	{
		id: "codeBlock",
		icon: "</>",
		keywords: ["code", "block"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
	},
	{
		id: "divider",
		icon: "—",
		keywords: ["hr", "divider", "rule"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
	},
	{
		id: "table",
		icon: "▦",
		keywords: ["table", "columns", "rows", "grid"],
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertTable({ rows: 3, cols: 3, withHeaderRow: true })
				.run(),
	},
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
	{
		id: "mermaidChart",
		icon: "M",
		keywords: ["mermaid", "diagram", "flowchart", "graph"],
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertContent({
					type: "codeBlock",
					attrs: { language: "mermaid" },
					content: [
						{
							type: "text",
							text: "flowchart TD\n  A[Start] --> B[End]",
						},
					],
				})
				.run(),
	},
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
	{
		id: "detailsBlock",
		icon: "▸",
		keywords: ["details", "toggle", "collapse", "accordion", "summary"],
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertContent(createDetailsBlockContent())
				.run(),
	},
	{
		id: "calloutInfo",
		icon: "i",
		keywords: ["callout", "info", "admonition"],
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertContent({
					type: "blockquote",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "[!info]" }],
						},
						{ type: "paragraph" },
					],
				})
				.run(),
	},
	{
		id: "calloutTip",
		icon: "?",
		keywords: ["callout", "tip", "hint", "admonition"],
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertContent({
					type: "blockquote",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "[!tip]" }],
						},
						{ type: "paragraph" },
					],
				})
				.run(),
	},
	{
		id: "calloutSuccess",
		icon: "+",
		keywords: ["callout", "success", "done", "admonition"],
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertContent({
					type: "blockquote",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "[!success]" }],
						},
						{ type: "paragraph" },
					],
				})
				.run(),
	},
	{
		id: "calloutWarning",
		icon: "!",
		keywords: ["callout", "warning", "warn", "admonition"],
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertContent({
					type: "blockquote",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "[!warning]" }],
						},
						{ type: "paragraph" },
					],
				})
				.run(),
	},
	{
		id: "calloutError",
		icon: "×",
		keywords: ["callout", "error", "danger", "admonition"],
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.insertContent({
					type: "blockquote",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "[!error]" }],
						},
						{ type: "paragraph" },
					],
				})
				.run(),
	},
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
	...EDITOR_TEXT_COLORS.map<SlashCommandDef>((color) => ({
		id: `color${color.id[0].toUpperCase()}${color.id.slice(1)}`,
		icon: "A",
		keywords: ["color", "text", color.id],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setTextColor(color.id).run(),
	})),
	{
		id: "colorClear",
		icon: "A",
		keywords: ["color", "text", "clear", "reset"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).unsetTextColor().run(),
	},
	...EDITOR_TEXT_HIGHLIGHTS.map<SlashCommandDef>((highlight) => ({
		id: `highlight${highlight.id[0].toUpperCase()}${highlight.id.slice(1)}`,
		icon: "H",
		keywords: ["highlight", "text", highlight.id],
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.setTextHighlight(highlight.id)
				.run(),
	})),
	{
		id: "highlightClear",
		icon: "H",
		keywords: ["highlight", "text", "clear", "reset"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).unsetTextHighlight().run(),
	},
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
