import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { type PersonCount, invoke } from "../../../lib/tauri";
import { createTipTapSuggestionMenu } from "../suggestions/tiptapSuggestionMenu";

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
		let requestId = 0;
		const getItems = async (query: string): Promise<PersonSuggestionItem[]> => {
			const currentRequestId = requestId + 1;
			requestId = currentRequestId;
			const normalized = normalizeHandle(query);
			let people: PersonCount[] = [];
			try {
				people = await invoke("people_list", {
					limit: this.options.suggestionLimit * 5,
				});
			} catch (error) {
				console.warn("Failed to load people suggestions", error);
				people = [];
			}
			// Stale responses must not resolve as [] — TipTap would clear the active menu.
			if (currentRequestId !== requestId) {
				return new Promise<PersonSuggestionItem[]>(() => {});
			}
			const matches: PersonSuggestionItem[] = people
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
				render: () =>
					createTipTapSuggestionMenu<PersonSuggestionItem>({
						menuClassName: "wikiLinkSuggestionMenu",
						lockEditorScroll: false,
						resetSelectionOnUpdate: true,
						renderItem: ({ item, isActive, select }) => {
							const button = document.createElement("button");
							button.type = "button";
							button.className = "wikiLinkSuggestionItem";
							button.classList.toggle("active", isActive);
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
								select(item);
							});
							return button;
						},
					}),
			}),
		];
	},
});
