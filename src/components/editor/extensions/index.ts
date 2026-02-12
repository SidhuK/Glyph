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

interface CreateEditorExtensionsOptions {
	enableSlashCommand?: boolean;
	enableWikiLinks?: boolean;
}

export function createEditorExtensions(
	options?: CreateEditorExtensionsOptions,
) {
	const { enableSlashCommand = true, enableWikiLinks = true } = options ?? {};
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
		...(enableWikiLinks ? [WikiLink] : []),
		...(enableSlashCommand ? [SlashCommand] : []),
		CalloutDecorations,
	];
}
