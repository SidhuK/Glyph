import {
	Node,
	mergeAttributes,
	nodeInputRule,
	nodePasteRule,
} from "@tiptap/core";
import type { MarkdownToken } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { invoke } from "../../../lib/tauri";
import {
	parseWikiLink,
	wikiLinkAttrsToMarkdown,
} from "../markdown/wikiLinkCodec";
import type { WikiLinkAttrs } from "../markdown/wikiLinkTypes";

const WIKI_LINK_INPUT_REGEX = /(!?\[\[[^\]\n]+\]\])$/;
const WIKI_LINK_PASTE_REGEX = /(!?\[\[[^\]\n]+\]\])/g;
const WIKI_LINK_SUGGESTION_KEY = new PluginKey("wiki-link-suggestion");

interface WikiLinkSuggestionItem {
	path: string;
	title: string;
	insertText: string;
}

function attrsFromRaw(raw: string): WikiLinkAttrs | null {
	return parseWikiLink(raw);
}

function titleFromRelPath(path: string): string {
	const parts = path.split("/").filter(Boolean);
	const name = parts[parts.length - 1] ?? path;
	return name.replace(/\.md$/i, "") || name;
}

function isImageTarget(target: string): boolean {
	const lower = target.toLowerCase();
	return (
		lower.endsWith(".png") ||
		lower.endsWith(".jpg") ||
		lower.endsWith(".jpeg") ||
		lower.endsWith(".webp") ||
		lower.endsWith(".gif") ||
		lower.endsWith(".svg") ||
		lower.endsWith(".bmp") ||
		lower.endsWith(".avif") ||
		lower.endsWith(".tif") ||
		lower.endsWith(".tiff")
	);
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		wikiLink: {
			setWikiLink: (attrs: WikiLinkAttrs) => ReturnType;
			updateWikiLink: (attrs: Partial<WikiLinkAttrs>) => ReturnType;
			removeWikiLink: () => ReturnType;
		};
	}
}

export const WikiLink = Node.create({
	name: "wikiLink",
	addOptions() {
		return {
			suggestionLimit: 8,
		};
	},
	inline: true,
	group: "inline",
	atom: true,
	selectable: true,
	draggable: false,
	markdownTokenName: "wikiLink",
	addAttributes() {
		return {
			raw: { default: "" },
			target: { default: "" },
			alias: { default: null },
			embed: { default: false },
			anchorKind: { default: "none" },
			anchor: { default: null },
			unresolved: { default: false },
		};
	},
	parseHTML() {
		return [
			{ tag: 'span[data-wikilink="true"]' },
			{
				tag: 'img[data-wikilink-embed="true"]',
				getAttrs: (element) => {
					if (!(element instanceof HTMLElement)) return false;
					const target =
						element.getAttribute("data-target") ??
						element.getAttribute("src") ??
						"";
					if (!target || !isImageTarget(target)) return false;
					const alias = element.getAttribute("data-alias");
					return {
						raw: element.getAttribute("data-raw") ?? `![[${target}]]`,
						target,
						alias: alias && alias.length > 0 ? alias : null,
						embed: true,
					};
				},
			},
		];
	},
	renderHTML({ node, HTMLAttributes }) {
		const alias =
			typeof node.attrs.alias === "string" ? node.attrs.alias.trim() : "";
		const target =
			typeof node.attrs.target === "string" ? node.attrs.target.trim() : "";
		const imageLike = target && isImageTarget(target);
		if (node.attrs.embed && imageLike) {
			const fallbackName = target.split("/").pop() ?? target;
			const alt = alias || fallbackName;
			return [
				"img",
				mergeAttributes(HTMLAttributes, {
					src: target,
					alt,
					"data-wikilink": "true",
					"data-target": node.attrs.target,
					"data-alias": node.attrs.alias ?? "",
					"data-raw": node.attrs.raw ?? "",
					"data-wikilink-embed": "true",
					class: "markdownImage wikiLinkEmbedImage",
				}),
			];
		}

		// Show alias if present, otherwise just the filename without path/extension
		const displayName = imageLike
			? (node.attrs.raw as string) || `![[${target}]]`
			: alias || target.split("/").pop()?.replace(/\.md$/i, "") || target;
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-wikilink": "true",
				"data-target": node.attrs.target,
				"data-anchor-kind": node.attrs.anchorKind,
				"data-anchor": node.attrs.anchor ?? "",
				"data-alias": node.attrs.alias ?? "",
				"data-unresolved": String(Boolean(node.attrs.unresolved)),
				class: "wikiLink",
			}),
			displayName,
		];
	},
	renderText({ node }) {
		return wikiLinkAttrsToMarkdown(node.attrs);
	},
	parseMarkdown(token: MarkdownToken, helpers) {
		const raw = (token.raw ?? "").trim();
		const parsed = attrsFromRaw(raw);
		if (!parsed) return helpers.createTextNode(raw || token.text || "");
		return helpers.createNode("wikiLink", parsed);
	},
	renderMarkdown(node) {
		return wikiLinkAttrsToMarkdown(node.attrs ?? {});
	},
	markdownTokenizer: {
		name: "wikiLink",
		level: "inline",
		start(src: string) {
			const match = src.match(/!?\[\[[^\]\n]+\]\]/);
			return match?.index ?? -1;
		},
		tokenize(src: string) {
			const match = src.match(/^!?\[\[[^\]\n]+\]\]/);
			if (!match) return undefined;
			const parsed = attrsFromRaw(match[0]);
			if (!parsed) return undefined;
			return {
				type: "wikiLink",
				raw: match[0],
				text: match[0],
				attributes: parsed,
			};
		},
	},
	addCommands() {
		return {
			setWikiLink:
				(attrs: WikiLinkAttrs) =>
				({ commands }) =>
					commands.insertContent({ type: "wikiLink", attrs }),
			updateWikiLink:
				(attrs: Partial<WikiLinkAttrs>) =>
				({ editor, commands }) => {
					const { from, to } = editor.state.selection;
					let current: Record<string, unknown> = {};
					editor.state.doc.nodesBetween(from, to, (node) => {
						if (node.type.name === "wikiLink") current = node.attrs;
					});
					if (!Object.keys(current).length) return false;
					return commands.updateAttributes("wikiLink", {
						...current,
						...attrs,
					});
				},
			removeWikiLink:
				() =>
				({ commands }) =>
					commands.deleteSelection(),
		};
	},
	addInputRules() {
		return [
			nodeInputRule({
				find: WIKI_LINK_INPUT_REGEX,
				type: this.type,
				getAttributes: (match) => attrsFromRaw(match[1]) ?? false,
			}),
		];
	},
	addPasteRules() {
		return [
			nodePasteRule({
				find: WIKI_LINK_PASTE_REGEX,
				type: this.type,
				getAttributes: (match) => attrsFromRaw(match[1]) ?? false,
			}),
		];
	},
	addProseMirrorPlugins() {
		const getSuggestions = async (
			query: string,
		): Promise<WikiLinkSuggestionItem[]> => {
			const results = await invoke("space_suggest_links", {
				request: {
					query,
					markdown_only: true,
					strip_markdown_ext: true,
					relative_to_source: false,
					limit: this.options.suggestionLimit,
				},
			});
			return results.map((item) => ({
				path: item.path,
				title: item.title || titleFromRelPath(item.path),
				insertText: item.insert_text,
			}));
		};

		return [
			Suggestion<WikiLinkSuggestionItem>({
				editor: this.editor,
				pluginKey: WIKI_LINK_SUGGESTION_KEY,
				char: "[[",
				allowedPrefixes: null,
				startOfLine: false,
				items: async ({ query }) => getSuggestions(query),
				command: ({ editor, range, props }) => {
					const raw = `[[${props.insertText}]]`;
					const parsed = parseWikiLink(raw);
					if (!parsed) return;
					editor
						.chain()
						.focus()
						.deleteRange(range)
						.insertContent({
							type: "wikiLink",
							attrs: parsed,
						})
						.insertContent(" ")
						.run();
				},
				render: () => {
					let menu: HTMLDivElement | null = null;
					let selectedIndex = 0;
					let activeProps: SuggestionProps<WikiLinkSuggestionItem> | null =
						null;

					const updateSelection = (items: WikiLinkSuggestionItem[]) => {
						if (!menu) return;
						const children = Array.from(menu.children);
						children.forEach((child, index) => {
							child.classList.toggle("active", index === selectedIndex);
						});
						if (!items.length) selectedIndex = 0;
					};

					const updateMenu = (
						props: SuggestionProps<WikiLinkSuggestionItem>,
					) => {
						if (!menu) return;
						menu.innerHTML = "";
						if (!props.items.length) return;
						for (const [index, item] of props.items.entries()) {
							const button = document.createElement("button");
							button.type = "button";
							button.className = "wikiLinkSuggestionItem";
							button.innerHTML = `<span class="wikiLinkSuggestionTitle">${item.title}</span><span class="wikiLinkSuggestionPath">${item.path}</span>`;
							button.addEventListener("mousedown", (event) => {
								event.preventDefault();
								props.command(item);
							});
							if (index === selectedIndex) button.classList.add("active");
							menu.append(button);
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

					const createMenu = (
						props: SuggestionProps<WikiLinkSuggestionItem>,
					) => {
						if (menu) menu.remove();
						menu = document.createElement("div");
						menu.className = "wikiLinkSuggestionMenu";
						document.body.append(menu);
						updateMenu(props);
					};

					return {
						onStart: (props: SuggestionProps<WikiLinkSuggestionItem>) => {
							activeProps = props;
							selectedIndex = 0;
							createMenu(props);
						},
						onUpdate: (props: SuggestionProps<WikiLinkSuggestionItem>) => {
							activeProps = props;
							if (!menu) createMenu(props);
							updateMenu(props);
						},
						onKeyDown: ({ event }) => {
							const current = activeProps;
							if (!current?.items.length) return false;
							if (event.key === "ArrowDown") {
								selectedIndex = (selectedIndex + 1) % current.items.length;
								updateSelection(current.items);
								return true;
							}
							if (event.key === "ArrowUp") {
								selectedIndex =
									(selectedIndex - 1 + current.items.length) %
									current.items.length;
								updateSelection(current.items);
								return true;
							}
							if (event.key === "Enter" || event.key === "Tab") {
								event.preventDefault();
								current.command(current.items[selectedIndex]);
								return true;
							}
							if (event.key === "Escape") return true;
							return false;
						},
						onExit: () => {
							if (menu) menu.remove();
							menu = null;
							activeProps = null;
						},
					};
				},
			}),
		];
	},
});
