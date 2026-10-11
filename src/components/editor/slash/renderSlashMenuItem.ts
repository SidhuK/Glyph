import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SlashIcon, SlashMenuItem } from "./slashMenuItems";

const iconMarkupCache = new Map<SlashIcon, string>();

// Icons are static app-owned SVGs, so render each once and reuse the markup across menu updates.
function iconMarkup(icon: SlashIcon): string {
	const cached = iconMarkupCache.get(icon);
	if (cached) return cached;
	const markup = renderToStaticMarkup(createElement(HugeiconsIcon, { icon, size: "1em" }));
	iconMarkupCache.set(icon, markup);
	return markup;
}

function span(className: string, text?: string): HTMLSpanElement {
	const element = document.createElement("span");
	element.className = className;
	if (text !== undefined) element.textContent = text;
	return element;
}

function iconTile(item: SlashMenuItem): HTMLSpanElement {
	const tile = span("slashCommandIcon");
	if (typeof item.icon === "string") {
		tile.textContent = item.icon;
		tile.dataset.glyph = "";
	} else {
		tile.innerHTML = iconMarkup(item.icon);
	}
	if (item.tone?.color) tile.style.setProperty("--slash-tone", item.tone.color);
	if (item.tone?.background) tile.style.setProperty("--slash-tone-bg", item.tone.background);
	return tile;
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
	const button = document.createElement("button");
	button.type = "button";
	button.className = "slashCommandItem";
	button.classList.toggle("active", isActive);

	button.append(iconTile(item), span("slashCommandTitle", item.title));

	if ("children" in item) {
		const chevron = span("slashCommandChevron");
		chevron.innerHTML = iconMarkup(ArrowRight01Icon);
		button.append(chevron);
	} else if (item.groupTitle) {
		button.append(span("slashCommandMeta", item.groupTitle));
	}

	button.addEventListener("mousedown", (event) => {
		event.preventDefault();
		select(item);
	});
	return button;
}
