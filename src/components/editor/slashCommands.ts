import { type Editor, Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import Suggestion, {
	exitSuggestion,
	type SuggestionKeyDownProps,
	type SuggestionProps,
} from "@tiptap/suggestion";
import {
	BLOCK_MATH_STARTER,
	INLINE_MATH_STARTER,
	type MathEditRequest,
} from "./extensions/math/mathOptions";
import { INLINE_TOC_EDITOR_MARKER } from "./markdown/inlineTocMarkdown";
import { lockEditorScrollDuringSuggestion } from "./suggestionScroll";
import { EDITOR_TEXT_COLORS } from "./textColors";
import { EDITOR_TEXT_HIGHLIGHTS } from "./textHighlights";

interface SlashCommandItem {
	icon: string;
	title: string;
	description: string;
	keywords: string[];
	command: (ctx: {
		editor: Editor;
		onMathEditRequest?: (request: MathEditRequest) => void;
		range: { from: number; to: number };
	}) => void;
}

function clampSlashCommandIndex(index: number, itemCount: number) {
	if (itemCount <= 0) return 0;
	if (index < 0) return itemCount - 1;
	if (index >= itemCount) return 0;
	return index;
}

function slashCommandSearchText(item: SlashCommandItem) {
	return [item.title, ...item.keywords].join(" ").toLowerCase();
}

function slashCommandMatchesQuery(item: SlashCommandItem, query: string) {
	const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
	if (!terms.length) return true;
	const searchText = slashCommandSearchText(item);
	return terms.every((term) => searchText.includes(term));
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

const SLASH_COMMANDS: SlashCommandItem[] = [
	{
		icon: "H1",
		title: "Heading 1",
		description: "Big section heading",
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
		icon: "H2",
		title: "Heading 2",
		description: "Section heading",
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
		icon: "H3",
		title: "Heading 3",
		description: "Subheading",
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
		icon: "•",
		title: "Bullet list",
		description: "Start a bullet list",
		keywords: ["ul", "bullet", "list"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleBulletList().run(),
	},
	{
		icon: "1.",
		title: "Numbered list",
		description: "Start a numbered list",
		keywords: ["ol", "ordered", "list"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
	},
	{
		icon: "✓",
		title: "To-do list",
		description: "Start a task list",
		keywords: ["todo", "task", "checklist", "list"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleTaskList().run(),
	},
	{
		icon: "❝",
		title: "Quote",
		description: "Insert a blockquote",
		keywords: ["blockquote", "quote"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
	},
	{
		icon: "</>",
		title: "Code block",
		description: "Insert a code block",
		keywords: ["code", "block"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
	},
	{
		icon: "—",
		title: "Divider",
		description: "Insert a horizontal rule",
		keywords: ["hr", "divider", "rule"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
	},
	{
		icon: "▦",
		title: "Table",
		description: "Insert a markdown table",
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
		icon: "☰",
		title: "Table of contents",
		description: "Insert a live outline for this note",
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
		icon: "M",
		title: "Mermaid chart",
		description: "Insert a Mermaid diagram block",
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
	{
		icon: "i",
		title: "Info callout",
		description: "Insert an info callout",
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
		icon: "?",
		title: "Tip callout",
		description: "Insert a tip callout",
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
		icon: "+",
		title: "Success callout",
		description: "Insert a success callout",
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
		icon: "!",
		title: "Warning callout",
		description: "Insert a warning callout",
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
		icon: "×",
		title: "Error callout",
		description: "Insert an error callout",
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
		icon: "ƒx",
		title: "Inline equation",
		description: "Insert LaTeX within a line",
		keywords: ["latex", "math", "formula", "equation", "inline"],
		command: ({ editor, range, onMathEditRequest }) =>
			insertMathAndOpen(editor, range, "inline", onMathEditRequest),
	},
	{
		icon: "∑",
		title: "Display equation",
		description: "Insert a centered LaTeX block",
		keywords: ["latex", "math", "formula", "equation", "block", "display"],
		command: ({ editor, range, onMathEditRequest }) =>
			insertMathAndOpen(editor, range, "block", onMathEditRequest),
	},
	...EDITOR_TEXT_COLORS.map<SlashCommandItem>((color) => ({
		icon: "A",
		title: `Color: ${color.label}`,
		description: `Apply ${color.label.toLowerCase()} text color`,
		keywords: ["color", "text", color.id, color.label.toLowerCase()],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setTextColor(color.id).run(),
	})),
	{
		icon: "A",
		title: "Color: Clear",
		description: "Remove text color",
		keywords: ["color", "text", "clear", "reset"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).unsetTextColor().run(),
	},
	...EDITOR_TEXT_HIGHLIGHTS.map<SlashCommandItem>((highlight) => ({
		icon: "H",
		title: `Highlight: ${highlight.label}`,
		description: `Apply ${highlight.label.toLowerCase()} text highlight`,
		keywords: [
			"highlight",
			"text",
			highlight.id,
			highlight.label.toLowerCase(),
		],
		command: ({ editor, range }) =>
			editor
				.chain()
				.focus()
				.deleteRange(range)
				.setTextHighlight(highlight.id)
				.run(),
	})),
	{
		icon: "H",
		title: "Highlight: Clear",
		description: "Remove text highlight",
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
					return SLASH_COMMANDS.filter((item) =>
						slashCommandMatchesQuery(item, query),
					);
				},
				render: () => {
					let menu: HTMLDivElement | null = null;
					let selectedIndex = 0;
					let currentProps: SuggestionProps<SlashCommandItem> | null = null;
					let unlockEditorScroll: (() => void) | null = null;

					const updateSelection = (items: SlashCommandItem[]) => {
						if (!menu) return;
						selectedIndex = clampSlashCommandIndex(selectedIndex, items.length);
						const children = Array.from(menu.children);
						children.forEach((child, index) => {
							child.classList.toggle("active", index === selectedIndex);
						});
						const activeItem = children[selectedIndex];
						if (activeItem instanceof HTMLElement) {
							activeItem.scrollIntoView({ block: "nearest" });
						}
					};

					const createMenu = (props: SuggestionProps<SlashCommandItem>) => {
						if (menu) menu.remove();
						menu = document.createElement("div");
						menu.className = "slashCommandMenu";
						document.body.append(menu);
						updateMenu(props);
					};

					const updateMenu = (props: SuggestionProps<SlashCommandItem>) => {
						if (!menu) return;
						currentProps = props;
						selectedIndex = clampSlashCommandIndex(
							selectedIndex,
							props.items.length,
						);
						menu.replaceChildren();
						if (!props.items.length) return;
						for (const [index, item] of props.items.entries()) {
							const button = document.createElement("button");
							button.type = "button";
							button.className = "slashCommandItem";
							const icon = document.createElement("span");
							icon.className = "slashCommandIcon";
							icon.textContent = item.icon;
							const title = document.createElement("div");
							title.className = "slashCommandTitle";
							title.textContent = item.title;
							button.append(icon, title);
							button.addEventListener("mousedown", (event) => {
								event.preventDefault();
								props.command(item);
							});
							if (index === selectedIndex) {
								button.classList.add("active");
							}
							menu?.append(button);
						}
						const rect = props.clientRect?.();
						if (rect && menu) {
							const pad = 8;
							const gap = 6;
							const menuRect = menu.getBoundingClientRect();
							const placeBelowTop = rect.bottom + gap;
							const placeAboveTop = rect.top - menuRect.height - gap;
							const maxLeft = window.innerWidth - menuRect.width - pad;
							const maxTop = window.innerHeight - menuRect.height - pad;
							const nextLeft = Math.max(pad, Math.min(rect.left, maxLeft));
							const nextTop =
								placeBelowTop <= maxTop
									? placeBelowTop
									: Math.max(pad, Math.min(placeAboveTop, maxTop));
							menu.style.left = `${nextLeft}px`;
							menu.style.top = `${nextTop}px`;
						}
					};

					return {
						onStart: (props: SuggestionProps<SlashCommandItem>) => {
							selectedIndex = 0;
							currentProps = props;
							unlockEditorScroll?.();
							unlockEditorScroll = lockEditorScrollDuringSuggestion(
								props.editor,
								() => menu,
							);
							createMenu(props);
						},
						onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
							if (!menu) createMenu(props);
							updateMenu(props);
						},
						onKeyDown: (props: SuggestionKeyDownProps) => {
							const items = currentProps?.items ?? [];
							if (!items.length) return false;
							if (props.event.key === "ArrowDown") {
								selectedIndex = clampSlashCommandIndex(
									selectedIndex + 1,
									items.length,
								);
								updateSelection(items);
								return true;
							}
							if (props.event.key === "ArrowUp") {
								selectedIndex = clampSlashCommandIndex(
									selectedIndex - 1,
									items.length,
								);
								updateSelection(items);
								return true;
							}
							if (props.event.key === "Enter" || props.event.key === "Tab") {
								currentProps?.command(items[selectedIndex]);
								return true;
							}
							if (props.event.key === "Escape") {
								exitSuggestion(props.view);
								return true;
							}
							return false;
						},
						onExit: () => {
							unlockEditorScroll?.();
							unlockEditorScroll = null;
							if (menu) menu.remove();
							menu = null;
							currentProps = null;
						},
					};
				},
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
