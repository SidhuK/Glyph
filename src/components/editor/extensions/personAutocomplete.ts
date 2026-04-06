import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { type PersonCount, invoke } from "../../../lib/tauri";

const PERSON_SUGGESTION_KEY = new PluginKey("person-suggestion");

interface PersonSuggestionItem {
	handle: string;
	count: number | null;
	isNew: boolean;
}

function normalizeHandle(value: string): string {
	return value
		.trim()
		.replace(/^@+/, "")
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, "");
}

function isValidHandle(value: string): boolean {
	return /^[a-z0-9_][a-z0-9_-]*$/.test(value);
}

export const PersonAutocomplete = Extension.create({
	name: "person-autocomplete",
	addOptions() {
		return {
			suggestionLimit: 8,
		};
	},
	addProseMirrorPlugins() {
		const getItems = async (query: string): Promise<PersonSuggestionItem[]> => {
			const normalized = normalizeHandle(query);
			let people: PersonCount[] = [];
			try {
				people = (await invoke("people_list", {
					limit: this.options.suggestionLimit * 5,
				})) as PersonCount[];
			} catch (error) {
				console.warn("Failed to load people suggestions", error);
				return [];
			}
			const matches: PersonSuggestionItem[] = (people as PersonCount[])
				.filter((person) =>
					normalized.length === 0 ? true : person.handle.includes(normalized),
				)
				.sort((left, right) => left.handle.localeCompare(right.handle))
				.slice(0, this.options.suggestionLimit)
				.map((person) => ({
					handle: person.handle,
					count: person.count,
					isNew: false,
				}));

			if (
				normalized.length >= 1 &&
				isValidHandle(normalized) &&
				!matches.some((person) => person.handle === normalized)
			) {
				matches.unshift({
					handle: normalized,
					count: null,
					isNew: true,
				});
			}
			return matches.slice(0, this.options.suggestionLimit);
		};

		return [
			Suggestion<PersonSuggestionItem>({
				editor: this.editor,
				pluginKey: PERSON_SUGGESTION_KEY,
				char: "@",
				startOfLine: false,
				allowedPrefixes: [" ", "\t", "\n", "(", "[", "{"],
				allow: ({ state, range }) => {
					const textBefore = state.doc.textBetween(
						Math.max(0, range.from - 1),
						range.from,
						"\n",
						"\n",
					);
					const prev = textBefore.slice(-1);
					return !prev || /[\s([{]/.test(prev);
				},
				items: ({ query }) => getItems(query),
				command: ({ editor, range, props }) => {
					editor
						.chain()
						.focus()
						.deleteRange(range)
						.insertContent(`@${props.handle}`)
						.run();
				},
				render: () => {
					let menu: HTMLDivElement | null = null;
					let selectedIndex = 0;
					let activeProps: SuggestionProps<PersonSuggestionItem> | null = null;

					const updateMenu = (props: SuggestionProps<PersonSuggestionItem>) => {
						if (!menu) return;
						menu.innerHTML = "";
						for (const [index, item] of props.items.entries()) {
							const button = document.createElement("button");
							button.type = "button";
							button.className = "wikiLinkSuggestionItem";
							const meta = item.isNew
								? "Create mention"
								: `${item.count ?? 0} note${item.count === 1 ? "" : "s"}`;
							const title = document.createElement("span");
							title.className = "wikiLinkSuggestionTitle";
							title.textContent = `@${item.handle}`;
							const path = document.createElement("span");
							path.className = "wikiLinkSuggestionPath";
							path.textContent = String(meta);
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
						onStart: (props: SuggestionProps<PersonSuggestionItem>) => {
							activeProps = props;
							selectedIndex = 0;
							menu = document.createElement("div");
							menu.className = "wikiLinkSuggestionMenu";
							document.body.append(menu);
							updateMenu(props);
						},
						onUpdate: (props: SuggestionProps<PersonSuggestionItem>) => {
							activeProps = props;
							selectedIndex = 0;
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
