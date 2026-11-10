import {
	Calendar03Icon,
	CalendarAdd01Icon,
	CheckmarkBadge01Icon,
	Clock01Icon,
	Flag02Icon,
	Heading01Icon,
	Link01Icon,
	MediumSignalIcon,
	QuoteDownIcon,
	Tag01Icon,
	TextIcon,
} from "@hugeicons/core-free-icons";
import type { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";

export const PROPERTY_KINDS = [
	"text",
	"url",
	"date",
	"checkbox",
	"tags",
	"status",
	"priority",
] as const;

export type PropertyKind = (typeof PROPERTY_KINDS)[number];

type PropertyIcon = ComponentProps<typeof HugeiconsIcon>["icon"];

// Status uses a flag, not a ring: rings mean task progress everywhere else.
export const PROPERTY_KIND_ICONS: Record<PropertyKind, PropertyIcon> = {
	text: TextIcon,
	url: Link01Icon,
	date: Calendar03Icon,
	checkbox: CheckmarkBadge01Icon,
	tags: Tag01Icon,
	status: Flag02Icon,
	priority: MediumSignalIcon,
};

/** Well-known keys get their own glyph, so Title and Aliases don't share the text "T". The
 * created/modified glyphs match the Info panel's file rows. */
const PROPERTY_NAME_ICONS: Partial<Record<string, PropertyIcon>> = {
	title: Heading01Icon,
	aliases: QuoteDownIcon,
	alias: QuoteDownIcon,
	created: CalendarAdd01Icon,
	modified: Clock01Icon,
	updated: Clock01Icon,
	status: Flag02Icon,
};

export function propertyIcon(key: string, kind: PropertyKind): PropertyIcon {
	const normalizedKey = key.trim().toLowerCase();
	return (
		(Object.prototype.hasOwnProperty.call(PROPERTY_NAME_ICONS, normalizedKey)
			? PROPERTY_NAME_ICONS[normalizedKey]
			: undefined) ?? PROPERTY_KIND_ICONS[kind]
	);
}

export function isPropertyKind(kind: string): kind is PropertyKind {
	return PROPERTY_KINDS.includes(kind as PropertyKind);
}
