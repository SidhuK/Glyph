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

function parseCalloutMarker(text: string): { kind: string; title: string } | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith("[!")) return null;
	const match = trimmed.match(/^\[!([A-Za-z_-]+)\]\s*(.*)$/);
	if (!match) return null;
	const rawKind = (match[1] ?? "note").toLowerCase();
	const kind = rawKind === "warn" ? "warning" : rawKind;
	const rawTitle = (match[2] ?? "").trim();
	const title =
		rawTitle || `${kind.slice(0, 1).toUpperCase()}${kind.slice(1)}`;
	return { kind, title };
}

const CalloutDecorations = Extension.create({
	name: "callout-decorations",
	addProseMirrorPlugins() {
		const key = new PluginKey("callout-decorations");
		return [
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
