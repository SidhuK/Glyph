import { type Editor, Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import type { SlashCommandItem } from "./types";

interface SlashKeyDownProps {
	event: KeyboardEvent;
	items: SlashCommandItem[];
	command: (item: SlashCommandItem) => void;
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
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
		icon: "—",
		title: "Divider",
		description: "Insert a horizontal rule",
		keywords: ["hr", "divider", "rule"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
	},
];

export const SlashCommand = Extension.create({
	name: "slash-command",
	addOptions() {
		return {
			suggestion: {
				char: "/",
				startOfLine: false,
				allow: ({ state }: { state: EditorState }) => {
					const { $from } = state.selection;
					return $from.parent.type.name === "paragraph";
				},
				items: ({ query }: { query: string }) => {
					const normalized = query.toLowerCase();
					return SLASH_COMMANDS.filter((item) => {
						if (!normalized) return true;
						if (item.title.toLowerCase().includes(normalized)) return true;
						return item.keywords.some((k) => k.includes(normalized));
					}).slice(0, 8);
				},
				command: ({
					editor,
					range,
					props,
				}: {
					editor: Editor;
					range: { from: number; to: number };
					props: SlashCommandItem;
				}) => {
					props.command({ editor, range });
				},
				render: () => {
					let menu: HTMLDivElement | null = null;
					let selectedIndex = 0;

					const updateSelection = (items: SlashCommandItem[]) => {
						if (!menu) return;
						const children = Array.from(menu.children);
						children.forEach((child, index) => {
							child.classList.toggle("active", index === selectedIndex);
						});
						if (items.length === 0) selectedIndex = 0;
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
						menu.innerHTML = "";
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
							menu.style.left = `${rect.left}px`;
							menu.style.top = `${rect.bottom + 6}px`;
						}
					};

					return {
						onStart: (props: SuggestionProps<SlashCommandItem>) => {
							selectedIndex = 0;
							createMenu(props);
						},
						onUpdate: (props: SuggestionProps<SlashCommandItem>) => {
							if (!menu) createMenu(props);
							updateMenu(props);
						},
						onKeyDown: (props: SlashKeyDownProps) => {
							if (!props.items.length) return false;
							if (props.event.key === "ArrowDown") {
								selectedIndex = (selectedIndex + 1) % props.items.length;
								updateSelection(props.items);
								return true;
							}
							if (props.event.key === "ArrowUp") {
								selectedIndex =
									(selectedIndex - 1 + props.items.length) % props.items.length;
								updateSelection(props.items);
								return true;
							}
							if (props.event.key === "Enter") {
								props.command(props.items[selectedIndex]);
								return true;
							}
							if (props.event.key === "Escape") {
								return true;
							}
							return false;
						},
						onExit: () => {
							if (menu) menu.remove();
							menu = null;
						},
					};
				},
			},
		};
	},
	addProseMirrorPlugins() {
		return [
			Suggestion({
				editor: this.editor,
				...this.options.suggestion,
			}),
		];
	},
});
