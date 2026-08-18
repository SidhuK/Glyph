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
} from "../../../lib/linkSuggestions";
import {
	parseWikiLink,
	splitWikiLinkQuery,
	wikiLinkAttrsToMarkdown,
	wikiLinkDisplayName,
} from "../markdown/wikiLinkCodec";
import { suggestWikiLinkItems } from "../markdown/wikiLinkHeadingSuggest";
import type { WikiLinkAttrs } from "../markdown/wikiLinkTypes";
import { createTipTapTextSuggestionMenu } from "../suggestions/tiptapSuggestionMenu";

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

function insertWikiLinkNode(
	editor: SuggestionProps<EditorLinkSuggestion>["editor"],
	range: { from: number; to: number },
	inner: string,
	asEmbed: boolean,
): boolean {
	const replaceFrom = asEmbed
		? getEmbedReplacementFrom(editor, range.from)
		: range.from;
	const raw = asEmbed ? `![[${inner}]]` : `[[${inner}]]`;
	const parsed = parseWikiLink(raw);
	if (!parsed) return false;
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
	return true;
}

function completeWikiLinkTarget(
	editor: SuggestionProps<EditorLinkSuggestion>["editor"],
	range: { from: number; to: number },
	insertText: string,
	asEmbed: boolean,
): void {
	const replaceFrom = asEmbed
		? getEmbedReplacementFrom(editor, range.from)
		: range.from;
	const next = `${asEmbed ? "![[" : "[["}${insertText}`;
	editor
		.chain()
		.focus()
		.deleteRange({
			from: replaceFrom,
			to: range.to,
		})
		.insertContent(next)
		.run();
}

function commitWikiLinkQuery(
	editor: SuggestionProps<EditorLinkSuggestion>["editor"],
	range: { from: number; to: number },
	query: string,
	asEmbed: boolean,
): boolean {
	const parsed = splitWikiLinkQuery(query);
	if (!parsed.target) return false;
	switch (parsed.kind) {
		case "file":
			return insertWikiLinkNode(editor, range, parsed.target, asEmbed);
		case "heading": {
			const heading = parsed.headingQuery.trim();
			const inner = heading ? `${parsed.target}#${heading}` : parsed.target;
			return insertWikiLinkNode(editor, range, inner, asEmbed);
		}
		default: {
			const _exhaustive: never = parsed;
			return _exhaustive;
		}
	}
}

function acceptWikiLinkSuggestion(
	item: EditorLinkSuggestion,
	props: SuggestionProps<EditorLinkSuggestion>,
): void {
	if (item.kind === "heading") {
		props.command(item);
		return;
	}
	completeWikiLinkTarget(
		props.editor,
		props.range,
		item.insertText,
		isEmbedSuggestionContext(props.editor, props.range.from),
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

		const displayName = wikiLinkDisplayName({
			target: node.attrs.target,
			alias: node.attrs.alias,
			anchor: node.attrs.anchor,
			anchorKind: node.attrs.anchorKind,
		});
		return [
			"span",
			mergeAttributes(HTMLAttributes, {
				"data-wikilink": "true",
				"data-wikilink-embed": String(Boolean(node.attrs.embed)),
				"data-target": node.attrs.target,
				"data-anchor-kind": node.attrs.anchorKind,
				"data-anchor": node.attrs.anchor ?? "",
				"data-alias": node.attrs.alias ?? "",
				"data-raw": node.attrs.raw ?? "",
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
					return suggestWikiLinkItems({
						query,
						embedOnly: asEmbed,
						limit: this.options.suggestionLimit,
					});
				},
				command: ({ editor, range, props }) => {
					const asEmbed = isEmbedSuggestionContext(editor, range.from);
					insertWikiLinkNode(editor, range, props.insertText, asEmbed);
				},
				render: () =>
					createTipTapTextSuggestionMenu<EditorLinkSuggestion>({
						menuClassName: "wikiLinkSuggestionMenu",
						itemContent: (item) => ({
							title: item.title,
							description:
								item.kind === "heading" ? `#${item.slug}` : item.path,
						}),
						onTab: acceptWikiLinkSuggestion,
						onEmptyEnter: (props) =>
							commitWikiLinkQuery(
								props.editor,
								props.range,
								props.query,
								isEmbedSuggestionContextFromQuery(props.editor, props.query),
							),
					}),
			}),
		];
	},
});
