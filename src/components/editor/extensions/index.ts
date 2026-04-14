import { Extension } from "@tiptap/core";
import Link from "@tiptap/extension-link";
import {
	Table,
	TableCell,
	TableHeader,
	TableRow,
} from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import { SlashCommand } from "../slashCommands";
import { SyntaxHighlightedCodeBlock } from "./codeBlockHighlighting";
import { ColoredText } from "./coloredText";
import { HeadingCollapse } from "./headingCollapse";
import { HighlightedText } from "./highlightedText";
import { MarkdownImage } from "./markdownImage";
import { MarkdownLinkAutocomplete } from "./markdownLinkAutocomplete";
import { MermaidPreview } from "./mermaidPreview";
import { PersonAutocomplete } from "./personAutocomplete";
import { TagDecorations } from "./tagDecorations";
import { VimMode } from "./vimMode";
import { WikiLink } from "./wikiLink";
import { ZenFocus } from "./zenFocus";

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

function parseStandaloneMarkdownImage(
	text: string,
): { alt: string; src: string; title: string } | null {
	const trimmed = text.trim();
	const match = trimmed.match(/^!\[([^\]\n]*)\]\((.+?)(?:\s+"([^"]*)")?\)$/);
	if (!match) return null;
	const src = (match[2] ?? "").trim();
	if (!src) return null;
	return {
		alt: (match[1] ?? "").trim(),
		src,
		title: (match[3] ?? "").trim(),
	};
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

const MARKDOWN_LINK_TEXT_RE = /(?<!!)\[([^\]\n]+)\]\(([^)\n]+)\)/g;

function findMarkdownLinkTextMatches(text: string) {
	const matches: Array<{
		end: number;
		href: string;
		label: string;
		start: number;
	}> = [];
	for (const match of text.matchAll(MARKDOWN_LINK_TEXT_RE)) {
		if (match.index === undefined) continue;
		const label = (match[1] ?? "").trim();
		const href = (match[2] ?? "").trim();
		if (!label || !href) continue;
		const raw = match[0];
		matches.push({
			start: match.index,
			end: match.index + raw.length,
			label,
			href,
		});
	}
	return matches;
}

function mapTextOffsetToDocPos(
	node: ProseMirrorNode,
	pos: number,
	targetOffset: number,
	bias: "start" | "end",
): number | null {
	let textCursor = 0;
	let resolved: number | null = null;

	node.forEach((child, offset) => {
		if (resolved !== null || !child.isText) {
			textCursor += child.textContent.length;
			return;
		}
		const length = child.text?.length ?? 0;
		const start = textCursor;
		const end = start + length;
		const matchesOffset =
			bias === "start"
				? targetOffset >= start && targetOffset < end
				: targetOffset > start && targetOffset <= end;
		if (matchesOffset) {
			resolved = pos + 1 + offset + (targetOffset - start);
			return;
		}
		textCursor = end;
	});

	if (resolved !== null) return resolved;
	if (targetOffset === 0) return pos + 1;
	if (bias === "end" && targetOffset === textCursor)
		return pos + node.nodeSize - 1;
	return null;
}

function selectionTouchesRange(
	selectionFrom: number,
	selectionTo: number,
	rangeFrom: number,
	rangeTo: number,
): boolean {
	if (selectionFrom === selectionTo) {
		return selectionFrom > rangeFrom && selectionFrom < rangeTo;
	}
	return selectionFrom < rangeTo && selectionTo > rangeFrom;
}

function rangeTouchesCodeMark(
	node: ProseMirrorNode,
	startOffset: number,
	endOffset: number,
): boolean {
	let textCursor = 0;
	for (let index = 0; index < node.childCount; index += 1) {
		const child = node.child(index);
		if (!child.isText) {
			textCursor += child.textContent.length;
			continue;
		}
		const length = child.text?.length ?? 0;
		const childStart = textCursor;
		const childEnd = childStart + length;
		const overlaps = startOffset < childEnd && endOffset > childStart;
		if (overlaps && child.marks.some((mark) => mark.type.name === "code")) {
			return true;
		}
		textCursor = childEnd;
	}

	return false;
}

const MarkdownLinkSyntaxCollapse = Extension.create({
	name: "markdown-link-syntax-collapse",
	addProseMirrorPlugins() {
		const key = new PluginKey("markdown-link-syntax-collapse");
		return [
			new Plugin({
				key,
				appendTransaction(_transactions, _oldState, newState) {
					const linkMark = newState.schema.marks.link;
					if (!linkMark) return null;

					const replacements: Array<{
						from: number;
						href: string;
						label: string;
						to: number;
					}> = [];
					const { from: selectionFrom, to: selectionTo } = newState.selection;

					newState.doc.descendants((node, pos) => {
						if (
							node.type.name === "codeBlock" ||
							node.type.name === "code_block"
						) {
							return false;
						}
						if (!node.isTextblock) return;
						const text = node.textContent ?? "";
						if (!text.includes("](")) return;
						for (const match of findMarkdownLinkTextMatches(text)) {
							if (rangeTouchesCodeMark(node, match.start, match.end)) {
								continue;
							}
							const from = mapTextOffsetToDocPos(
								node,
								pos,
								match.start,
								"start",
							);
							const to = mapTextOffsetToDocPos(node, pos, match.end, "end");
							if (from === null || to === null || from >= to) continue;
							if (selectionTouchesRange(selectionFrom, selectionTo, from, to)) {
								continue;
							}
							replacements.push({
								from,
								to,
								label: match.label,
								href: match.href,
							});
						}
					});

					if (!replacements.length) return null;

					let tr = newState.tr;
					for (let index = replacements.length - 1; index >= 0; index -= 1) {
						const replacement = replacements[index];
						tr = tr.replaceWith(
							replacement.from,
							replacement.to,
							newState.schema.text(replacement.label, [
								linkMark.create({ href: replacement.href }),
							]),
						);
					}

					return tr.docChanged ? tr : null;
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

const MarkdownImageShortcut = Extension.create({
	name: "markdown-image-shortcut",
	addProseMirrorPlugins() {
		const key = new PluginKey("markdown-image-shortcut");
		return [
			new Plugin({
				key,
				appendTransaction(transactions, _oldState, newState) {
					if (!transactions.some((tr) => tr.docChanged)) return null;

					const paragraph = newState.schema.nodes.paragraph;
					const image = newState.schema.nodes.image;
					if (!paragraph || !image) return null;

					const replacements: Array<{
						pos: number;
						size: number;
						alt: string;
						src: string;
						title: string;
					}> = [];

					newState.doc.descendants((node, pos) => {
						if (node.type !== paragraph || node.childCount !== 1) return;
						if (node.firstChild?.type.name !== "text") return;
						const parsed = parseStandaloneMarkdownImage(node.textContent ?? "");
						if (!parsed) return;
						const $pos = newState.doc.resolve(pos);
						const parent = $pos.parent;
						if (parent.type.name === "listItem") return;
						const index = $pos.index();
						if (!parent.canReplaceWith(index, index + 1, image)) return;
						replacements.push({
							pos,
							size: node.nodeSize,
							alt: parsed.alt,
							src: parsed.src,
							title: parsed.title,
						});
					});

					if (!replacements.length) return null;

					let tr = newState.tr;
					for (let i = replacements.length - 1; i >= 0; i -= 1) {
						const replacement = replacements[i];
						tr = tr.replaceWith(
							replacement.pos,
							replacement.pos + replacement.size,
							image.create({
								src: replacement.src,
								alt: replacement.alt,
								title: replacement.title,
								originSrc: replacement.src,
							}),
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

const EditorLink = Link.extend({
	inclusive: false,
	addKeyboardShortcuts() {
		return {
			"Mod-k": () => true,
		};
	},
}).configure({
	openOnClick: false,
	autolink: true,
	defaultProtocol: "https",
});

interface CreateEditorExtensionsOptions {
	enableSlashCommand?: boolean;
	enableWikiLinks?: boolean;
	enableMarkdownLinkAutocomplete?: boolean;
	enablePeopleMentions?: boolean;
	enableVimKeybindings?: boolean;
	currentPath?: string;
	currentPathResolver?: (() => string) | null;
	getZenModeEnabled?: (() => boolean) | null;
}

export function createEditorExtensions(
	options?: CreateEditorExtensionsOptions,
) {
	const {
		enableSlashCommand = true,
		enableWikiLinks = true,
		enableMarkdownLinkAutocomplete = true,
		enablePeopleMentions = false,
		enableVimKeybindings = false,
		currentPath = "",
		currentPathResolver = null,
		getZenModeEnabled = null,
	} = options ?? {};
	return [
		StarterKit.configure({
			bulletList: { keepMarks: true, keepAttributes: false },
			codeBlock: false,
			orderedList: { keepMarks: true, keepAttributes: false },
			link: false,
			underline: {},
		}),
		HighlightedText,
		ColoredText,
		SyntaxHighlightedCodeBlock,
		EditorLink,
		TaskList,
		TaskItem.configure({ nested: true }),
		TaskListMarkdownShortcut,
		MarkdownLinkSyntaxCollapse,
		MarkdownImageShortcut,
		TableEnterNavigation,
		Table.configure({ resizable: true }),
		TableRow,
		TableHeader,
		TableCell,
		MarkdownImage.configure({
			allowBase64: true,
		}),
		MermaidPreview,
		HeadingCollapse,
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
						getCurrentPath: currentPathResolver,
					}),
				]
			: []),
		...(enablePeopleMentions ? [PersonAutocomplete] : []),
		...(enableSlashCommand ? [SlashCommand] : []),
		CalloutDecorations,
		TagDecorations.configure({ enablePeopleMentions }),
		ZenFocus.configure({
			getZenModeEnabled: getZenModeEnabled ?? (() => false),
		}),
		...(enableVimKeybindings ? [VimMode] : []),
	];
}
