import * as Icons from "@hugeicons/core-free-icons";

export const PROPERTY_KINDS = [
	"text",
	"url",
	"number",
	"date",
	"checkbox",
	"list",
	"tags",
	"yaml",
] as const;

export type PropertyKind = (typeof PROPERTY_KINDS)[number];

export const PROPERTY_KIND_ICONS: Record<
	PropertyKind,
	(typeof Icons)[keyof typeof Icons]
> = {
	text: Icons.InputTextIcon,
	url: Icons.AnalysisTextLinkIcon,
	number: Icons.HashtagIcon,
	date: Icons.Calendar03Icon,
	checkbox: Icons.CheckmarkCircle02Icon,
	list: Icons.LeftToRightListBulletIcon,
	tags: Icons.Tag01Icon,
	yaml: Icons.SourceCodeIcon,
};

export const PROPERTY_KIND_LABELS: Record<PropertyKind, string> = {
	text: "Text",
	url: "URL",
	number: "Number",
	date: "Date",
	checkbox: "Checkbox",
	list: "List",
	tags: "Tags",
	yaml: "YAML",
};

export function isPropertyKind(kind: string): kind is PropertyKind {
	return PROPERTY_KINDS.includes(kind as PropertyKind);
}
