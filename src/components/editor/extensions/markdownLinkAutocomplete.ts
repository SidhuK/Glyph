import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import {
	type EditorLinkSuggestion,
	suggestMarkdownLinks,
} from "../../../lib/linkSuggestions";
import { createTipTapSuggestionMenu } from "../suggestions/tiptapSuggestionMenu";

const MD_LINK_SUGGESTION_KEY = new PluginKey("markdown-link-suggestion");

export const MarkdownLinkAutocomplete = Extension.create({
	name: "markdown-link-autocomplete",
	addOptions() {
		return {
			suggestionLimit: 10,
			currentPath: "",
			getCurrentPath: null as (() => string) | null,
		};
	},
	addProseMirrorPlugins() {
		const getItems = async (query: string): Promise<EditorLinkSuggestion[]> => {
			const getSourcePath = () => {
				const currentPath =
					typeof this.options.getCurrentPath === "function"
						? this.options.getCurrentPath()
						: this.options.currentPath;
				return currentPath || null;
			};
			return suggestMarkdownLinks({
				query,
				sourcePath: getSourcePath(),
				limit: this.options.suggestionLimit,
			});
		};

		return [
			Suggestion<EditorLinkSuggestion>({
				editor: this.editor,
				pluginKey: MD_LINK_SUGGESTION_KEY,
				char: "](",
				allowedPrefixes: null,
				startOfLine: false,
				items: ({ query }) => getItems(query),
				command: ({ editor, range, props }) => {
					const lookbackFrom = Math.max(0, range.from - 300);
					const before = editor.state.doc.textBetween(
						lookbackFrom,
						range.from,
						"\n",
						"\n",
					);
					const imagePrefixMatch = before.match(/!\[([^\]\n]*)$/);
					if (imagePrefixMatch) {
						const imagePrefixLength = imagePrefixMatch[0]?.length ?? 0;
						const imageStart = range.from - imagePrefixLength;
						const alt = (imagePrefixMatch[1] ?? "").trim();
						const imageMarkdown = `![${alt}](${props.insertText})`;
						editor
							.chain()
							.focus()
							.deleteRange({ from: imageStart, to: range.to })
							.insertContent(imageMarkdown)
							.run();
						return;
					}
					editor
						.chain()
						.focus()
						.deleteRange(range)
						.insertContent(`](${props.insertText})`)
						.run();
				},
				render: () =>
					createTipTapSuggestionMenu<EditorLinkSuggestion>({
						menuClassName: "wikiLinkSuggestionMenu",
						lockEditorScroll: false,
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
							path.textContent = item.insertText;

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
