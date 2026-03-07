import {
	AnalysisTextLinkIcon,
	Calendar03Icon,
	CheckmarkCircle02Icon,
	HashtagIcon,
	InputTextIcon,
	LeftToRightListBulletIcon,
	SourceCodeIcon,
	Tag01Icon,
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
	text: InputTextIcon,
	url: AnalysisTextLinkIcon,
	number: HashtagIcon,
	date: Calendar03Icon,
	datetime: Calendar03Icon,
	checkbox: CheckmarkCircle02Icon,
	list: LeftToRightListBulletIcon,
	tags: Tag01Icon,
	yaml: SourceCodeIcon,
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
