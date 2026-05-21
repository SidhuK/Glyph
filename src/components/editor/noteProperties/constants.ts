import {
	Calendar03Icon,
	CheckmarkBadge01Icon,
	Link01Icon,
	MediumSignalIcon,
	StatusIcon,
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

export const PROPERTY_KIND_ICONS: Record<
	PropertyKind,
	ComponentProps<typeof HugeiconsIcon>["icon"]
> = {
	text: TextIcon,
	url: Link01Icon,
	date: Calendar03Icon,
	checkbox: CheckmarkBadge01Icon,
	tags: Tag01Icon,
	status: StatusIcon,
	priority: MediumSignalIcon,
};

export const PROPERTY_KIND_LABELS: Record<PropertyKind, string> = {
	text: "Text",
	url: "URL",
	date: "Date",
	checkbox: "Checkbox",
	tags: "Tags",
	status: "Status",
	priority: "Priority",
};

export function isPropertyKind(kind: string): kind is PropertyKind {
	return PROPERTY_KINDS.includes(kind as PropertyKind);
}
