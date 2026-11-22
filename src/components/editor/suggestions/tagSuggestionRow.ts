import { i18n } from "../../../i18n";
import { KEY_GLYPHS } from "../../../lib/shortcuts/platform";
import { normalizeTagDraftPrefix, splitTagPath, tagColorFromName } from "../noteProperties/utils";

export interface TagSuggestionItem {
	tag: string;
	count: number;
	isNew: boolean;
}

function span(className: string, text?: string): HTMLSpanElement {
	const element = document.createElement("span");
	element.className = className;
	if (text !== undefined) element.textContent = text;
	return element;
}

function strong(text: string): HTMLElement {
	const element = document.createElement("strong");
	element.textContent = text;
	return element;
}

function keycap(key: string): HTMLElement {
	const element = document.createElement("kbd");
	element.className = "commandPaletteKeycap";
	element.textContent = key;
	return element;
}

function nameSpan(tag: string, query: string): HTMLSpanElement {
	const parentEnd = splitTagPath(tag).parent.length;
	const matchStart = query ? tag.indexOf(query) : -1;
	const matchEnd = matchStart < 0 ? -1 : matchStart + query.length;
	const cuts = [...new Set([0, parentEnd, matchStart, matchEnd, tag.length])]
		.filter((cut) => cut >= 0 && cut <= tag.length)
		.sort((left, right) => left - right);
	const name = span("tagSuggestionName");
	const parent = span("tagSuggestionParent");
	if (parentEnd > 0) name.append(parent);
	for (const [index, from] of cuts.slice(0, -1).entries()) {
		const to = cuts[index + 1] ?? tag.length;
		const text = tag.slice(from, to);
		const isMatch = matchStart >= 0 && from >= matchStart && to <= matchEnd;
		(to <= parentEnd ? parent : name).append(isMatch ? strong(text) : text);
	}
	return name;
}

function existingTagContent(item: TagSuggestionItem, query: string): Node[] {
	return [
		span("tagSuggestionDot"),
		nameSpan(item.tag, normalizeTagDraftPrefix(query)),
		span("tagSuggestionCount", String(item.count)),
	];
}

function newTagContent(item: TagSuggestionItem): Node[] {
	return [
		span("tagSuggestionPlus", "+"),
		span("tagSuggestionCreateLabel", i18n.t("editor:tagSuggest.create")),
		span("tagSuggestionPreview", item.tag),
		span("tagSuggestionCount", i18n.t("editor:tagSuggest.new")),
	];
}

export function renderTagSuggestionRow(
	item: TagSuggestionItem,
	query: string,
	{ isActive, onSelect }: { isActive: boolean; onSelect: () => void },
): HTMLButtonElement {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "slashCommandItem tagSuggestionItem";
	button.classList.toggle("active", isActive);
	button.dataset.chipTone = tagColorFromName(item.tag);
	if (item.isNew) button.dataset.new = "";
	button.append(
		...(item.isNew ? newTagContent(item) : existingTagContent(item, query)),
		keycap(KEY_GLYPHS.Enter),
	);
	button.addEventListener("mousedown", (event) => {
		event.preventDefault();
		onSelect();
	});
	return button;
}

function keyHint(keys: string[], label?: string): HTMLSpanElement {
	const hint = span("tagSuggestionHint");
	hint.append(...keys.map(keycap));
	if (label) hint.append(label);
	return hint;
}

export function tagSuggestionFooter(): HTMLElement {
	const footer = span("tagSuggestionFooter");
	footer.append(
		keyHint([KEY_GLYPHS.ArrowUp, KEY_GLYPHS.ArrowDown], i18n.t("editor:tagSuggest.select")),
		keyHint([KEY_GLYPHS.Enter], i18n.t("editor:tagSuggest.insert")),
		keyHint([KEY_GLYPHS.Escape]),
	);
	return footer;
}
