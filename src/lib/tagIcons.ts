import {
	DATABASE_COLUMN_ICON_OPTIONS,
	type DatabaseColumnIconOption,
	getDatabaseColumnIconOption,
} from "./database/columnIcons";
import type { TagAppearance } from "./tauri";

export type TagIconOption = DatabaseColumnIconOption;
export type TagIconName = (typeof DATABASE_COLUMN_ICON_OPTIONS)[number]["id"];
export type TagIconOverrides = Readonly<
	Record<string, string | null | undefined>
>;

export const DEFAULT_TAG_ICON_NAME = "tag" satisfies TagIconName;
export const TAG_ICON_OPTIONS = DATABASE_COLUMN_ICON_OPTIONS;

export const PREDEFINED_TAG_ICON_ALIASES = {
	ai: "ai",
	archive: "archive",
	archived: "archive",
	art: "brush",
	article: "document",
	articles: "document",
	"artificial-intelligence": "ai",
	audio: "music",
	automation: "workflow",
	blog: "globe",
	book: "book",
	bookmark: "bookmark",
	bookmarks: "bookmark",
	books: "book",
	business: "briefcase",
	calendar: "calendar",
	camera: "camera",
	chart: "chart",
	code: "code",
	coding: "code",
	contact: "user",
	contacts: "user",
	daily: "calendar",
	database: "database",
	dev: "terminal",
	development: "terminal",
	done: "check-circle",
	draft: "document",
	email: "mail",
	event: "calendar",
	events: "calendar",
	favorite: "star",
	favorites: "star",
	finance: "chart",
	flag: "flag",
	folder: "folder",
	goal: "target",
	goals: "target",
	home: "home",
	idea: "idea",
	ideas: "idea",
	image: "image",
	images: "image",
	inbox: "mail",
	journal: "note",
	link: "link",
	links: "link",
	location: "location",
	map: "location",
	media: "video",
	meeting: "message",
	meetings: "message",
	music: "music",
	note: "note",
	notes: "note",
	photo: "camera",
	photos: "camera",
	priority: "priority",
	project: "folder",
	projects: "folder",
	protected: "shield",
	read: "book-open",
	reading: "book-open",
	reference: "bookmark",
	references: "bookmark",
	reminder: "reminder",
	reminders: "reminder",
	research: "idea",
	security: "shield",
	settings: "settings",
	source: "source",
	sparkle: "sparkles",
	sparkles: "sparkles",
	star: "star",
	status: "status",
	study: "book-open",
	task: "task",
	tasks: "task",
	todo: "task",
	travel: "route",
	video: "video",
	videos: "video",
	web: "globe",
	work: "briefcase",
	workflow: "workflow",
} as const satisfies Readonly<Record<string, TagIconName>>;

const PREDEFINED_TAG_ICON_ALIAS_LOOKUP: Readonly<Record<string, TagIconName>> =
	PREDEFINED_TAG_ICON_ALIASES;

export function normalizeTagIconKey(tag: string): string | null {
	const normalized = tag
		.trim()
		.replace(/^#+/, "")
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9_/-]/g, "");

	if (
		!normalized ||
		normalized.startsWith("/") ||
		normalized.endsWith("/") ||
		normalized.includes("//")
	) {
		return null;
	}

	return normalized.split("/").every(Boolean) ? normalized : null;
}

export function getTagIconOption(
	iconName: string | null | undefined,
): TagIconOption | null {
	return getDatabaseColumnIconOption(iconName);
}

export function isTagIconName(
	iconName: string | null | undefined,
): iconName is TagIconName {
	return Boolean(getTagIconOption(iconName));
}

export function resolveTagIconName(
	tag: string,
	overrides: TagIconOverrides | null | undefined,
	beautifulTagsEnabled: boolean,
): string {
	const normalizedTag = normalizeTagIconKey(tag);
	const overrideIconName = resolveOverrideIconName(
		tag,
		normalizedTag,
		overrides,
	);
	if (overrideIconName) return overrideIconName;

	if (beautifulTagsEnabled && normalizedTag) {
		const aliasIconName = resolveAliasIconName(normalizedTag);
		if (aliasIconName) return aliasIconName;
	}

	return DEFAULT_TAG_ICON_NAME;
}

export function tagIconOverridesFromAppearance(
	appearance: Readonly<Record<string, TagAppearance>>,
): TagIconOverrides {
	return Object.fromEntries(
		Object.entries(appearance).map(([tag, item]) => [tag, item.icon ?? null]),
	);
}

function resolveOverrideIconName(
	tag: string,
	normalizedTag: string | null,
	overrides: TagIconOverrides | null | undefined,
): string | null {
	if (!overrides) return null;

	for (const key of overrideKeys(tag, normalizedTag)) {
		if (!Object.prototype.hasOwnProperty.call(overrides, key)) continue;

		const iconName = overrides[key];
		if (typeof iconName !== "string") return DEFAULT_TAG_ICON_NAME;

		const trimmedIconName = iconName.trim();
		return trimmedIconName || DEFAULT_TAG_ICON_NAME;
	}

	return null;
}

function overrideKeys(tag: string, normalizedTag: string | null): string[] {
	const keys = [tag, tag.trim()];
	if (normalizedTag) {
		keys.push(normalizedTag, `#${normalizedTag}`);
	}
	return Array.from(new Set(keys.filter(Boolean)));
}

function resolveAliasIconName(normalizedTag: string): TagIconName | null {
	const exactIconName = PREDEFINED_TAG_ICON_ALIAS_LOOKUP[normalizedTag];
	if (exactIconName) return exactIconName;

	const segments = normalizedTag.split("/");
	const rootIconName = PREDEFINED_TAG_ICON_ALIAS_LOOKUP[segments[0] ?? ""];
	if (rootIconName) return rootIconName;

	const leafIconName =
		PREDEFINED_TAG_ICON_ALIAS_LOOKUP[segments[segments.length - 1] ?? ""];
	return leafIconName ?? null;
}
