import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import {
	type EditorLinkSuggestion,
	suggestMarkdownLinks,
} from "../../../lib/linkSuggestions";

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
			const currentPath =
				typeof this.options.getCurrentPath === "function"
					? this.options.getCurrentPath()
					: this.options.currentPath;
			return suggestMarkdownLinks({
				query,
				sourcePath: currentPath || null,
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
				render: () => {
					let menu: HTMLDivElement | null = null;
					let selectedIndex = 0;
					let activeProps: SuggestionProps<EditorLinkSuggestion> | null = null;

					const updateMenu = (props: SuggestionProps<EditorLinkSuggestion>) => {
						if (!menu) return;
						menu.replaceChildren();
						for (const [index, item] of props.items.entries()) {
							const button = document.createElement("button");
							button.type = "button";
							button.className = "wikiLinkSuggestionItem";

							const title = document.createElement("span");
							title.className = "wikiLinkSuggestionTitle";
							title.textContent = item.title;

							const path = document.createElement("span");
							path.className = "wikiLinkSuggestionPath";
							path.textContent = item.insertText;

							button.append(title, path);
							button.addEventListener("mousedown", (event) => {
								event.preventDefault();
								props.command(item);
							});
							if (index === selectedIndex) button.classList.add("active");
							menu.append(button);
						}
						const rect = props.clientRect?.();
						if (rect) {
							menu.style.left = `${rect.left}px`;
							menu.style.top = `${rect.bottom + 6}px`;
						}
					};

					return {
						onStart: (props: SuggestionProps<EditorLinkSuggestion>) => {
							activeProps = props;
							selectedIndex = 0;
							menu = document.createElement("div");
							menu.className = "wikiLinkSuggestionMenu";
							document.body.append(menu);
							updateMenu(props);
						},
						onUpdate: (props: SuggestionProps<EditorLinkSuggestion>) => {
							activeProps = props;
							updateMenu(props);
						},
						onKeyDown: ({ event }) => {
							const current = activeProps;
							if (!current?.items.length) return false;
							if (event.key === "ArrowDown") {
								selectedIndex = (selectedIndex + 1) % current.items.length;
								updateMenu(current);
								return true;
							}
							if (event.key === "ArrowUp") {
								selectedIndex =
									(selectedIndex - 1 + current.items.length) %
									current.items.length;
								updateMenu(current);
								return true;
							}
							if (event.key === "Enter" || event.key === "Tab") {
								event.preventDefault();
								current.command(current.items[selectedIndex]);
								return true;
							}
							return false;
						},
						onExit: () => {
							menu?.remove();
							menu = null;
							activeProps = null;
						},
					};
				},
			}),
		];
	},
});
