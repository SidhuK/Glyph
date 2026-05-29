import { emit } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import { normalizeRelPath } from "../utils/path";
import {
	type Shortcut,
	areShortcutsEqual,
	getShortcutSignature,
	normalizeShortcut,
	validateConfigurableShortcut,
} from "./shortcuts";
import {
	SHORTCUT_ACTIONS,
	type ShortcutActionId,
	isShortcutActionId,
} from "./shortcuts/registry";
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
export type AttachmentStorageMode =
	| "space-root"
	| "specific-folder"
	| "note-folder";
const ATTACHMENT_STORAGE_MODES = new Set<AttachmentStorageMode>([
	"space-root",
	"specific-folder",
	"note-folder",
]);
export type UiAccent =
	| "neutral"
	| "glyph-orange"
	| "cerulean"
	| "tropical-teal"
	| "light-yellow"
	| "soft-apricot"
	| "vibrant-coral";
const UI_ACCENTS = new Set<UiAccent>([
	"neutral",
	"glyph-orange",
	"cerulean",
	"tropical-teal",
	"light-yellow",
	"soft-apricot",
	"vibrant-coral",
]);

export function isUiAccent(value: unknown): value is UiAccent {
	return typeof value === "string" && UI_ACCENTS.has(value as UiAccent);
}
const DEFAULT_UI_ACCENT: UiAccent = "neutral";
const DEFAULT_UI_FONT_FAMILY = "Geist";
const DEFAULT_UI_MONO_FONT_FAMILY = "JetBrains Mono";
const DEFAULT_AUTO_UPDATE_CHECK_INTERVAL: AutoUpdateCheckInterval = "3h";
export const MIN_UI_FONT_SIZE = 7;
export const MAX_UI_FONT_SIZE = 40;
const DEFAULT_UI_FONT_SIZE = 14;
export const MIN_EDITOR_FONT_SIZE = 10;
export const MAX_EDITOR_FONT_SIZE = 40;
const DEFAULT_EDITOR_FONT_SIZE = 16;
const DEFAULT_AI_ENABLED = true;
export const DEFAULT_QUICK_NOTES_FOLDER = "Quick Notes";
export type UiFontFamily = string;
export type UiFontSize = number;
const DEFAULT_ATTACHMENT_FOLDER = "assets";
const AI_ASSISTANT_MODES = new Set<AiAssistantMode>(["chat", "create"]);
export type EditorWidthMode = "compact" | "comfortable" | "wide";
const EDITOR_WIDTH_MODES = new Set<EditorWidthMode>([
	"compact",
	"comfortable",
	"wide",
]);
type TaskSourceMode = "space" | "folders";
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

interface TaskSourceSetting {
	mode: TaskSourceMode;
	folders: string[];
}

interface DatabaseSettings {
	showColumnColor: boolean;
}

interface QuickNotesSettings {
	folder: string;
}

interface EditorSettings {
	showCollapsibleHeadings: boolean;
	showFrontmatterInEditor: boolean;
	colorfulHeadings: boolean;
	beautifulTags: boolean;
	editorWidthMode: EditorWidthMode;
	attachmentStorageMode: AttachmentStorageMode;
	attachmentFolder: string | null;
	enablePeopleMentionsAsTags: boolean;
	vimKeybindings: boolean;
}

interface FileTreeSettings {
	showFolderFileCounts: boolean;
}

export interface ShortcutSettings {
	version: 1;
	bindings: Partial<Record<ShortcutActionId, Shortcut | null>>;
}

export type ShortcutBindings = ShortcutSettings["bindings"];
export type EffectiveShortcutBindings = Record<
	ShortcutActionId,
	Shortcut | null
>;

const DEFAULT_SHORTCUT_SETTINGS: ShortcutSettings = {
	version: 1,
	bindings: {},
};

const DEFAULT_DATABASE_SETTINGS: DatabaseSettings = {
	showColumnColor: true,
};

const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
	showCollapsibleHeadings: false,
	showFrontmatterInEditor: false,
	colorfulHeadings: false,
	beautifulTags: false,
	editorWidthMode: "compact",
	attachmentStorageMode: "note-folder",
	attachmentFolder: DEFAULT_ATTACHMENT_FOLDER,
	enablePeopleMentionsAsTags: false,
	vimKeybindings: false,
};

const DEFAULT_FILE_TREE_SETTINGS: FileTreeSettings = {
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

function asAttachmentStorageMode(value: unknown): AttachmentStorageMode {
	return typeof value === "string" &&
		ATTACHMENT_STORAGE_MODES.has(value as AttachmentStorageMode)
		? (value as AttachmentStorageMode)
		: DEFAULT_EDITOR_SETTINGS.attachmentStorageMode;
}

function asEditorWidthMode(value: unknown): EditorWidthMode {
	return typeof value === "string" &&
		EDITOR_WIDTH_MODES.has(value as EditorWidthMode)
		? (value as EditorWidthMode)
		: DEFAULT_EDITOR_SETTINGS.editorWidthMode;
}

function asUiAccent(value: unknown): UiAccent {
	return isUiAccent(value) ? value : DEFAULT_UI_ACCENT;
}

function asUiFontFamily(value: unknown): UiFontFamily {
	if (typeof value !== "string") return DEFAULT_UI_FONT_FAMILY;
	const trimmed = value.trim();
	if (!trimmed) return DEFAULT_UI_FONT_FAMILY;
	if (trimmed === "Satoshi") return DEFAULT_UI_FONT_FAMILY;
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
		showToc?: boolean;
		showFileTreeFolderCounts?: boolean;
		folioMode?: boolean;
		aiAssistantMode?: AiAssistantMode;
		aiEnabled?: boolean;
	};
	dailyNotes?: {
		folder?: string | null;
	};
	quickNotes?: {
		folder?: string;
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
	};
	editor?: {
		showCollapsibleHeadings?: boolean;
		showFrontmatterInEditor?: boolean;
		colorfulHeadings?: boolean;
		beautifulTags?: boolean;
		editorWidthMode?: EditorWidthMode;
		attachmentStorageMode?: AttachmentStorageMode;
		attachmentFolder?: string | null;
		enablePeopleMentionsAsTags?: boolean;
		vimKeybindings?: boolean;
	};
	shortcuts?: {
		bindings?: ShortcutBindings;
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
		showToc: boolean;
		showFileTreeFolderCounts: boolean;
		folioMode: boolean;
		aiAssistantMode: AiAssistantMode;
	};
	dailyNotes: {
		folder: string | null;
	};
	quickNotes: QuickNotesSettings;
	templates: {
		folder: string | null;
		dailyNoteTemplate: string | null;
	};
	tasks: {
		source: TaskSourceSetting;
	};
	shortcuts: ShortcutSettings;
	editor: EditorSettings;
	database: DatabaseSettings;
}

const KEYS = {
	currentSpacePath: "space.currentPath",
	recentSpaces: "space.recent",
	recentFiles: "files.recent",
	aiEnabled: "ui.aiEnabled",
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
	showToc: "ui.showToc",
	showFileTreeFolderCounts: "ui.fileTree.showFolderFileCounts",
	folioMode: "ui.folioMode",
	editorShowCollapsibleHeadings: "editor.showCollapsibleHeadings",
	editorShowFrontmatterInEditor: "editor.showFrontmatterInEditor",
	editorColorfulHeadings: "editor.colorfulHeadings",
	editorBeautifulTags: "editor.beautifulTags",
	editorEditorWidthMode: "editor.editorWidthMode",
	editorAttachmentStorageMode: "editor.attachmentStorageMode",
	editorAttachmentFolder: "editor.attachmentFolder",
	editorEnablePeopleMentionsAsTags: "editor.enablePeopleMentionsAsTags",
	editorVimKeybindings: "editor.vimKeybindings",
	autoUpdateLastCheckedAt: "updates.lastCheckedAt",
	releaseNotesLastSeenVersion: "updates.releaseNotes.lastSeenVersion",
	dailyNotesFolder: "dailyNotes.folder",
	quickNotesFolder: "quickNotes.folder",
	templatesFolder: "templates.folder",
	templatesDailyNoteTemplate: "templates.dailyNoteTemplate",
	taskSource: "tasks.source",
	shortcutsVersion: "shortcuts.version",
	shortcutsBindings: "shortcuts.bindings",
	databaseShowColumnColor: "database.showColumnColor",
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

function isShortcutBindingRecord(
	value: unknown,
): value is Record<string, Shortcut | null> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeShortcutBindingsInput(value: unknown): ShortcutBindings {
	if (!isShortcutBindingRecord(value)) return {};
	const next: ShortcutBindings = {};
	for (const [actionId, shortcutValue] of Object.entries(value)) {
		if (!isShortcutActionId(actionId)) continue;
		if (shortcutValue === null) {
			next[actionId] = null;
			continue;
		}
		if (typeof shortcutValue !== "object" || shortcutValue === null) continue;
		const raw = shortcutValue as Partial<Shortcut>;
		if (typeof raw.key !== "string") continue;
		const normalized = normalizeShortcut(raw as Shortcut);
		if (!validateConfigurableShortcut(normalized).valid) continue;
		next[actionId] = normalized;
	}
	return next;
}

function getDefaultShortcutBindings(): EffectiveShortcutBindings {
	return Object.fromEntries(
		SHORTCUT_ACTIONS.map((action) => [
			action.id,
			action.defaultBinding ? normalizeShortcut(action.defaultBinding) : null,
		]),
	) as EffectiveShortcutBindings;
}

export function getEffectiveShortcutBindings(
	bindings: ShortcutBindings = {},
): EffectiveShortcutBindings {
	const sanitized = sanitizeShortcutBindingsInput(bindings);
	const effective = getDefaultShortcutBindings();
	const claimed = new Map<string, ShortcutActionId>();

	for (const action of SHORTCUT_ACTIONS) {
		const binding = effective[action.id];
		if (!binding) continue;
		claimed.set(getShortcutSignature(binding), action.id);
	}

	for (const action of SHORTCUT_ACTIONS) {
		if (!Object.prototype.hasOwnProperty.call(sanitized, action.id)) continue;
		const override = sanitized[action.id];
		const defaultBinding = effective[action.id];
		if (defaultBinding) claimed.delete(getShortcutSignature(defaultBinding));
		if (override === null) {
			effective[action.id] = null;
			continue;
		}
		if (!override) {
			if (defaultBinding)
				claimed.set(getShortcutSignature(defaultBinding), action.id);
			continue;
		}
		const signature = getShortcutSignature(override);
		if (claimed.has(signature)) {
			if (defaultBinding)
				claimed.set(getShortcutSignature(defaultBinding), action.id);
			continue;
		}
		effective[action.id] = override;
		claimed.set(signature, action.id);
	}

	return effective;
}

function sanitizeShortcutBindings(bindings: unknown): ShortcutBindings {
	const sanitized = sanitizeShortcutBindingsInput(bindings);
	const effective = getEffectiveShortcutBindings(sanitized);
	const next: ShortcutBindings = {};
	for (const action of SHORTCUT_ACTIONS) {
		if (!Object.prototype.hasOwnProperty.call(sanitized, action.id)) continue;
		const override = sanitized[action.id];
		const effectiveBinding = effective[action.id];
		if (override === null) {
			if (action.defaultBinding !== null) next[action.id] = null;
			continue;
		}
		if (!override || !effectiveBinding) continue;
		const defaultBinding = action.defaultBinding
			? normalizeShortcut(action.defaultBinding)
			: null;
		if (defaultBinding && areShortcutsEqual(defaultBinding, effectiveBinding)) {
			continue;
		}
		next[action.id] = effectiveBinding;
	}
	return next;
}

export function findShortcutConflict(
	binding: Shortcut,
	bindings: ShortcutBindings = {},
	excludingActionId?: ShortcutActionId,
): ShortcutActionId | null {
	const normalized = normalizeShortcut(binding);
	const signature = getShortcutSignature(normalized);
	const effective = getEffectiveShortcutBindings(bindings);
	for (const action of SHORTCUT_ACTIONS) {
		if (action.id === excludingActionId) continue;
		const existing = effective[action.id];
		if (!existing) continue;
		if (getShortcutSignature(existing) === signature) return action.id;
	}
	return null;
}

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

function normalizeQuickNotesFolder(value: unknown): string {
	if (typeof value !== "string") return DEFAULT_QUICK_NOTES_FOLDER;
	const normalized = normalizeRelPath(value);
	return normalized || DEFAULT_QUICK_NOTES_FOLDER;
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
		rawShowToc,
		rawShowFileTreeFolderCounts,
		rawFolioMode,
		dailyNotesFolderRaw,
		rawQuickNotesFolder,
		templatesFolderRaw,
		templatesDailyNoteTemplateRaw,
		taskSourceRaw,
		rawEditorShowCollapsibleHeadings,
		rawEditorShowFrontmatterInEditor,
		rawEditorColorfulHeadings,
		rawEditorBeautifulTags,
		rawEditorWidthMode,
		rawEditorAttachmentStorageMode,
		rawEditorAttachmentFolder,
		rawEditorEnablePeopleMentionsAsTags,
		rawEditorVimKeybindings,
		rawDatabaseShowColumnColor,
		rawShortcutSettingsVersion,
		rawShortcutBindings,
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
		store.get<boolean | null>(KEYS.showToc),
		store.get<boolean | null>(KEYS.showFileTreeFolderCounts),
		store.get<boolean | null>(KEYS.folioMode),
		store.get<string | null>(KEYS.dailyNotesFolder),
		store.get<unknown>(KEYS.quickNotesFolder),
		store.get<string | null>(KEYS.templatesFolder),
		store.get<string | null>(KEYS.templatesDailyNoteTemplate),
		store.get<unknown>(KEYS.taskSource),
		store.get<boolean | null>(KEYS.editorShowCollapsibleHeadings),
		store.get<boolean | null>(KEYS.editorShowFrontmatterInEditor),
		store.get<boolean | null>(KEYS.editorColorfulHeadings),
		store.get<boolean | null>(KEYS.editorBeautifulTags),
		store.get<unknown>(KEYS.editorEditorWidthMode),
		store.get<unknown>(KEYS.editorAttachmentStorageMode),
		store.get<string | null>(KEYS.editorAttachmentFolder),
		store.get<boolean | null>(KEYS.editorEnablePeopleMentionsAsTags),
		store.get<boolean | null>(KEYS.editorVimKeybindings),
		store.get<boolean | null>(KEYS.databaseShowColumnColor),
		store.get<number | null>(KEYS.shortcutsVersion),
		store.get<unknown>(KEYS.shortcutsBindings),
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
	const aiAssistantMode = asAiAssistantMode(rawAiAssistantMode);
	const theme = asThemeMode(rawTheme);
	const autoUpdateCheckInterval = asAutoUpdateCheckInterval(
		rawAutoUpdateCheckInterval,
	);
	const lightThemeId = asUiLightThemeId(rawLightThemeId);
	const darkThemeId = asUiDarkThemeId(rawDarkThemeId);
	const accent = asUiAccent(rawAccent);
	const fontFamily = asUiFontFamily(rawFontFamily);
	if (
		typeof rawFontFamily === "string" &&
		rawFontFamily.trim() === "Satoshi" &&
		fontFamily === DEFAULT_UI_FONT_FAMILY
	) {
		await store.set(KEYS.fontFamily, DEFAULT_UI_FONT_FAMILY);
	}
	const monoFontFamily = asUiMonoFontFamily(rawMonoFontFamily);
	const fontSize = asUiFontSize(rawFontSize);
	const editorFontSize =
		rawEditorFontSize === undefined || rawEditorFontSize === null
			? DEFAULT_EDITOR_FONT_SIZE
			: asUiEditorFontSize(rawEditorFontSize);
	const translucentApp =
		typeof rawTranslucentApp === "boolean" ? rawTranslucentApp : true;
	const showToc = typeof rawShowToc === "boolean" ? rawShowToc : true;
	const showFileTreeFolderCounts =
		typeof rawShowFileTreeFolderCounts === "boolean"
			? rawShowFileTreeFolderCounts
			: DEFAULT_FILE_TREE_SETTINGS.showFolderFileCounts;
	const folioMode = typeof rawFolioMode === "boolean" ? rawFolioMode : false;
	const dailyNotesFolder =
		typeof dailyNotesFolderRaw === "string"
			? normalizeRelPath(dailyNotesFolderRaw) || null
			: null;
	const quickNotesFolder = normalizeQuickNotesFolder(rawQuickNotesFolder);
	const templatesFolder =
		typeof templatesFolderRaw === "string"
			? normalizeRelPath(templatesFolderRaw)
			: null;
	const templatesDailyNoteTemplate =
		typeof templatesDailyNoteTemplateRaw === "string"
			? normalizeRelPath(templatesDailyNoteTemplateRaw) || null
			: null;
	const taskSource = normalizeTaskSourceSetting(taskSourceRaw);
	const shortcutBindings = sanitizeShortcutBindings(rawShortcutBindings);
	const shortcuts: ShortcutSettings = {
		version:
			rawShortcutSettingsVersion === 1 ? 1 : DEFAULT_SHORTCUT_SETTINGS.version,
		bindings: shortcutBindings,
	};
	const attachmentStorageMode = asAttachmentStorageMode(
		rawEditorAttachmentStorageMode,
	);
	const attachmentFolder =
		typeof rawEditorAttachmentFolder === "string"
			? normalizeRelPath(rawEditorAttachmentFolder) || DEFAULT_ATTACHMENT_FOLDER
			: DEFAULT_EDITOR_SETTINGS.attachmentFolder;
	const editor: EditorSettings = {
		showCollapsibleHeadings:
			typeof rawEditorShowCollapsibleHeadings === "boolean"
				? rawEditorShowCollapsibleHeadings
				: DEFAULT_EDITOR_SETTINGS.showCollapsibleHeadings,
		showFrontmatterInEditor:
			typeof rawEditorShowFrontmatterInEditor === "boolean"
				? rawEditorShowFrontmatterInEditor
				: DEFAULT_EDITOR_SETTINGS.showFrontmatterInEditor,
		colorfulHeadings:
			typeof rawEditorColorfulHeadings === "boolean"
				? rawEditorColorfulHeadings
				: DEFAULT_EDITOR_SETTINGS.colorfulHeadings,
		beautifulTags:
			typeof rawEditorBeautifulTags === "boolean"
				? rawEditorBeautifulTags
				: DEFAULT_EDITOR_SETTINGS.beautifulTags,
		editorWidthMode: asEditorWidthMode(rawEditorWidthMode),
		attachmentStorageMode,
		attachmentFolder,
		enablePeopleMentionsAsTags:
			typeof rawEditorEnablePeopleMentionsAsTags === "boolean"
				? rawEditorEnablePeopleMentionsAsTags
				: DEFAULT_EDITOR_SETTINGS.enablePeopleMentionsAsTags,
		vimKeybindings:
			typeof rawEditorVimKeybindings === "boolean"
				? rawEditorVimKeybindings
				: DEFAULT_EDITOR_SETTINGS.vimKeybindings,
	};
	const database: DatabaseSettings = {
		showColumnColor:
			typeof rawDatabaseShowColumnColor === "boolean"
				? rawDatabaseShowColumnColor
				: DEFAULT_DATABASE_SETTINGS.showColumnColor,
	};
	return {
		currentSpacePath,
		recentSpaces: Array.isArray(recentSpaces) ? recentSpaces : [],
		recentFiles,
		onboarding,
		ui: {
			aiEnabled,
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
			showToc,
			showFileTreeFolderCounts,
			folioMode,
			aiAssistantMode,
		},
		dailyNotes: {
			folder: dailyNotesFolder,
		},
		quickNotes: {
			folder: quickNotesFolder,
		},
		templates: {
			folder: templatesFolder,
			dailyNoteTemplate: templatesDailyNoteTemplate,
		},
		tasks: {
			source: taskSource,
		},
		shortcuts,
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

async function saveShortcutBindingsToStore(bindings: ShortcutBindings) {
	const store = await getStore();
	const sanitized = sanitizeShortcutBindings(bindings);
	await store.set(KEYS.shortcutsVersion, DEFAULT_SHORTCUT_SETTINGS.version);
	await store.set(KEYS.shortcutsBindings, sanitized);
	await store.save();
	void emitSettingsUpdated({ shortcuts: { bindings: sanitized } });
	return sanitized;
}

let shortcutBindingsWriteQueue: Promise<unknown> = Promise.resolve();

function withShortcutBindingsWriteLock<T>(
	operation: () => Promise<T>,
): Promise<T> {
	const run = shortcutBindingsWriteQueue.then(operation, operation);
	shortcutBindingsWriteQueue = run.catch(() => {});
	return run;
}

export async function loadShortcutSettings(): Promise<ShortcutSettings> {
	const settings = await loadSettings();
	return settings.shortcuts;
}

export async function setShortcutBinding(
	actionId: ShortcutActionId,
	binding: Shortcut | null,
): Promise<ShortcutBindings> {
	return withShortcutBindingsWriteLock(async () => {
		const current = await loadShortcutSettings();
		const next = { ...current.bindings };
		if (binding === null) {
			next[actionId] = null;
			return saveShortcutBindingsToStore(next);
		}
		const normalized = normalizeShortcut(binding);
		const validation = validateConfigurableShortcut(normalized);
		if (!validation.valid) {
			throw new Error(validation.reason ?? "Invalid shortcut");
		}
		const conflict = findShortcutConflict(
			normalized,
			getEffectiveShortcutBindings(current.bindings),
			actionId,
		);
		if (conflict) {
			throw new Error(`Shortcut already used by ${conflict}`);
		}
		const definition = SHORTCUT_ACTIONS.find(
			(action) => action.id === actionId,
		);
		if (!definition) throw new Error(`Unknown shortcut action: ${actionId}`);
		const defaultBinding = definition.defaultBinding
			? normalizeShortcut(definition.defaultBinding)
			: null;
		if (defaultBinding && areShortcutsEqual(defaultBinding, normalized)) {
			delete next[actionId];
		} else {
			next[actionId] = normalized;
		}
		return saveShortcutBindingsToStore(next);
	});
}

export async function resetShortcutBinding(
	actionId: ShortcutActionId,
): Promise<ShortcutBindings> {
	return withShortcutBindingsWriteLock(async () => {
		const current = await loadShortcutSettings();
		const next = { ...current.bindings };
		delete next[actionId];
		return saveShortcutBindingsToStore(next);
	});
}

export async function resetAllShortcutBindings(): Promise<void> {
	return withShortcutBindingsWriteLock(async () => {
		const store = await getStore();
		await store.delete(KEYS.shortcutsVersion);
		await store.delete(KEYS.shortcutsBindings);
		await store.save();
		void emitSettingsUpdated({ shortcuts: { bindings: {} } });
	});
}

export async function getLastSeenReleaseNotesVersion(): Promise<string | null> {
	const store = await getStore();
	const version = await store.get<unknown>(KEYS.releaseNotesLastSeenVersion);
	const normalized = typeof version === "string" ? version.trim() : "";
	return normalized || null;
}

export async function setLastSeenReleaseNotesVersion(
	version: string,
): Promise<void> {
	const normalized = version.trim();
	if (!normalized) return;
	const store = await getStore();
	await store.set(KEYS.releaseNotesLastSeenVersion, normalized);
	await store.save();
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

export async function setFolioMode(enabled: boolean): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.folioMode, enabled);
	await store.save();
	void emitSettingsUpdated({ ui: { folioMode: enabled } });
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

export async function setEditorColorfulHeadings(
	enabled: boolean,
): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.editorColorfulHeadings, enabled);
	await store.save();
	void emitSettingsUpdated({
		editor: { colorfulHeadings: enabled },
	});
}

export async function setEditorBeautifulTags(enabled: boolean): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.editorBeautifulTags, enabled);
	await store.save();
	void emitSettingsUpdated({
		editor: { beautifulTags: enabled },
	});
}

export async function setEditorShowFrontmatterInEditor(
	enabled: boolean,
): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.editorShowFrontmatterInEditor, enabled);
	await store.save();
	void emitSettingsUpdated({
		editor: { showFrontmatterInEditor: enabled },
	});
}

export async function setEditorWidthMode(mode: EditorWidthMode): Promise<void> {
	const store = await getStore();
	const next = asEditorWidthMode(mode);
	await store.set(KEYS.editorEditorWidthMode, next);
	await store.save();
	void emitSettingsUpdated({
		editor: { editorWidthMode: next },
	});
}

export async function setEditorAttachmentStorageMode(
	mode: AttachmentStorageMode,
): Promise<void> {
	const store = await getStore();
	const nextMode = asAttachmentStorageMode(mode);
	await store.set(KEYS.editorAttachmentStorageMode, nextMode);
	await store.save();
	void emitSettingsUpdated({
		editor: { attachmentStorageMode: nextMode },
	});
}

export async function setEditorAttachmentFolder(
	folder: string | null,
): Promise<void> {
	const store = await getStore();
	const nextFolder =
		typeof folder === "string"
			? normalizeRelPath(folder) || DEFAULT_ATTACHMENT_FOLDER
			: DEFAULT_ATTACHMENT_FOLDER;
	await store.set(KEYS.editorAttachmentFolder, nextFolder);
	await store.save();
	void emitSettingsUpdated({
		editor: { attachmentFolder: nextFolder },
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

export async function setEditorVimKeybindings(enabled: boolean): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.editorVimKeybindings, enabled);
	await store.save();
	void emitSettingsUpdated({
		editor: { vimKeybindings: enabled },
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

export async function setQuickNotesFolder(folder: string): Promise<void> {
	const store = await getStore();
	const nextFolder = normalizeQuickNotesFolder(folder);
	await store.set(KEYS.quickNotesFolder, nextFolder);
	await store.save();
	void emitSettingsUpdated({ quickNotes: { folder: nextFolder } });
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

export async function setDatabaseShowColumnColor(
	enabled: boolean,
): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.databaseShowColumnColor, enabled);
	await store.save();
	void emitSettingsUpdated({ database: { showColumnColor: enabled } });
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
