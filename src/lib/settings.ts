import { emit } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import { normalizeRelPath } from "../utils/path";
import type { AiAssistantMode } from "./tauri";
import {
	type UiDarkThemeId,
	type UiLightThemeId,
	asUiDarkThemeId,
	asUiLightThemeId,
} from "./uiThemes";

export type { AiAssistantMode } from "./tauri";
export type { UiDarkThemeId, UiLightThemeId } from "./uiThemes";

let storeInstance: LazyStore | null = null;
let storeInitPromise: Promise<void> | null = null;

async function getStore(): Promise<LazyStore> {
	if (!storeInstance) {
		storeInstance = new LazyStore("settings.json");
		storeInitPromise = storeInstance.init();
	}
	if (storeInitPromise) {
		await storeInitPromise;
	}
	return storeInstance;
}

export type ThemeMode = "system" | "light" | "dark";
const THEME_MODES = new Set<ThemeMode>(["system", "light", "dark"]);
export type AutoUpdateCheckInterval = "3h";
const AUTO_UPDATE_CHECK_INTERVALS = new Set<AutoUpdateCheckInterval>(["3h"]);
export type UiAccent =
	| "neutral"
	| "cerulean"
	| "tropical-teal"
	| "light-yellow"
	| "soft-apricot"
	| "vibrant-coral";
const UI_ACCENTS = new Set<UiAccent>([
	"neutral",
	"cerulean",
	"tropical-teal",
	"light-yellow",
	"soft-apricot",
	"vibrant-coral",
]);
const DEFAULT_UI_ACCENT: UiAccent = "neutral";
const DEFAULT_UI_FONT_FAMILY = "Satoshi";
const DEFAULT_UI_MONO_FONT_FAMILY = "JetBrains Mono";
export const DEFAULT_AUTO_UPDATE_CHECK_INTERVAL: AutoUpdateCheckInterval =
	"3h";
export const MIN_UI_FONT_SIZE = 7;
export const MAX_UI_FONT_SIZE = 40;
export const DEFAULT_UI_FONT_SIZE = 14;
export const MIN_EDITOR_FONT_SIZE = 10;
export const MAX_EDITOR_FONT_SIZE = 40;
export const DEFAULT_EDITOR_FONT_SIZE = 16;
const DEFAULT_AI_ENABLED = true;
export type UiFontFamily = string;
export type UiFontSize = number;
const AI_ASSISTANT_MODES = new Set<AiAssistantMode>(["chat", "create"]);
export type TaskSourceMode = "space" | "folders";
export interface OnboardingSettings {
	launcherSeen: boolean;
	starterDismissed: boolean;
	createdFirstNote: boolean;
	usedCommandPalette: boolean;
	openedDailyNote: boolean;
}

export const DEFAULT_ONBOARDING_SETTINGS: OnboardingSettings = {
	launcherSeen: false,
	starterDismissed: false,
	createdFirstNote: false,
	usedCommandPalette: false,
	openedDailyNote: false,
};

export interface TaskSourceSetting {
	mode: TaskSourceMode;
	folders: string[];
}

export interface DatabaseSettings {
	showColumnColor: boolean;
	showNoteCount: boolean;
}

export interface EditorSettings {
	showCollapsibleHeadings: boolean;
	pastedMediaFolder: string;
	enablePeopleMentionsAsTags: boolean;
}

export interface FileTreeSettings {
	showFolderFileCounts: boolean;
}

export const DEFAULT_DATABASE_SETTINGS: DatabaseSettings = {
	showColumnColor: true,
	showNoteCount: false,
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
	showCollapsibleHeadings: false,
	pastedMediaFolder: "assets",
	enablePeopleMentionsAsTags: false,
};

export const DEFAULT_FILE_TREE_SETTINGS: FileTreeSettings = {
	showFolderFileCounts: false,
};

function asThemeMode(value: unknown): ThemeMode {
	return typeof value === "string" && THEME_MODES.has(value as ThemeMode)
		? (value as ThemeMode)
		: "system";
}

function asAutoUpdateCheckInterval(value: unknown): AutoUpdateCheckInterval {
	if (value === "launch" || value === "12h") {
		return "3h";
	}
	return typeof value === "string" &&
		AUTO_UPDATE_CHECK_INTERVALS.has(value as AutoUpdateCheckInterval)
		? (value as AutoUpdateCheckInterval)
		: DEFAULT_AUTO_UPDATE_CHECK_INTERVAL;
}

function asAiAssistantMode(value: unknown): AiAssistantMode {
	return typeof value === "string" &&
		AI_ASSISTANT_MODES.has(value as AiAssistantMode)
		? (value as AiAssistantMode)
		: "create";
}

function asUiAccent(value: unknown): UiAccent {
	return typeof value === "string" && UI_ACCENTS.has(value as UiAccent)
		? (value as UiAccent)
		: DEFAULT_UI_ACCENT;
}

function asUiFontFamily(value: unknown): UiFontFamily {
	if (typeof value !== "string") return DEFAULT_UI_FONT_FAMILY;
	const trimmed = value.trim();
	if (!trimmed) return DEFAULT_UI_FONT_FAMILY;
	return trimmed.slice(0, 80);
}

function asUiMonoFontFamily(value: unknown): UiFontFamily {
	if (typeof value !== "string") return DEFAULT_UI_MONO_FONT_FAMILY;
	const trimmed = value.trim();
	if (!trimmed) return DEFAULT_UI_MONO_FONT_FAMILY;
	return trimmed.slice(0, 80);
}

function asUiFontSize(value: unknown): UiFontSize {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.max(
			MIN_UI_FONT_SIZE,
			Math.min(MAX_UI_FONT_SIZE, Math.round(value)),
		);
	}
	if (value === "small") return 12;
	if (value === "medium") return DEFAULT_UI_FONT_SIZE;
	if (value === "large") return 16;
	return DEFAULT_UI_FONT_SIZE;
}

function asUiEditorFontSize(value: unknown): UiFontSize {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.max(
			MIN_EDITOR_FONT_SIZE,
			Math.min(MAX_EDITOR_FONT_SIZE, Math.round(value)),
		);
	}
	return DEFAULT_EDITOR_FONT_SIZE;
}

async function emitSettingsUpdated(payload: {
	ui?: {
		theme?: ThemeMode;
		autoUpdateCheckInterval?: AutoUpdateCheckInterval;
		lightThemeId?: UiLightThemeId;
		darkThemeId?: UiDarkThemeId;
		accent?: UiAccent;
		fontFamily?: UiFontFamily;
		monoFontFamily?: UiFontFamily;
		fontSize?: UiFontSize;
		editorFontSize?: UiFontSize;
		translucentApp?: boolean;
		delightfulGlyph?: boolean;
		showToc?: boolean;
		showFileTreeFolderCounts?: boolean;
		aiAssistantMode?: AiAssistantMode;
		aiEnabled?: boolean;
		aiSidebarWidth?: number | null;
	};
	dailyNotes?: {
		folder?: string | null;
	};
	webClippings?: {
		folder?: string | null;
	};
	templates?: {
		folder?: string | null;
		dailyNoteTemplate?: string | null;
	};
	tasks?: {
		source?: TaskSourceSetting;
	};
	database?: {
		showColumnColor?: boolean;
		showNoteCount?: boolean;
	};
	editor?: {
		showCollapsibleHeadings?: boolean;
		pastedMediaFolder?: string;
		enablePeopleMentionsAsTags?: boolean;
	};
	onboarding?: Partial<OnboardingSettings>;
}): Promise<void> {
	try {
		await emit("settings:updated", payload);
	} catch {
		// best-effort cross-window sync
	}
}

export interface RecentFile {
	path: string;
	spacePath: string;
	openedAt: number;
}

interface AppSettings {
	currentSpacePath: string | null;
	recentSpaces: string[];
	recentFiles: RecentFile[];
	onboarding: OnboardingSettings;
	ui: {
		aiEnabled: boolean;
		aiSidebarWidth: number | null;
		theme: ThemeMode;
		autoUpdateCheckInterval: AutoUpdateCheckInterval;
		lightThemeId: UiLightThemeId;
		darkThemeId: UiDarkThemeId;
		accent: UiAccent;
		fontFamily: UiFontFamily;
		monoFontFamily: UiFontFamily;
		fontSize: UiFontSize;
		editorFontSize: UiFontSize;
		translucentApp: boolean;
		delightfulGlyph: boolean;
		showToc: boolean;
		showFileTreeFolderCounts: boolean;
		aiAssistantMode: AiAssistantMode;
	};
	dailyNotes: {
		folder: string | null;
	};
	webClippings: {
		folder: string | null;
	};
	templates: {
		folder: string | null;
		dailyNoteTemplate: string | null;
	};
	tasks: {
		source: TaskSourceSetting;
	};
	editor: EditorSettings;
	database: DatabaseSettings;
}

const KEYS = {
	currentSpacePath: "space.currentPath",
	recentSpaces: "space.recent",
	recentFiles: "files.recent",
	aiEnabled: "ui.aiEnabled",
	aiSidebarWidth: "ui.aiSidebarWidth",
	aiAssistantMode: "ui.aiAssistantMode",
	theme: "ui.theme",
	autoUpdateCheckInterval: "ui.autoUpdateCheckInterval",
	lightThemeId: "ui.lightThemeId",
	darkThemeId: "ui.darkThemeId",
	accent: "ui.accent",
	fontFamily: "ui.fontFamily",
	monoFontFamily: "ui.monoFontFamily",
	fontSize: "ui.fontSize",
	editorFontSize: "ui.editorFontSize",
	translucentApp: "ui.translucentApp",
	delightfulGlyph: "ui.delightfulGlyph",
	showToc: "ui.showToc",
	showFileTreeFolderCounts: "ui.fileTree.showFolderFileCounts",
	editorShowCollapsibleHeadings: "editor.showCollapsibleHeadings",
	editorPastedMediaFolder: "editor.pastedMediaFolder",
	editorEnablePeopleMentionsAsTags: "editor.enablePeopleMentionsAsTags",
	autoUpdateLastCheckedAt: "updates.lastCheckedAt",
	dailyNotesFolder: "dailyNotes.folder",
	webClippingsFolder: "webClippings.folder",
	templatesFolder: "templates.folder",
	templatesDailyNoteTemplate: "templates.dailyNoteTemplate",
	taskSource: "tasks.source",
	databaseShowColumnColor: "database.showColumnColor",
	databaseShowNoteCount: "database.showNoteCount",
	onboardingLauncherSeen: "onboarding.launcherSeen",
	onboardingStarterDismissed: "onboarding.starterDismissed",
	onboardingCreatedFirstNote: "onboarding.createdFirstNote",
	onboardingUsedCommandPalette: "onboarding.usedCommandPalette",
	onboardingOpenedDailyNote: "onboarding.openedDailyNote",
} as const;

const ONBOARDING_KEYS = {
	launcherSeen: KEYS.onboardingLauncherSeen,
	starterDismissed: KEYS.onboardingStarterDismissed,
	createdFirstNote: KEYS.onboardingCreatedFirstNote,
	usedCommandPalette: KEYS.onboardingUsedCommandPalette,
	openedDailyNote: KEYS.onboardingOpenedDailyNote,
} as const satisfies Record<keyof OnboardingSettings, string>;

function normalizeTaskSourceSetting(value: unknown): TaskSourceSetting {
	const rawMode =
		typeof value === "object" && value !== null && "mode" in value
			? (value as { mode?: unknown }).mode
			: null;
	const mode: TaskSourceMode = rawMode === "folders" ? "folders" : "space";
	const rawFolders =
		typeof value === "object" && value !== null && "folders" in value
			? (value as { folders?: unknown }).folders
			: [];
	const folders = Array.isArray(rawFolders)
		? Array.from(
				new Set(
					rawFolders
						.filter((entry): entry is string => typeof entry === "string")
						.map((entry) => normalizeRelPath(entry))
						.filter(Boolean),
				),
			).slice(0, 50)
		: [];
	return {
		mode,
		folders,
	};
}

function normalizeLegacyTaskSourceSetting(
	value: unknown,
): TaskSourceSetting | null {
	if (typeof value !== "object" || value === null) return null;
	for (const bucket of ["inbox", "today", "upcoming"]) {
		const bucketValue = (value as Record<string, unknown>)[bucket];
		if (!bucketValue) continue;
		const normalized = normalizeTaskSourceSetting(bucketValue);
		if (normalized.mode === "folders" || normalized.folders.length > 0) {
			return normalized;
		}
	}
	return null;
}

export async function reloadFromDisk(): Promise<void> {
	const store = await getStore();
	await store.reload();
}

function isRecentFileArray(value: unknown): value is RecentFile[] {
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				typeof item === "object" &&
				item !== null &&
				"path" in item &&
				"spacePath" in item &&
				"openedAt" in item &&
				typeof (item as RecentFile).path === "string" &&
				typeof (item as RecentFile).spacePath === "string" &&
				typeof (item as RecentFile).openedAt === "number",
		)
	);
}

export async function loadSettings(): Promise<AppSettings> {
	const store = await getStore();
	const [
		currentSpacePathRaw,
		recentSpacesRaw,
		rawRecentFiles,
		rawOnboardingLauncherSeen,
		rawOnboardingStarterDismissed,
		rawOnboardingCreatedFirstNote,
		rawOnboardingUsedCommandPalette,
		rawOnboardingOpenedDailyNote,
		rawAiEnabled,
		aiSidebarWidthRaw,
		rawAiAssistantMode,
		rawTheme,
		rawAutoUpdateCheckInterval,
		rawLightThemeId,
		rawDarkThemeId,
		rawAccent,
		rawFontFamily,
		rawMonoFontFamily,
		rawFontSize,
		rawEditorFontSize,
		rawTranslucentApp,
		rawDelightfulGlyph,
		rawShowToc,
		rawShowFileTreeFolderCounts,
		dailyNotesFolderRaw,
		rawWebClippingsFolder,
		templatesFolderRaw,
		templatesDailyNoteTemplateRaw,
		taskSourceRaw,
		rawEditorShowCollapsibleHeadings,
		rawEditorPastedMediaFolder,
		rawEditorEnablePeopleMentionsAsTags,
		rawDatabaseShowColumnColor,
		rawDatabaseShowNoteCount,
	] = await Promise.all([
		store.get<string | null>(KEYS.currentSpacePath),
		store.get<string[] | null>(KEYS.recentSpaces),
		store.get<unknown>(KEYS.recentFiles),
		store.get<boolean | null>(KEYS.onboardingLauncherSeen),
		store.get<boolean | null>(KEYS.onboardingStarterDismissed),
		store.get<boolean | null>(KEYS.onboardingCreatedFirstNote),
		store.get<boolean | null>(KEYS.onboardingUsedCommandPalette),
		store.get<boolean | null>(KEYS.onboardingOpenedDailyNote),
		store.get<boolean | null>(KEYS.aiEnabled),
		store.get<number | null>(KEYS.aiSidebarWidth),
		store.get<unknown>(KEYS.aiAssistantMode),
		store.get<unknown>(KEYS.theme),
		store.get<unknown>(KEYS.autoUpdateCheckInterval),
		store.get<unknown>(KEYS.lightThemeId),
		store.get<unknown>(KEYS.darkThemeId),
		store.get<unknown>(KEYS.accent),
		store.get<unknown>(KEYS.fontFamily),
		store.get<unknown>(KEYS.monoFontFamily),
		store.get<unknown>(KEYS.fontSize),
		store.get<unknown>(KEYS.editorFontSize),
		store.get<boolean | null>(KEYS.translucentApp),
		store.get<boolean | null>(KEYS.delightfulGlyph),
		store.get<boolean | null>(KEYS.showToc),
		store.get<boolean | null>(KEYS.showFileTreeFolderCounts),
		store.get<string | null>(KEYS.dailyNotesFolder),
		store.get<string | null>(KEYS.webClippingsFolder),
		store.get<string | null>(KEYS.templatesFolder),
		store.get<string | null>(KEYS.templatesDailyNoteTemplate),
		store.get<unknown>(KEYS.taskSource),
		store.get<boolean | null>(KEYS.editorShowCollapsibleHeadings),
		store.get<string | null>(KEYS.editorPastedMediaFolder),
		store.get<boolean | null>(KEYS.editorEnablePeopleMentionsAsTags),
		store.get<boolean | null>(KEYS.databaseShowColumnColor),
		store.get<boolean | null>(KEYS.databaseShowNoteCount),
	]);
	const currentSpacePath = currentSpacePathRaw ?? null;
	const recentSpaces = recentSpacesRaw ?? [];
	const recentFiles = isRecentFileArray(rawRecentFiles) ? rawRecentFiles : [];
	const onboarding: OnboardingSettings = {
		launcherSeen: rawOnboardingLauncherSeen ?? false,
		starterDismissed: rawOnboardingStarterDismissed ?? false,
		createdFirstNote: rawOnboardingCreatedFirstNote ?? false,
		usedCommandPalette: rawOnboardingUsedCommandPalette ?? false,
		openedDailyNote: rawOnboardingOpenedDailyNote ?? false,
	};
	const aiEnabled =
		typeof rawAiEnabled === "boolean" ? rawAiEnabled : DEFAULT_AI_ENABLED;
	const aiSidebarWidth = aiSidebarWidthRaw ?? null;
	const aiAssistantMode = asAiAssistantMode(rawAiAssistantMode);
	const theme = asThemeMode(rawTheme);
	const autoUpdateCheckInterval = asAutoUpdateCheckInterval(
		rawAutoUpdateCheckInterval,
	);
	const lightThemeId = asUiLightThemeId(rawLightThemeId);
	const darkThemeId = asUiDarkThemeId(rawDarkThemeId);
	const accent = asUiAccent(rawAccent);
	const fontFamily = asUiFontFamily(rawFontFamily);
	const monoFontFamily = asUiMonoFontFamily(rawMonoFontFamily);
	const fontSize = asUiFontSize(rawFontSize);
	const editorFontSize =
		rawEditorFontSize === undefined || rawEditorFontSize === null
			? DEFAULT_EDITOR_FONT_SIZE
			: asUiEditorFontSize(rawEditorFontSize);
	const translucentApp =
		typeof rawTranslucentApp === "boolean" ? rawTranslucentApp : true;
	const delightfulGlyph =
		typeof rawDelightfulGlyph === "boolean" ? rawDelightfulGlyph : false;
	const showToc = typeof rawShowToc === "boolean" ? rawShowToc : true;
	const showFileTreeFolderCounts =
		typeof rawShowFileTreeFolderCounts === "boolean"
			? rawShowFileTreeFolderCounts
			: DEFAULT_FILE_TREE_SETTINGS.showFolderFileCounts;
	const dailyNotesFolder =
		typeof dailyNotesFolderRaw === "string"
			? normalizeRelPath(dailyNotesFolderRaw) || null
			: null;
	const webClippingsFolder =
		typeof rawWebClippingsFolder === "string"
			? normalizeRelPath(rawWebClippingsFolder) || null
			: null;
	const templatesFolder =
		typeof templatesFolderRaw === "string"
			? normalizeRelPath(templatesFolderRaw)
			: null;
	const templatesDailyNoteTemplate =
		typeof templatesDailyNoteTemplateRaw === "string"
			? normalizeRelPath(templatesDailyNoteTemplateRaw) || null
			: null;
	const taskSource =
		normalizeLegacyTaskSourceSetting(taskSourceRaw) ??
		normalizeTaskSourceSetting(taskSourceRaw);
	const editor: EditorSettings = {
		showCollapsibleHeadings:
			typeof rawEditorShowCollapsibleHeadings === "boolean"
				? rawEditorShowCollapsibleHeadings
				: DEFAULT_EDITOR_SETTINGS.showCollapsibleHeadings,
		pastedMediaFolder:
			typeof rawEditorPastedMediaFolder === "string"
				? normalizeRelPath(rawEditorPastedMediaFolder)
				: DEFAULT_EDITOR_SETTINGS.pastedMediaFolder,
		enablePeopleMentionsAsTags:
			typeof rawEditorEnablePeopleMentionsAsTags === "boolean"
				? rawEditorEnablePeopleMentionsAsTags
				: DEFAULT_EDITOR_SETTINGS.enablePeopleMentionsAsTags,
	};
	const database: DatabaseSettings = {
		showColumnColor:
			typeof rawDatabaseShowColumnColor === "boolean"
				? rawDatabaseShowColumnColor
				: DEFAULT_DATABASE_SETTINGS.showColumnColor,
		showNoteCount:
			typeof rawDatabaseShowNoteCount === "boolean"
				? rawDatabaseShowNoteCount
				: DEFAULT_DATABASE_SETTINGS.showNoteCount,
	};
	return {
		currentSpacePath,
		recentSpaces: Array.isArray(recentSpaces) ? recentSpaces : [],
		recentFiles,
		onboarding,
		ui: {
			aiEnabled,
			aiSidebarWidth:
				typeof aiSidebarWidth === "number" && Number.isFinite(aiSidebarWidth)
					? aiSidebarWidth
					: null,
			theme,
			autoUpdateCheckInterval,
			lightThemeId,
			darkThemeId,
			accent,
			fontFamily,
			monoFontFamily,
			fontSize,
			editorFontSize,
			translucentApp,
			delightfulGlyph,
			showToc,
			showFileTreeFolderCounts,
			aiAssistantMode,
		},
		dailyNotes: {
			folder: dailyNotesFolder,
		},
		webClippings: {
			folder: webClippingsFolder,
		},
		templates: {
			folder: templatesFolder,
			dailyNoteTemplate: templatesDailyNoteTemplate,
		},
		tasks: {
			source: taskSource,
		},
		editor,
		database,
	};
}

export async function setCurrentSpacePath(path: string): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.currentSpacePath, path);
	const prev = (await store.get<string[] | null>(KEYS.recentSpaces)) ?? [];
	const next = [path, ...prev.filter((p) => p !== path)].slice(0, 20);
	await store.set(KEYS.recentSpaces, next);
	await store.save();
}

export async function clearCurrentSpacePath(): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.currentSpacePath, null);
	await store.save();
}

export async function clearRecentSpaces(): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.recentSpaces, []);
	await store.save();
}

export async function updateOnboardingSettings(
	patch: Partial<OnboardingSettings>,
): Promise<void> {
	const entries = Object.entries(patch).filter(
		(entry): entry is [keyof OnboardingSettings, boolean] =>
			typeof entry[1] === "boolean",
	);
	if (!entries.length) return;
	const store = await getStore();
	for (const [key, value] of entries) {
		await store.set(ONBOARDING_KEYS[key], value);
	}
	await store.save();
	void emitSettingsUpdated({
		onboarding: Object.fromEntries(entries) as Partial<OnboardingSettings>,
	});
}

export async function setAiSidebarWidth(width: number): Promise<void> {
	const store = await getStore();
	if (!Number.isFinite(width)) return;
	const next = Math.floor(width);
	await store.set(KEYS.aiSidebarWidth, next);
	await store.save();
	void emitSettingsUpdated({ ui: { aiSidebarWidth: next } });
}

export async function setAiAssistantMode(mode: AiAssistantMode): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.aiAssistantMode, mode);
	await store.save();
	void emitSettingsUpdated({ ui: { aiAssistantMode: mode } });
}

export async function setAiEnabled(enabled: boolean): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.aiEnabled, enabled);
	await store.save();
	void emitSettingsUpdated({ ui: { aiEnabled: enabled } });
}

export async function setThemeMode(theme: ThemeMode): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.theme, theme);
	await store.save();
	void emitSettingsUpdated({ ui: { theme } });
}

export async function setAutoUpdateCheckInterval(
	interval: AutoUpdateCheckInterval,
): Promise<void> {
	const store = await getStore();
	const next = asAutoUpdateCheckInterval(interval);
	await store.set(KEYS.autoUpdateCheckInterval, next);
	await store.save();
	void emitSettingsUpdated({ ui: { autoUpdateCheckInterval: next } });
}

export async function setUiLightThemeId(
	lightThemeId: UiLightThemeId,
): Promise<void> {
	const store = await getStore();
	const next = asUiLightThemeId(lightThemeId);
	await store.set(KEYS.lightThemeId, next);
	await store.save();
	void emitSettingsUpdated({ ui: { lightThemeId: next } });
}

export async function setUiDarkThemeId(
	darkThemeId: UiDarkThemeId,
): Promise<void> {
	const store = await getStore();
	const next = asUiDarkThemeId(darkThemeId);
	await store.set(KEYS.darkThemeId, next);
	await store.save();
	void emitSettingsUpdated({ ui: { darkThemeId: next } });
}

export async function setUiAccent(accent: UiAccent): Promise<void> {
	const store = await getStore();
	const next = asUiAccent(accent);
	await store.set(KEYS.accent, next);
	await store.save();
	void emitSettingsUpdated({ ui: { accent: next } });
}

export async function setUiFontFamily(fontFamily: UiFontFamily): Promise<void> {
	const store = await getStore();
	const next = asUiFontFamily(fontFamily);
	await store.set(KEYS.fontFamily, next);
	await store.save();
	void emitSettingsUpdated({ ui: { fontFamily: next } });
}

export async function setUiMonoFontFamily(
	fontFamily: UiFontFamily,
): Promise<void> {
	const store = await getStore();
	const next = asUiMonoFontFamily(fontFamily);
	await store.set(KEYS.monoFontFamily, next);
	await store.save();
	void emitSettingsUpdated({ ui: { monoFontFamily: next } });
}

export async function setUiFontSize(fontSize: UiFontSize): Promise<void> {
	const store = await getStore();
	const next = asUiFontSize(fontSize);
	await store.set(KEYS.fontSize, next);
	await store.save();
	void emitSettingsUpdated({ ui: { fontSize: next } });
}

export async function setUiEditorFontSize(fontSize: UiFontSize): Promise<void> {
	const store = await getStore();
	const next = asUiEditorFontSize(fontSize);
	await store.set(KEYS.editorFontSize, next);
	await store.save();
	void emitSettingsUpdated({ ui: { editorFontSize: next } });
}

export async function setUiTranslucentApp(enabled: boolean): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.translucentApp, enabled);
	await store.save();
	void emitSettingsUpdated({ ui: { translucentApp: enabled } });
}

export async function setDelightfulGlyph(enabled: boolean): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.delightfulGlyph, enabled);
	await store.save();
	void emitSettingsUpdated({ ui: { delightfulGlyph: enabled } });
}

export async function setShowToc(enabled: boolean): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.showToc, enabled);
	await store.save();
	void emitSettingsUpdated({ ui: { showToc: enabled } });
}

export async function setShowFileTreeFolderCounts(
	enabled: boolean,
): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.showFileTreeFolderCounts, enabled);
	await store.save();
	void emitSettingsUpdated({ ui: { showFileTreeFolderCounts: enabled } });
}

export async function setEditorShowCollapsibleHeadings(
	enabled: boolean,
): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.editorShowCollapsibleHeadings, enabled);
	await store.save();
	void emitSettingsUpdated({
		editor: { showCollapsibleHeadings: enabled },
	});
}

export async function setEditorPastedMediaFolder(
	folder: string | null,
): Promise<void> {
	const store = await getStore();
	const nextFolder =
		typeof folder === "string"
			? normalizeRelPath(folder)
			: DEFAULT_EDITOR_SETTINGS.pastedMediaFolder;
	await store.set(KEYS.editorPastedMediaFolder, nextFolder);
	await store.save();
	void emitSettingsUpdated({
		editor: { pastedMediaFolder: nextFolder },
	});
}

export async function setEditorEnablePeopleMentionsAsTags(
	enabled: boolean,
): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.editorEnablePeopleMentionsAsTags, enabled);
	await store.save();
	void emitSettingsUpdated({
		editor: { enablePeopleMentionsAsTags: enabled },
	});
}

export async function getDailyNotesFolder(): Promise<string | null> {
	const store = await getStore();
	return (await store.get<string | null>(KEYS.dailyNotesFolder)) ?? null;
}

export async function setDailyNotesFolder(
	folder: string | null,
): Promise<void> {
	const store = await getStore();
	const nextFolder =
		typeof folder === "string" ? normalizeRelPath(folder) || null : null;
	if (nextFolder === null) {
		await store.delete(KEYS.dailyNotesFolder);
	} else {
		await store.set(KEYS.dailyNotesFolder, nextFolder);
	}
	await store.save();
	void emitSettingsUpdated({ dailyNotes: { folder: nextFolder } });
}

export async function getWebClippingsFolder(): Promise<string | null> {
	const store = await getStore();
	return (await store.get<string | null>(KEYS.webClippingsFolder)) ?? null;
}

export async function setWebClippingsFolder(
	folder: string | null,
): Promise<void> {
	const store = await getStore();
	const nextFolder =
		typeof folder === "string" ? normalizeRelPath(folder) || null : null;
	if (nextFolder === null) {
		await store.delete(KEYS.webClippingsFolder);
	} else {
		await store.set(KEYS.webClippingsFolder, nextFolder);
	}
	await store.save();
	void emitSettingsUpdated({ webClippings: { folder: nextFolder } });
}

export async function getTemplatesFolder(): Promise<string | null> {
	const store = await getStore();
	return (await store.get<string | null>(KEYS.templatesFolder)) ?? null;
}

export async function setTemplatesFolder(folder: string | null): Promise<void> {
	const store = await getStore();
	const nextFolder =
		typeof folder === "string" ? normalizeRelPath(folder) : null;
	if (nextFolder === null) {
		await store.delete(KEYS.templatesFolder);
		await store.delete(KEYS.templatesDailyNoteTemplate);
	} else {
		await store.set(KEYS.templatesFolder, nextFolder);
	}
	await store.save();
	void emitSettingsUpdated({
		templates: {
			folder: nextFolder,
			dailyNoteTemplate: nextFolder === null ? null : undefined,
		},
	});
}

export async function getDailyNoteTemplate(): Promise<string | null> {
	const store = await getStore();
	return (
		(await store.get<string | null>(KEYS.templatesDailyNoteTemplate)) ?? null
	);
}

export async function setDailyNoteTemplate(
	templatePath: string | null,
): Promise<void> {
	const store = await getStore();
	const nextPath =
		typeof templatePath === "string"
			? normalizeRelPath(templatePath) || null
			: null;
	if (nextPath === null) {
		await store.delete(KEYS.templatesDailyNoteTemplate);
	} else {
		await store.set(KEYS.templatesDailyNoteTemplate, nextPath);
	}
	await store.save();
	void emitSettingsUpdated({
		templates: { dailyNoteTemplate: nextPath },
	});
}

export async function setTaskSource(source: TaskSourceSetting): Promise<void> {
	const store = await getStore();
	const next = normalizeTaskSourceSetting(source);
	await store.set(KEYS.taskSource, next);
	await store.save();
	void emitSettingsUpdated({ tasks: { source: next } });
}

export async function setDatabaseShowColumnColor(
	enabled: boolean,
): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.databaseShowColumnColor, enabled);
	await store.save();
	void emitSettingsUpdated({ database: { showColumnColor: enabled } });
}

export async function setDatabaseShowNoteCount(
	enabled: boolean,
): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.databaseShowNoteCount, enabled);
	await store.save();
	void emitSettingsUpdated({ database: { showNoteCount: enabled } });
}

export async function getAutoUpdateLastCheckedAt(): Promise<number | null> {
	const store = await getStore();
	const raw = await store.get<unknown>(KEYS.autoUpdateLastCheckedAt);
	return typeof raw === "number" && Number.isFinite(raw) && raw > 0
		? raw
		: null;
}

export async function setAutoUpdateLastCheckedAt(
	timestamp: number | null,
): Promise<void> {
	const store = await getStore();
	if (
		typeof timestamp !== "number" ||
		!Number.isFinite(timestamp) ||
		timestamp <= 0
	) {
		await store.delete(KEYS.autoUpdateLastCheckedAt);
	} else {
		await store.set(KEYS.autoUpdateLastCheckedAt, Math.floor(timestamp));
	}
	await store.save();
}

export async function getRecentFiles(): Promise<RecentFile[]> {
	const store = await getStore();
	const raw = await store.get<unknown>(KEYS.recentFiles);
	return isRecentFileArray(raw) ? raw : [];
}

export async function addRecentFile(
	path: string,
	spacePath: string,
): Promise<void> {
	const store = await getStore();
	const raw = await store.get<unknown>(KEYS.recentFiles);
	const recent = isRecentFileArray(raw) ? raw : [];
	const filtered = recent.filter(
		(r) => r.path !== path || r.spacePath !== spacePath,
	);
	const next: RecentFile[] = [
		{ path, spacePath, openedAt: Date.now() },
		...filtered,
	].slice(0, 20);
	await store.set(KEYS.recentFiles, next);
	await store.save();
}
