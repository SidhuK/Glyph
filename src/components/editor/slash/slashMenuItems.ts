import type { HeadingIcon } from "@hugeicons/core-free-icons";
import type { Editor } from "@tiptap/core";
import { i18n } from "../../../i18n";
import type { MathEditRequest } from "../extensions/math/mathOptions";
import { queryMatchesText } from "../suggestions/suggestionEngine";

export type SlashIcon = typeof HeadingIcon;

export interface TemplateInsertRequest {
	cancel: () => void;
	insert: (markdown: string) => boolean;
}

/** CSS color values that tint an item's icon tile. */
export interface SlashTone {
	color?: string;
	background?: string;
}

export interface SlashCommandDef {
	id: string;
	/** A Hugeicon, or a short text glyph for swatch-style items. */
	icon: SlashIcon | string;
	tone?: SlashTone;
	keywords: string[];
	command: (ctx: {
		editor: Editor;
		onMathEditRequest?: (request: MathEditRequest) => void;
		onTemplateInsertRequest?: (request: TemplateInsertRequest) => void;
		range: { from: number; to: number };
	}) => void;
}

export interface SlashCommandGroupDef {
	groupId: string;
	icon: SlashIcon;
	children: SlashCommandDef[];
}

export interface SlashCommandItem extends SlashCommandDef {
	title: string;
	/** Set on flat search results so the row can show where the command lives. */
	groupTitle?: string;
}

export interface SlashCommandGroupItem {
	icon: SlashIcon;
	tone?: undefined;
	title: string;
	children: SlashCommandItem[];
}

export type SlashMenuItem = SlashCommandItem | SlashCommandGroupItem;

function localizeSlashCommandItem(item: SlashCommandDef, groupTitle?: string): SlashCommandItem {
	return {
		...item,
		title: i18n.t(`editor:slash.${item.id}.title`),
		keywords: groupTitle ? [...item.keywords, groupTitle] : item.keywords,
	};
}

export function localizeSlashMenuEntry(
	entry: SlashCommandDef | SlashCommandGroupDef,
): SlashMenuItem {
	if (!("groupId" in entry)) return localizeSlashCommandItem(entry);
	const title = i18n.t(`editor:slash.groups.${entry.groupId}`);
	return {
		icon: entry.icon,
		title,
		children: entry.children.map((child) => localizeSlashCommandItem(child, title)),
	};
}

/** Empty query browses the grouped menu; typing searches every command flat. */
export function slashMenuItems(entries: SlashMenuItem[], query: string): SlashMenuItem[] {
	if (!query.trim()) return entries;
	return entries
		.flatMap((entry) =>
			"children" in entry
				? entry.children.map((child) => ({ ...child, groupTitle: entry.title }))
				: [entry],
		)
		.filter((item) => queryMatchesText(query, [item.title, ...item.keywords].join(" ")));
}
