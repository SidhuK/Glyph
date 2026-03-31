import {
	Calendar03Icon,
	CheckmarkBadge01Icon,
	CodeIcon,
	Link01Icon,
	Tag01Icon,
	TextIcon,
} from "@hugeicons/core-free-icons";
import type { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";

export const PROPERTY_KINDS = [
	"text",
	"url",
	"number",
	"date",
	"datetime",
	"checkbox",
	"list",
	"tags",
	"yaml",
] as const;

export type PropertyKind = (typeof PROPERTY_KINDS)[number];

export const PROPERTY_KIND_ICONS: Record<
	PropertyKind,
	ComponentProps<typeof HugeiconsIcon>["icon"]
> = {
	text: TextIcon,
	url: Link01Icon,
	number: TextIcon,
	date: Calendar03Icon,
	datetime: Calendar03Icon,
	checkbox: CheckmarkBadge01Icon,
	list: TextIcon,
	tags: Tag01Icon,
	yaml: CodeIcon,
};

export const PROPERTY_KIND_LABELS: Record<PropertyKind, string> = {
	text: "Text",
	url: "URL",
	number: "Number",
	date: "Date",
	datetime: "Date/time",
	checkbox: "Checkbox",
	list: "List",
	tags: "Tags",
	yaml: "YAML",
};

export function isPropertyKind(kind: string): kind is PropertyKind {
	return PROPERTY_KINDS.includes(kind as PropertyKind);
}
