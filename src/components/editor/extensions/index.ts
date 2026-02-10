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
							const first = node.firstChild;
							const text = first?.textContent?.trim() ?? "";
							if (!text.startsWith("[!")) return;
							const match = text.match(/^\[!([A-Za-z]+)\]\s*(.*)$/);
							if (!match) return;
							const rawType = match[1]?.toLowerCase() ?? "note";
							const titleText = match[2]?.trim();
							const title =
								titleText ||
								`${rawType.slice(0, 1).toUpperCase()}${rawType.slice(1)}`;
							decorations.push(
								Decoration.node(pos, pos + node.nodeSize, {
									class: `callout callout-${rawType}`,
									"data-callout": rawType,
									"data-callout-title": title,
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
