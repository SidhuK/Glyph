import { type Editor, Extension, type JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import type { EditorState } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { i18n } from "../../i18n";
import { splitYamlFrontmatter } from "../../lib/notePreview";
import { type EditorActionId, executeEditorAction } from "./editorActions";
import {
	BLOCK_MATH_STARTER,
	INLINE_MATH_STARTER,
	type MathEditRequest,
} from "./extensions/math/mathOptions";
import { INLINE_TOC_EDITOR_MARKER } from "./markdown/inlineTocMarkdown";
import { preprocessMarkdownForEditor } from "./markdown/wikiLinkMarkdownBridge";
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
		onTemplateInsertRequest?: (request: TemplateInsertRequest) => void;
		range: { from: number; to: number };
	}) => void;
}

export interface TemplateInsertRequest {
	cancel: () => void;
	insert: (markdown: string) => boolean;
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
	const resolved = editor.state.doc.resolve(range.from);
	let insideTableCell = false;
	for (let depth = resolved.depth; depth > 0; depth -= 1) {
		const name = resolved.node(depth).type.name;
		if (name === "tableCell" || name === "tableHeader") {
			insideTableCell = true;
			break;
		}
	}
	const tableDisplay = kind === "block" && insideTableCell;
	const type = kind === "inline" || tableDisplay ? "inlineMath" : "blockMath";
	const latex = kind === "inline" ? INLINE_MATH_STARTER : BLOCK_MATH_STARTER;
	const inserted = editor
		.chain()
		.focus()
		.deleteRange(range)
		.insertContent({ type, attrs: { display: tableDisplay, latex } })
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

function parseTemplateContent(editor: Editor, markdown: string): JSONContent[] {
	const { body } = splitYamlFrontmatter(markdown);
	const manager = new MarkdownManager({
		extensions: editor.extensionManager.extensions,
		markedOptions: { gfm: true, breaks: false },
	});
	const parsed = manager.parse(preprocessMarkdownForEditor(body));
	const content = Array.isArray(parsed.content) ? parsed.content : [];
	if (content.length !== 1 || content[0]?.type !== "paragraph") return content;
	return Array.isArray(content[0].content) ? content[0].content : [];
}

function restoreTemplateInsertionPoint(editor: Editor, position: number) {
	if (editor.isDestroyed) return;
	const resolvedPosition = Math.min(position, editor.state.doc.content.size);
	editor.chain().focus().setTextSelection(resolvedPosition).run();
}

function requestTemplateInsertion({
	editor,
	range,
	onTemplateInsertRequest,
}: {
	editor: Editor;
	range: { from: number; to: number };
	onTemplateInsertRequest?: (request: TemplateInsertRequest) => void;
}) {
	if (!onTemplateInsertRequest) return;
	const position = range.from;
	const requestDocument = editor.state.doc;
	onTemplateInsertRequest({
		cancel: () => restoreTemplateInsertionPoint(editor, range.to),
		insert: (markdown) => {
			if (editor.isDestroyed || !editor.state.doc.eq(requestDocument)) {
				return false;
			}
			try {
				const content = parseTemplateContent(editor, markdown);
				if (!content.length) {
					restoreTemplateInsertionPoint(editor, range.to);
					return false;
				}
				const inserted = editor
					.chain()
					.focus()
					.deleteRange(range)
					.insertContentAt(position, content)
					.run();
				if (!inserted) restoreTemplateInsertionPoint(editor, range.to);
				return inserted;
			} catch {
				restoreTemplateInsertionPoint(editor, range.to);
				return false;
			}
		},
	});
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
	{
		id: "insertTemplate",
		icon: "T",
		keywords: ["template", "snippet", "date", "time", "title", "title_slug"],
		command: requestTemplateInsertion,
	},
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
			onTemplateInsertRequest: null as
				| ((request: TemplateInsertRequest) => void)
				| null,
			suggestion: {
				char: "/",
				startOfLine: false,
				allowSpaces: true,
				allow: ({ state }: { state: EditorState }) => {
					const { $from } = state.selection;
					return $from.parent.type.name === "paragraph";
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
		const { suggestion, onMathEditRequest, onTemplateInsertRequest } =
			this.options;
		return [
			Suggestion({
				editor: this.editor,
				...suggestion,
				items: ({ query }: { query: string }) =>
					SLASH_COMMANDS.filter(
						(item) =>
							item.id !== "insertTemplate" || Boolean(onTemplateInsertRequest),
					)
						.map(localizeSlashCommandItem)
						.filter((item) => slashCommandMatchesQuery(item, query)),
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
						onTemplateInsertRequest: onTemplateInsertRequest ?? undefined,
					});
				},
			}),
		];
	},
});
