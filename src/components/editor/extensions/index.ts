import { Extension } from "@tiptap/core";
import {
	Table,
	TableCell,
	TableHeader,
	TableRow,
} from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { SlashCommand } from "../slashCommands";
import { MarkdownImage } from "./markdownImage";
import { MarkdownLinkAutocomplete } from "./markdownLinkAutocomplete";
import { TagDecorations } from "./tagDecorations";
import { WikiLink } from "./wikiLink";

function parseCalloutMarker(
	text: string,
): { kind: string; title: string } | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith("[!")) return null;
	const match = trimmed.match(/^\[!([A-Za-z_-]+)\]\s*(.*)$/);
	if (!match) return null;
	const rawKind = (match[1] ?? "note").toLowerCase();
	const kind = rawKind === "warn" ? "warning" : rawKind;
	const rawTitle = (match[2] ?? "").trim();
	const title = rawTitle || `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`;
	return { kind, title };
}

const CalloutDecorations = Extension.create({
	name: "callout-decorations",
	addProseMirrorPlugins() {
		const key = new PluginKey("callout-decorations");
		return [
			new Plugin({
				key: new PluginKey("callout-shortcut-transform"),
				appendTransaction(transactions, _oldState, newState) {
					if (!transactions.some((tr) => tr.docChanged)) return null;

					const blockquote = newState.schema.nodes.blockquote;
					const paragraph = newState.schema.nodes.paragraph;
					const textNode = newState.schema.text.bind(newState.schema);
					if (!blockquote || !paragraph) return null;

					const replacements: Array<{
						pos: number;
						size: number;
						marker: string;
					}> = [];

					newState.doc.descendants((node, pos) => {
						if (node.type !== paragraph || node.childCount !== 1) return;
						const text = node.textContent ?? "";
						const match = text.match(/^\s*>\s*\[!([A-Za-z_-]+)\]\s*(.*)$/);
						if (!match) return;
						const rawKind = (match[1] ?? "note").toLowerCase();
						const kind = rawKind === "warn" ? "warning" : rawKind;
						const tail = (match[2] ?? "").trim();
						const marker = tail.length ? `[!${kind}] ${tail}` : `[!${kind}]`;
						replacements.push({ pos, size: node.nodeSize, marker });
					});

					if (!replacements.length) return null;

					let tr = newState.tr;
					for (let i = replacements.length - 1; i >= 0; i -= 1) {
						const replacement = replacements[i];
						const calloutNode = blockquote.create(
							null,
							[
								paragraph.create(
									null,
									replacement.marker ? textNode(replacement.marker) : null,
								),
								paragraph.create(),
							].filter(Boolean),
						);
						tr = tr.replaceWith(
							replacement.pos,
							replacement.pos + replacement.size,
							calloutNode,
						);
					}

					return tr.docChanged ? tr : null;
				},
			}),
			new Plugin({
				key,
				props: {
					decorations(state) {
						const decorations: Decoration[] = [];
						state.doc.descendants((node, pos) => {
							if (node.type.name !== "blockquote") return;
							let parsed: { kind: string; title: string } | null = null;
							for (let i = 0; i < node.childCount; i += 1) {
								const child = node.child(i);
								const text = child.textContent ?? "";
								parsed = parseCalloutMarker(text);
								if (parsed) break;
							}
							if (!parsed) return;
							decorations.push(
								Decoration.node(pos, pos + node.nodeSize, {
									class: `callout callout-${parsed.kind}`,
									"data-callout": parsed.kind,
									"data-callout-title": parsed.title,
								}),
							);
						});
						return DecorationSet.create(state.doc, decorations);
					},
				},
			}),
		];
	},
});

const TaskListMarkdownShortcut = Extension.create({
	name: "task-list-markdown-shortcut",
	addProseMirrorPlugins() {
		const key = new PluginKey("task-list-markdown-shortcut");
		return [
			new Plugin({
				key,
				appendTransaction(transactions, _oldState, newState) {
					if (!transactions.some((tr) => tr.docChanged)) return null;

					const paragraph = newState.schema.nodes.paragraph;
					const taskList = newState.schema.nodes.taskList;
					const taskItem = newState.schema.nodes.taskItem;
					if (!paragraph || !taskList || !taskItem) return null;

					const replacements: Array<{
						pos: number;
						size: number;
						checked: boolean;
						text: string;
					}> = [];

					newState.doc.descendants((node, pos) => {
						if (node.type !== paragraph || node.childCount !== 1) return;
						const text = node.textContent ?? "";
						const match = text.match(/^\[([ xX])\]\s*(.*)$/);
						if (!match) return;

						// Resolve inside the paragraph node (not at its boundary) so depth
						// points at paragraph > listItem > bulletList correctly.
						const $pos = newState.doc.resolve(pos + 1);
						const listItemDepth = $pos.depth - 1;
						const listDepth = $pos.depth - 2;
						if (listItemDepth < 1 || listDepth < 1) return;

						const listItemNode = $pos.node(listItemDepth);
						const listNode = $pos.node(listDepth);
						if (
							listItemNode.type.name !== "listItem" ||
							listNode.type.name !== "bulletList" ||
							listNode.childCount !== 1 ||
							listItemNode.childCount !== 1
						) {
							return;
						}

						replacements.push({
							pos: $pos.before(listDepth),
							size: listNode.nodeSize,
							checked: (match[1] ?? " ").toLowerCase() === "x",
							text: (match[2] ?? "").trimStart(),
						});
					});

					if (!replacements.length) return null;

					const textNode = newState.schema.text.bind(newState.schema);
					let tr = newState.tr;
					for (let i = replacements.length - 1; i >= 0; i -= 1) {
						const replacement = replacements[i];
						const paragraphNode = newState.schema.nodes.paragraph.create(
							null,
							replacement.text ? textNode(replacement.text) : null,
						);
						const taskItemNode = taskItem.create(
							{ checked: replacement.checked },
							paragraphNode,
						);
						const taskListNode = taskList.create(null, [taskItemNode]);
						tr = tr.replaceWith(
							replacement.pos,
							replacement.pos + replacement.size,
							taskListNode,
						);
					}

					return tr.docChanged ? tr : null;
				},
			}),
		];
	},
});

const TableEnterNavigation = Extension.create({
	name: "table-enter-navigation",
	addKeyboardShortcuts() {
		return {
			Enter: () => {
				const { editor } = this;
				if (!editor.isEditable || !editor.isActive("table")) return false;

				const { $from } = editor.state.selection;
				let cellDepth = -1;
				let rowDepth = -1;
				let tableDepth = -1;

				for (let depth = $from.depth; depth > 0; depth -= 1) {
					const node = $from.node(depth);
					if (
						cellDepth === -1 &&
						(node.type.name === "tableCell" || node.type.name === "tableHeader")
					) {
						cellDepth = depth;
					}
					if (rowDepth === -1 && node.type.name === "tableRow") {
						rowDepth = depth;
					}
					if (node.type.name === "table") {
						tableDepth = depth;
						break;
					}
				}

				if (cellDepth === -1 || rowDepth === -1 || tableDepth === -1)
					return false;

				const rowNode = $from.node(rowDepth);
				const tableNode = $from.node(tableDepth);
				const isLastCellInRow =
					$from.index(rowDepth) === rowNode.childCount - 1;
				const isLastRowInTable =
					$from.index(tableDepth) === tableNode.childCount - 1;

				if (isLastCellInRow && isLastRowInTable) {
					return editor.chain().focus().addRowAfter().goToNextCell().run();
				}

				return editor.commands.goToNextCell();
			},
		};
	},
});

interface CreateEditorExtensionsOptions {
	enableSlashCommand?: boolean;
	enableWikiLinks?: boolean;
	enableMarkdownLinkAutocomplete?: boolean;
	currentPath?: string;
}

export function createEditorExtensions(
	options?: CreateEditorExtensionsOptions,
) {
	const {
		enableSlashCommand = true,
		enableWikiLinks = true,
		enableMarkdownLinkAutocomplete = true,
		currentPath = "",
	} = options ?? {};
	return [
		StarterKit.configure({
			bulletList: { keepMarks: true, keepAttributes: false },
			orderedList: { keepMarks: true, keepAttributes: false },
			link: {
				openOnClick: false,
				autolink: true,
				defaultProtocol: "https",
			},
			underline: {},
		}),
		TaskList,
		TaskItem.configure({ nested: true }),
		TaskListMarkdownShortcut,
		TableEnterNavigation,
		Table.configure({ resizable: true }),
		TableRow,
		TableHeader,
		TableCell,
		MarkdownImage.configure({
			allowBase64: true,
		}),
		Markdown.configure({
			markedOptions: {
				gfm: true,
				breaks: false,
			},
		}),
		...(enableWikiLinks ? [WikiLink] : []),
		...(enableMarkdownLinkAutocomplete
			? [
					MarkdownLinkAutocomplete.configure({
						currentPath,
					}),
				]
			: []),
		...(enableSlashCommand ? [SlashCommand] : []),
		CalloutDecorations,
		TagDecorations,
	];
}
