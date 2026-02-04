import { openUrl } from "@tauri-apps/plugin-opener";
import { Extension, type Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import Link from "@tiptap/extension-link";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Underline from "@tiptap/extension-underline";
import { memo, useEffect, useMemo, useRef } from "react";
import {
	Bold,
	Code,
	Heading1,
	Heading2,
	Heading3,
	Italic,
	List,
	ListChecks,
	ListOrdered,
	Quote,
	Strikethrough,
} from "./Icons";
import {
	splitYamlFrontmatter,
} from "../lib/notePreview";

export type CanvasInlineEditorMode = "rich" | "preview";

interface CanvasNoteInlineEditorProps {
	markdown: string;
	mode: CanvasInlineEditorMode;
	onModeChange: (mode: CanvasInlineEditorMode) => void;
	onChange: (nextMarkdown: string) => void;
}

interface SlashCommandItem {
	title: string;
	description: string;
	keywords: string[];
	command: (ctx: { editor: Editor; range: { from: number; to: number } }) => void;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
	{
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
		title: "Bullet list",
		description: "Start a bullet list",
		keywords: ["ul", "bullet", "list"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleBulletList().run(),
	},
	{
		title: "Numbered list",
		description: "Start a numbered list",
		keywords: ["ol", "ordered", "list"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
	},
	{
		title: "Quote",
		description: "Insert a blockquote",
		keywords: ["blockquote", "quote"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
	},
	{
		title: "Code block",
		description: "Insert a code block",
		keywords: ["code", "block"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
	},
	{
		title: "Divider",
		description: "Insert a horizontal rule",
		keywords: ["hr", "divider", "rule"],
		command: ({ editor, range }) =>
			editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
	},
];

const SlashCommand = Extension.create({
	name: "slash-command",
	addOptions() {
		return {
			suggestion: {
				char: "/",
				startOfLine: false,
				allow: ({ state }) => {
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
						props.items.forEach((item, index) => {
							const button = document.createElement("button");
							button.type = "button";
							button.className = "slashCommandItem";
							button.innerHTML = `<div class="slashCommandTitle">${item.title}</div><div class="slashCommandDesc">${item.description}</div>`;
							button.addEventListener("mousedown", (event) => {
								event.preventDefault();
								props.command(item);
							});
							if (index === selectedIndex) {
								button.classList.add("active");
							}
							menu?.append(button);
						});
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
						onKeyDown: (props: SuggestionProps<SlashCommandItem>) => {
							if (!props.items.length) return false;
							if (props.event.key === "ArrowDown") {
								selectedIndex =
									(selectedIndex + 1) % props.items.length;
								updateSelection(props.items);
								return true;
							}
							if (props.event.key === "ArrowUp") {
								selectedIndex =
									(selectedIndex - 1 + props.items.length) %
									props.items.length;
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

function mergeFrontmatter(
	frontmatter: string | null,
	body: string,
): string {
	if (!frontmatter) return body;
	if (!body) return frontmatter;
	if (frontmatter.endsWith("\n") || body.startsWith("\n")) {
		return `${frontmatter}${body}`;
	}
	return `${frontmatter}\n${body}`;
}

export const CanvasNoteInlineEditor = memo(function CanvasNoteInlineEditor({
	markdown,
	mode,
	onModeChange,
	onChange,
}: CanvasNoteInlineEditorProps) {
	const { frontmatter, body } = useMemo(
		() => splitYamlFrontmatter(markdown),
		[markdown],
	);
	const frontmatterRef = useRef(frontmatter);
	const lastAppliedBodyRef = useRef(body);
	const lastEmittedMarkdownRef = useRef(markdown);
	const ignoreNextUpdateRef = useRef(false);
	const suppressUpdateRef = useRef(false);

	useEffect(() => {
		frontmatterRef.current = frontmatter;
		lastEmittedMarkdownRef.current = markdown;
	}, [frontmatter, markdown]);

	const editor = useEditor({
		extensions: [
			StarterKit.configure({
				bulletList: { keepMarks: true, keepAttributes: false },
				orderedList: { keepMarks: true, keepAttributes: false },
			}),
			Underline,
			Link.configure({
				openOnClick: false,
				autolink: true,
				defaultProtocol: "https",
			}),
			TaskList,
			TaskItem.configure({ nested: true }),
			Table.configure({ resizable: true }),
			TableRow,
			TableHeader,
			TableCell,
			Markdown.configure({
				markedOptions: {
					gfm: true,
					breaks: false,
				},
			}),
			SlashCommand,
		],
		content: body,
		contentType: "markdown",
		editorProps: {
			attributes: {
				class: "tiptapContentInline",
				spellcheck: "true",
			},
			handleClick: (_view, _pos, event) => {
				const target = event.target as HTMLElement | null;
				const link = target?.closest("a") as HTMLAnchorElement | null;
				const href = link?.getAttribute("href") ?? "";
				if (
					href &&
					(href.startsWith("http://") || href.startsWith("https://"))
				) {
					event.preventDefault();
					void openUrl(href);
					return true;
				}
				return false;
			},
		},
		onTransaction: ({ editor: instance, transaction }) => {
			if (!transaction.docChanged) return;
			if (suppressUpdateRef.current) {
				suppressUpdateRef.current = false;
				return;
			}
			if (ignoreNextUpdateRef.current) {
				ignoreNextUpdateRef.current = false;
				return;
			}
			if (mode !== "rich" || !instance.isEditable) return;
			const nextBody = instance.getMarkdown();
			const nextMarkdown = mergeFrontmatter(
				frontmatterRef.current,
				nextBody,
			);
			if (nextMarkdown === lastEmittedMarkdownRef.current) return;
			lastEmittedMarkdownRef.current = nextMarkdown;
			onChange(nextMarkdown);
		},
	});

	useEffect(() => {
		if (!editor) return;
		editor.setEditable(mode === "rich");
		if (mode === "rich") {
			ignoreNextUpdateRef.current = true;
		}
	}, [editor, mode]);

	useEffect(() => {
		if (!editor) return;
		if (body === lastAppliedBodyRef.current) return;
		suppressUpdateRef.current = true;
		editor.commands.setContent(body, { contentType: "markdown" });
		lastAppliedBodyRef.current = body;
	}, [body, editor]);

	return (
		<div className="rfNodeNoteEditor nodrag nopan">
			<div className="rfNodeNoteEditorHeaderBar nodrag nopan nowheel">
				<button
					type="button"
					className={mode === "preview" ? "segBtn active" : "segBtn"}
					onClick={() => onModeChange("preview")}
					title="Preview"
				>
					Preview
				</button>
				<button
					type="button"
					className={mode === "rich" ? "segBtn active" : "segBtn"}
					onClick={() => onModeChange("rich")}
					title="Rich Text"
				>
					Rich
				</button>
				<div style={{ flex: 1 }} />
			</div>
			<div className="rfNodeNoteEditorBody nodrag nopan nowheel">
				{frontmatter ? (
					<div className="frontmatterPreview mono">
						<div className="frontmatterLabel">Frontmatter</div>
						<pre>{frontmatter.trimEnd()}</pre>
					</div>
				) : null}
				<div
					className={[
						"tiptapHostInline",
						mode === "preview" ? "is-preview" : "",
						"nodrag",
						"nopan",
						"nowheel",
					]
						.filter(Boolean)
						.join(" ")}
				>
					<EditorContent editor={editor} />
				</div>
			</div>
			<div className="rfNodeNoteEditorRibbon rfNodeNoteEditorRibbonBottom nodrag nopan nowheel">
				{mode === "rich" && editor ? (
					<>
						<div className="ribbonGroup">
							<button
								type="button"
								className={`ribbonBtn ${
									editor.isActive("bold") ? "active" : ""
								}`}
								title="Bold"
								onClick={() => editor.chain().focus().toggleBold().run()}
							>
								<Bold size={14} />
							</button>
							<button
								type="button"
								className={`ribbonBtn ${
									editor.isActive("italic") ? "active" : ""
								}`}
								title="Italic"
								onClick={() => editor.chain().focus().toggleItalic().run()}
							>
								<Italic size={14} />
							</button>
							<button
								type="button"
								className={`ribbonBtn ${
									editor.isActive("underline") ? "active" : ""
								}`}
								title="Underline"
								onClick={() => editor.chain().focus().toggleUnderline().run()}
							>
								<span className="ribbonText">U</span>
							</button>
							<button
								type="button"
								className={`ribbonBtn ${
									editor.isActive("strike") ? "active" : ""
								}`}
								title="Strikethrough"
								onClick={() => editor.chain().focus().toggleStrike().run()}
							>
								<Strikethrough size={14} />
							</button>
						</div>
						<span className="ribbonDivider" />
						<div className="ribbonGroup">
							<button
								type="button"
								className={`ribbonBtn ${
									editor.isActive("heading", { level: 1 }) ? "active" : ""
								}`}
								title="Heading 1"
								onClick={() =>
									editor.chain().focus().toggleHeading({ level: 1 }).run()
								}
							>
								<Heading1 size={14} />
							</button>
							<button
								type="button"
								className={`ribbonBtn ${
									editor.isActive("heading", { level: 2 }) ? "active" : ""
								}`}
								title="Heading 2"
								onClick={() =>
									editor.chain().focus().toggleHeading({ level: 2 }).run()
								}
							>
								<Heading2 size={14} />
							</button>
							<button
								type="button"
								className={`ribbonBtn ${
									editor.isActive("heading", { level: 3 }) ? "active" : ""
								}`}
								title="Heading 3"
								onClick={() =>
									editor.chain().focus().toggleHeading({ level: 3 }).run()
								}
							>
								<Heading3 size={14} />
							</button>
						</div>
						<span className="ribbonDivider" />
						<div className="ribbonGroup">
							<button
								type="button"
								className={`ribbonBtn ${
									editor.isActive("bulletList") ? "active" : ""
								}`}
								title="Bullet list"
								onClick={() => editor.chain().focus().toggleBulletList().run()}
							>
								<List size={14} />
							</button>
							<button
								type="button"
								className={`ribbonBtn ${
									editor.isActive("orderedList") ? "active" : ""
								}`}
								title="Numbered list"
								onClick={() => editor.chain().focus().toggleOrderedList().run()}
							>
								<ListOrdered size={14} />
							</button>
							<button
								type="button"
								className={`ribbonBtn ${
									editor.isActive("taskList") ? "active" : ""
								}`}
								title="Task list"
								onClick={() => editor.chain().focus().toggleTaskList().run()}
							>
								<ListChecks size={14} />
							</button>
						</div>
						<span className="ribbonDivider" />
						<div className="ribbonGroup">
							<button
								type="button"
								className={`ribbonBtn ${
									editor.isActive("blockquote") ? "active" : ""
								}`}
								title="Quote"
								onClick={() => editor.chain().focus().toggleBlockquote().run()}
							>
								<Quote size={14} />
							</button>
							<button
								type="button"
								className={`ribbonBtn ${
									editor.isActive("codeBlock") ? "active" : ""
								}`}
								title="Code block"
								onClick={() => editor.chain().focus().toggleCodeBlock().run()}
							>
								<Code size={14} />
							</button>
						</div>
					</>
				) : null}
				<div style={{ flex: 1 }} />
			</div>
		</div>
	);
});
