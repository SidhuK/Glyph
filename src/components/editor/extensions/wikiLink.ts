import {
	Node,
	mergeAttributes,
	nodeInputRule,
	nodePasteRule,
} from "@tiptap/core";
import type { MarkdownToken } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import {
	type EditorLinkSuggestion,
	isImageTarget,
	suggestWikiLinks,
} from "../../../lib/linkSuggestions";
import {
	parseWikiLink,
	wikiLinkAttrsToMarkdown,
} from "../markdown/wikiLinkCodec";
import type { WikiLinkAttrs } from "../markdown/wikiLinkTypes";
import { createTipTapSuggestionMenu } from "../suggestions/tiptapSuggestionMenu";

const WIKI_LINK_INPUT_REGEX = /(!?\[\[[^\]\n]+\]\])$/;
const WIKI_LINK_PASTE_REGEX = /(!?\[\[[^\]\n]+\]\])/g;
const WIKI_LINK_SUGGESTION_KEY = new PluginKey("wiki-link-suggestion");
const WIKI_LINK_FILE_ICON = [
	"span",
	{
		class: "wikiLinkIcon",
		"aria-hidden": "true",
	},
];

function isEmbedSuggestionContext(
	editor: SuggestionProps<EditorLinkSuggestion>["editor"],
	rangeFrom: number,
): boolean {
	if (rangeFrom <= 1) return false;
	try {
		const previousChar = editor.state.doc.textBetween(
			rangeFrom - 1,
			rangeFrom,
			"",
			"",
		);
		if (previousChar !== "!") return false;
		if (rangeFrom <= 2) return true;
		const beforePreviousChar = editor.state.doc.textBetween(
			rangeFrom - 2,
			rangeFrom - 1,
			"",
			"",
		);
		return beforePreviousChar !== "!";
	} catch {
		return false;
	}
}

function getEmbedReplacementFrom(
	editor: SuggestionProps<EditorLinkSuggestion>["editor"],
	rangeFrom: number,
): number {
	if (!isEmbedSuggestionContext(editor, rangeFrom)) return rangeFrom;
	return Math.max(0, rangeFrom - 1);
}

function isEmbedSuggestionContextFromQuery(
	editor: SuggestionProps<EditorLinkSuggestion>["editor"],
	query: string,
): boolean {
	const cursor = editor.state.selection.from;
	const startOfOpenBrackets = cursor - query.length - 2;
	return isEmbedSuggestionContext(editor, startOfOpenBrackets);
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

		const targetName = target.split("/").pop()?.replace(/\.md$/i, "") || target;
		const displayName = alias || targetName;
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
			WIKI_LINK_FILE_ICON,
			["span", { class: "wikiLinkLabel" }, displayName],
		];
	},
	renderText({ node }) {
		return wikiLinkAttrsToMarkdown(node.attrs);
	},
	parseMarkdown(token: MarkdownToken, helpers) {
		const raw = (token.raw ?? "").trim();
		const parsed = parseWikiLink(raw);
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
			const parsed = parseWikiLink(match[0]);
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
				getAttributes: (match) => parseWikiLink(match[1]) ?? false,
			}),
		];
	},
	addPasteRules() {
		return [
			nodePasteRule({
				find: WIKI_LINK_PASTE_REGEX,
				type: this.type,
				getAttributes: (match) => parseWikiLink(match[1]) ?? false,
			}),
		];
	},
	addProseMirrorPlugins() {
		const getSuggestions = async (
			query: string,
			includeImagesOnly: boolean,
		): Promise<EditorLinkSuggestion[]> => {
			return suggestWikiLinks({
				query,
				embedOnly: includeImagesOnly,
				limit: this.options.suggestionLimit,
			});
		};

		return [
			Suggestion<EditorLinkSuggestion>({
				editor: this.editor,
				pluginKey: WIKI_LINK_SUGGESTION_KEY,
				char: "[[",
				allowSpaces: true,
				allowedPrefixes: null,
				startOfLine: false,
				allow: ({ state, range }) => {
					const query = state.doc.textBetween(
						range.from + 2,
						range.to,
						"\n",
						"\n",
					);
					return (
						!query.includes("]]") &&
						!query.includes("[") &&
						!query.includes("]") &&
						!query.includes("\n")
					);
				},
				items: async ({ editor, query }) => {
					const asEmbed = isEmbedSuggestionContextFromQuery(editor, query);
					return getSuggestions(query, asEmbed);
				},
				command: ({ editor, range, props }) => {
					const asEmbed = isEmbedSuggestionContext(editor, range.from);
					const replaceFrom = asEmbed
						? getEmbedReplacementFrom(editor, range.from)
						: range.from;
					const raw = asEmbed
						? `![[${props.insertText}]]`
						: `[[${props.insertText}]]`;
					const parsed = parseWikiLink(raw);
					if (!parsed) return;
					editor
						.chain()
						.focus()
						.deleteRange({
							from: replaceFrom,
							to: range.to,
						})
						.insertContent({
							type: "wikiLink",
							attrs: parsed,
						})
						.insertContent(" ")
						.run();
				},
				render: () =>
					createTipTapSuggestionMenu<EditorLinkSuggestion>({
						menuClassName: "wikiLinkSuggestionMenu",
						renderItem: ({ item, isActive, select }) => {
							const button = document.createElement("button");
							button.type = "button";
							button.className = "wikiLinkSuggestionItem";
							button.classList.toggle("active", isActive);

							const title = document.createElement("span");
							title.className = "wikiLinkSuggestionTitle";
							title.textContent = item.title;

							const path = document.createElement("span");
							path.className = "wikiLinkSuggestionPath";
							path.textContent = item.path;

							button.append(title, path);
							button.addEventListener("mousedown", (event) => {
								event.preventDefault();
								select(item);
							});
							return button;
						},
					}),
			}),
		];
	},
});
