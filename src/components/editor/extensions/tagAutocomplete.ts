import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import type { TagCount } from "../../../lib/tauri";
import { invoke } from "../../../lib/tauri";
import { normalizeTagDraftPrefix, normalizeTagToken } from "../noteProperties/utils";
import {
	type TagSuggestionItem,
	renderTagSuggestionRow,
	tagSuggestionFooter,
} from "../suggestions/tagSuggestionRow";
import { createTipTapSuggestionMenu } from "../suggestions/tiptapSuggestionMenu";

const TAG_SUGGESTION_KEY = new PluginKey("tag-suggestion");

function rankInlineTag(tag: string, normalizedQuery: string, descendantPrefix: string): number {
	if (tag === normalizedQuery) return 0;
	if (tag.startsWith(descendantPrefix)) return 1;
	if (tag.startsWith(normalizedQuery)) return 2;
	return 3;
}

export const TagAutocomplete = Extension.create({
	name: "tag-autocomplete",
	addOptions() {
		return {
			suggestionLimit: 8,
		};
	},
	addProseMirrorPlugins() {
		let requestId = 0;
		const getItems = async (query: string): Promise<TagSuggestionItem[]> => {
			const currentRequestId = requestId + 1;
			requestId = currentRequestId;
			const normalizedQuery = normalizeTagDraftPrefix(query);
			if (!normalizedQuery) return [];
			let tags: TagCount[] = [];
			try {
				tags = await invoke("tags_list", {
					limit: this.options.suggestionLimit,
					query: normalizedQuery,
				});
			} catch (error) {
				console.warn("Failed to load tag suggestions", error);
				tags = [];
			}
			// Stale responses must not resolve as [] — TipTap would clear the active menu.
			if (currentRequestId !== requestId) {
				return new Promise<TagSuggestionItem[]>(() => {});
			}
			const descendantPrefix = normalizedQuery.endsWith("/")
				? normalizedQuery
				: `${normalizedQuery}/`;
			const matches = tags
				.filter(
					({ tag, is_explicit }) =>
						is_explicit && (tag.startsWith(normalizedQuery) || tag.includes(normalizedQuery)),
				)
				.sort((left, right) => {
					const leftRank = rankInlineTag(left.tag, normalizedQuery, descendantPrefix);
					const rightRank = rankInlineTag(right.tag, normalizedQuery, descendantPrefix);
					if (leftRank !== rightRank) return leftRank - rightRank;
					return left.tag.localeCompare(right.tag);
				})
				.map(({ tag, direct_count }) => ({
					tag,
					count: direct_count,
					isNew: false,
				}));
			const normalizedTag = normalizeTagToken(normalizedQuery);
			if (!normalizedTag || matches.some(({ tag }) => tag === normalizedTag)) {
				return matches.slice(0, this.options.suggestionLimit);
			}
			return [
				...matches.slice(0, this.options.suggestionLimit - 1),
				{ tag: normalizedTag, count: 0, isNew: true },
			];
		};

		return [
			Suggestion<TagSuggestionItem>({
				editor: this.editor,
				pluginKey: TAG_SUGGESTION_KEY,
				char: "#",
				shouldShow: ({ editor }) => editor.view.hasFocus(),
				startOfLine: false,
				allowSpaces: false,
				allowedPrefixes: [" ", "\t", "\n", "(", "[", "{", '"', "'"],
				allow: ({ state, range }) => {
					const previousChar = state.doc.textBetween(
						Math.max(0, range.from - 1),
						range.from,
						"\n",
						"\n",
					);
					return !previousChar || /[\s([{"']/.test(previousChar);
				},
				items: ({ query }) => getItems(query),
				command: ({ editor, range, props }) => {
					editor.chain().focus().deleteRange(range).insertContent(`#${props.tag} `).run();
				},
				render: () =>
					createTipTapSuggestionMenu<TagSuggestionItem>({
						menuClassName: "wikiLinkSuggestionMenu tagSuggestionMenu",
						renderItem: ({ item, isActive, select, query = "" }) =>
							renderTagSuggestionRow(item, query, { isActive, onSelect: () => select(item) }),
						footer: tagSuggestionFooter,
					}),
			}),
		];
	},
});
