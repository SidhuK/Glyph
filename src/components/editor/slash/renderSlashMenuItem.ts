import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { hugeiconMarkup } from "../hugeiconMarkup";
import type { SlashIcon, SlashMenuItem, SlashTone } from "./slashMenuItems";

const iconMarkupCache = new Map<SlashIcon, string>();

// Icons are static app-owned SVGs, so render each once and reuse the markup across menu updates.
function iconMarkup(icon: SlashIcon): string {
	const cached = iconMarkupCache.get(icon);
	if (cached) return cached;
	const markup = hugeiconMarkup(icon, "1em");
	iconMarkupCache.set(icon, markup);
	return markup;
}

function span(className: string, text?: string): HTMLSpanElement {
	const element = document.createElement("span");
	element.className = className;
	if (text !== undefined) element.textContent = text;
	return element;
}

function iconTile(icon: SlashIcon | string, tone?: SlashTone): HTMLSpanElement {
	const tile = span("slashCommandIcon");
	if (typeof icon === "string") {
		tile.textContent = icon;
		tile.dataset.glyph = "";
	} else {
		tile.innerHTML = iconMarkup(icon);
	}
	if (tone?.color) tile.style.setProperty("--slash-tone", tone.color);
	if (tone?.background) tile.style.setProperty("--slash-tone-bg", tone.background);
	return tile;
}

/** The title, with the first run of the typed text in bold. */
function titleSpan(title: string, match: string | undefined): HTMLSpanElement {
	const element = span("slashCommandTitle");
	const needle = match?.trim().toLowerCase() ?? "";
	const start = needle ? title.toLowerCase().indexOf(needle) : -1;
	if (start < 0) {
		element.textContent = title;
		return element;
	}
	const end = start + needle.length;
	const strong = document.createElement("strong");
	strong.textContent = title.slice(start, end);
	element.append(title.slice(0, start), strong, title.slice(end));
	return element;
}

export interface MenuRowContent {
	icon?: SlashIcon | string;
	tone?: SlashTone;
	title: string;
	/** Typed text to embolden in the title. */
	match?: string;
	/** Trailing hint in tertiary ink: a folder, a count or a Markdown shortcut. */
	hint?: string;
	/** Sets the hint in the monospace face, for Markdown the user can type instead. */
	hintIsShortcut?: boolean;
	hasSubmenu?: boolean;
}

/** One row of the insert menus (slash, wiki-link, tag, mention): icon, title, trailing hint. */
export function renderMenuRow(
	content: MenuRowContent,
	{ isActive, onSelect }: { isActive: boolean; onSelect: () => void },
): HTMLButtonElement {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "slashCommandItem";
	button.classList.toggle("active", isActive);
	if (content.icon !== undefined) button.append(iconTile(content.icon, content.tone));
	button.append(titleSpan(content.title, content.match));

	if (content.hasSubmenu) {
		const chevron = span("slashCommandChevron");
		chevron.innerHTML = iconMarkup(ArrowRight01Icon);
		button.append(chevron);
	} else if (content.hint) {
		const hint = span("slashCommandMeta", content.hint);
		if (content.hintIsShortcut) hint.dataset.shortcut = "";
		button.append(hint);
	}

	button.addEventListener("mousedown", (event) => {
		event.preventDefault();
		onSelect();
	});
	return button;
}

export function renderSlashMenuItem({
	item,
	isActive,
	select,
}: {
	item: SlashMenuItem;
	isActive: boolean;
	select: (item: SlashMenuItem) => void;
}): HTMLElement {
	const isGroup = "children" in item;
	// A Markdown shortcut says more than repeating the group name, like a macOS key equivalent.
	const shortcut = isGroup ? undefined : item.shortcut;
	return renderMenuRow(
		{
			icon: item.icon,
			tone: item.tone,
			title: item.title,
			hint: shortcut ?? (isGroup ? undefined : item.groupTitle),
			hintIsShortcut: shortcut !== undefined,
			hasSubmenu: isGroup,
		},
		{ isActive, onSelect: () => select(item) },
	);
}
