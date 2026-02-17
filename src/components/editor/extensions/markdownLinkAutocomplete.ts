import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { parentDir } from "../../../utils/path";
import type { FsEntry } from "../../../lib/tauri";
import { invoke } from "../../../lib/tauri";

const MD_LINK_SUGGESTION_KEY = new PluginKey("markdown-link-suggestion");

interface LinkSuggestionItem {
	path: string;
	title: string;
	insertText: string;
}

function normalize(input: string): string {
	return input.toLowerCase().trim().replace(/\\/g, "/");
}

function basename(path: string): string {
	const parts = path.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

function relativePath(fromDir: string, toPath: string): string {
	const from = fromDir.split("/").filter(Boolean);
	const to = toPath.split("/").filter(Boolean);
	let i = 0;
	while (i < from.length && i < to.length && from[i] === to[i]) i += 1;
	const up = from.slice(i).map(() => "..");
	const down = to.slice(i);
	return [...up, ...down].join("/") || ".";
}

function makeItem(entry: FsEntry, currentPath: string): LinkSuggestionItem {
	const relDir = parentDir(currentPath);
	const rel = relDir ? relativePath(relDir, entry.rel_path) : entry.rel_path;
	return {
		path: entry.rel_path,
		title: basename(entry.rel_path),
		insertText: rel,
	};
}

function filterItems(
	items: LinkSuggestionItem[],
	query: string,
	limit: number,
): LinkSuggestionItem[] {
	const q = normalize(query);
	if (!q) return items.slice(0, limit);
	const scored = items
		.map((item) => {
			const title = normalize(item.title);
			const path = normalize(item.path);
			const rel = normalize(item.insertText);
			const titleStarts = title.startsWith(q) ? 20 : 0;
			const relStarts = rel.startsWith(q) ? 16 : 0;
			const pathStarts = path.startsWith(q) ? 12 : 0;
			const contains =
				(title.includes(q) ? 6 : 0) +
				(rel.includes(q) ? 4 : 0) +
				(path.includes(q) ? 2 : 0);
			return { item, score: titleStarts + relStarts + pathStarts + contains };
		})
		.filter((row) => row.score > 0)
		.sort((a, b) => b.score - a.score);
	return scored.slice(0, limit).map((row) => row.item);
}

export const MarkdownLinkAutocomplete = Extension.create({
	name: "markdown-link-autocomplete",
	addOptions() {
		return {
			suggestionLimit: 10,
			currentPath: "",
		};
	},
	addProseMirrorPlugins() {
		let cachedEntries: FsEntry[] = [];
		let lastLoadedAt = 0;

		const getItems = async (query: string): Promise<LinkSuggestionItem[]> => {
			const now = Date.now();
			if (!cachedEntries.length || now - lastLoadedAt > 30_000) {
				cachedEntries = await invoke("vault_list_files", {
					recursive: true,
					limit: 10_000,
				});
				lastLoadedAt = now;
			}
			const all = cachedEntries
				.filter((entry) => entry.kind === "file")
				.map((entry) => makeItem(entry, this.options.currentPath || ""));
			return filterItems(all, query, this.options.suggestionLimit);
		};

		return [
			Suggestion<LinkSuggestionItem>({
				editor: this.editor,
				pluginKey: MD_LINK_SUGGESTION_KEY,
				char: "](",
				allowedPrefixes: null,
				startOfLine: false,
				items: ({ query }) => getItems(query),
				command: ({ editor, range, props }) => {
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
					let activeProps: SuggestionProps<LinkSuggestionItem> | null = null;

					const updateMenu = (props: SuggestionProps<LinkSuggestionItem>) => {
						if (!menu) return;
						menu.innerHTML = "";
						for (const [index, item] of props.items.entries()) {
							const button = document.createElement("button");
							button.type = "button";
							button.className = "wikiLinkSuggestionItem";
							button.innerHTML = `<span class="wikiLinkSuggestionTitle">${item.title}</span><span class="wikiLinkSuggestionPath">${item.insertText}</span>`;
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
						onStart: (props: SuggestionProps<LinkSuggestionItem>) => {
							activeProps = props;
							selectedIndex = 0;
							menu = document.createElement("div");
							menu.className = "wikiLinkSuggestionMenu";
							document.body.append(menu);
							updateMenu(props);
						},
						onUpdate: (props: SuggestionProps<LinkSuggestionItem>) => {
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
									(selectedIndex - 1 + current.items.length) % current.items.length;
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
