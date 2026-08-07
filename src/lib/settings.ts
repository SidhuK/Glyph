import { emit, emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { normalizeRelPath, validateRelFolderPath } from "../utils/path";
import {
	ATTACHMENT_MODE_UI,
	DEFAULT_ATTACHMENT_FOLDER,
} from "./attachmentStorage";
import {
	DEFAULT_EDITOR_VIEW_MODE,
	type EditorViewMode,
	isEditorViewMode,
	setCachedDefaultEditorViewMode,
} from "./editorMode";
import {
	DEFAULT_HEADING_PALETTE_ID,
	type HeadingPaletteId,
	asHeadingPaletteId,
} from "./headingPalettes";
export { DEFAULT_ATTACHMENT_FOLDER } from "./attachmentStorage";
import { type AppLanguage, normalizeAppLanguage } from "../i18n/locales";
import {
	type CustomTheme,
	customThemeId,
	isCustomThemeId,
	normalizeCustomThemes,
} from "./customThemes";
import {
	type DateDisplayFormat,
	normalizeDateDisplayFormat,
} from "./dateDisplayFormat";
import {
	getSettingsStore,
	invalidateSettingsCache,
	loadSettingsEntries,
	saveSettingsStore,
} from "./settingsStore";
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
import { invoke } from "./tauri";
import type { AiAssistantMode } from "./tauri";
import {
	GLYPH_DEFAULT_DARK_THEME_ID,
	GLYPH_DEFAULT_LIGHT_THEME_ID,
	type UiDarkThemeId,
	type UiLightThemeId,
	asUiDarkThemeId,
	asUiLightThemeId,
} from "./uiThemes";

export type { AiAssistantMode } from "./tauri";
export type { DateDisplayFormat } from "./dateDisplayFormat";
export {
	DATE_DISPLAY_FORMAT_OPTIONS,
	DEFAULT_DATE_DISPLAY_FORMAT,
	isDateDisplayFormat,
	normalizeDateDisplayFormat,
} from "./dateDisplayFormat";
export type { UiDarkThemeId, UiLightThemeId } from "./uiThemes";
export type { AppLanguage } from "../i18n/locales";

export type ReleaseChannel = "stable" | "alpha";
export type FileTreeSortMode =
	| "name-asc"
	| "name-desc"
	| "modified-desc"
	| "modified-asc"
	| "created-desc"
	| "created-asc";
const FILE_TREE_SORT_MODES = new Set<FileTreeSortMode>([
	"name-asc",
	"name-desc",
	"modified-desc",
	"modified-asc",
	"created-desc",
	"created-asc",
]);

function getSettingValue<T>(
	entries: Map<string, unknown>,
	key: string,
): T | undefined {
	return entries.get(key) as T | undefined;
}

export type ThemeMode = "system" | "light" | "dark";
const THEME_MODES = new Set<ThemeMode>(["system", "light", "dark"]);
export type AutoUpdateCheckInterval = "3h";
const AUTO_UPDATE_CHECK_INTERVALS = new Set<AutoUpdateCheckInterval>(["3h"]);
export type AttachmentStorageMode =
	| "space-root"
	| "specific-folder"
	| "note-folder"
	| "note-subfolder";
const ATTACHMENT_STORAGE_MODES = new Set<AttachmentStorageMode>(
	Object.keys(ATTACHMENT_MODE_UI) as AttachmentStorageMode[],
);
export type UiCornerRadiusStyle = "default" | "sharp" | "round";
const UI_CORNER_RADIUS_STYLES = new Set<UiCornerRadiusStyle>([
	"default",
	"sharp",
	"round",
]);

export function isUiCornerRadiusStyle(
	value: unknown,
): value is UiCornerRadiusStyle {
	return (
		typeof value === "string" &&
		UI_CORNER_RADIUS_STYLES.has(value as UiCornerRadiusStyle)
	);
}

export const DEFAULT_UI_CORNER_RADIUS_STYLE: UiCornerRadiusStyle = "default";

function asUiCornerRadiusStyle(value: unknown): UiCornerRadiusStyle {
	return isUiCornerRadiusStyle(value) ? value : DEFAULT_UI_CORNER_RADIUS_STYLE;
}

const DEFAULT_UI_FONT_FAMILY = "Geist";
const DEFAULT_UI_EDITOR_FONT_FAMILY = DEFAULT_UI_FONT_FAMILY;
const DEFAULT_UI_MONO_FONT_FAMILY = "JetBrains Mono";
const DEFAULT_AUTO_UPDATE_CHECK_INTERVAL: AutoUpdateCheckInterval = "3h";
export const MIN_UI_FONT_SIZE = 7;
export const MAX_UI_FONT_SIZE = 40;
const DEFAULT_UI_FONT_SIZE = 14;
export const MIN_EDITOR_FONT_SIZE = 10;
export const MAX_EDITOR_FONT_SIZE = 40;
const DEFAULT_EDITOR_FONT_SIZE = 16;
export const DEFAULT_UI_TRANSLUCENT_APP = false;
const DEFAULT_AI_ENABLED = true;
export const DEFAULT_QUICK_NOTES_FOLDER = "Quick Notes";
export type UiFontFamily = string;
export type UiFontSize = number;
const AI_ASSISTANT_MODES = new Set<AiAssistantMode>(["chat", "create"]);
export type EditorWidthMode = "compact" | "comfortable" | "wide";
const EDITOR_WIDTH_MODES = new Set<EditorWidthMode>([
	"compact",
	"comfortable",
	"wide",
]);
export type FocusMode = "off" | "paragraph" | "sentence";
const FOCUS_MODES = new Set<FocusMode>(["off", "paragraph", "sentence"]);
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

interface DatabaseSettings {
	showColumnColor: boolean;
}

interface QuickNotesSettings {
	folder: string;
}

interface EditorSettings {
	showCollapsibleHeadings: boolean;
	showCollapsibleLists: boolean;
	showFrontmatterInEditor: boolean;
	showHeadingPrefixes: boolean;
	colorfulHeadings: boolean;
	headingPaletteId: HeadingPaletteId;
	beautifulTags: boolean;
	editorWidthMode: EditorWidthMode;
	defaultEditorMode: EditorViewMode;
	attachmentStorageMode: AttachmentStorageMode;
	attachmentFolder: string | null;
	enablePeopleMentionsAsTags: boolean;
	rawMarkdownVimMode: boolean;
	spellCheck: boolean;
	showExternalLinkPreviews: boolean;
	focusMode: FocusMode;
}

interface FileTreeSettings {
	showFolderFileCounts: boolean;
	showNonMarkdownFiles: boolean;
	sortMode: FileTreeSortMode;
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
	showCollapsibleLists: false,
	showFrontmatterInEditor: false,
	showHeadingPrefixes: true,
	colorfulHeadings: false,
	headingPaletteId: DEFAULT_HEADING_PALETTE_ID,
	beautifulTags: false,
	editorWidthMode: "compact",
	defaultEditorMode: DEFAULT_EDITOR_VIEW_MODE,
	attachmentStorageMode: "note-folder",
	attachmentFolder: DEFAULT_ATTACHMENT_FOLDER,
	enablePeopleMentionsAsTags: false,
	rawMarkdownVimMode: false,
	spellCheck: true,
	showExternalLinkPreviews: false,
	focusMode: "off",
};

const DEFAULT_FILE_TREE_SETTINGS: FileTreeSettings = {
	showFolderFileCounts: false,
	showNonMarkdownFiles: true,
	sortMode: "name-asc",
};

export function isFileTreeSortMode(value: unknown): value is FileTreeSortMode {
	return (
		typeof value === "string" &&
		FILE_TREE_SORT_MODES.has(value as FileTreeSortMode)
	);
}

function asThemeMode(value: unknown): ThemeMode {
	return typeof value === "string" && THEME_MODES.has(value as ThemeMode)
		? (value as ThemeMode)
		: "system";
}

function asFileTreeSortMode(value: unknown): FileTreeSortMode {
	return isFileTreeSortMode(value)
		? value
		: DEFAULT_FILE_TREE_SETTINGS.sortMode;
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
	return isAttachmentStorageMode(value)
		? value
		: DEFAULT_EDITOR_SETTINGS.attachmentStorageMode;
}

export function isAttachmentStorageMode(
	value: unknown,
): value is AttachmentStorageMode {
	return (
		typeof value === "string" &&
		ATTACHMENT_STORAGE_MODES.has(value as AttachmentStorageMode)
	);
}

function asEditorWidthMode(value: unknown): EditorWidthMode {
	return typeof value === "string" &&
		EDITOR_WIDTH_MODES.has(value as EditorWidthMode)
		? (value as EditorWidthMode)
		: DEFAULT_EDITOR_SETTINGS.editorWidthMode;
}

function asDefaultEditorMode(value: unknown): EditorViewMode {
	return isEditorViewMode(value)
		? value
		: DEFAULT_EDITOR_SETTINGS.defaultEditorMode;
}

export function isFocusMode(value: unknown): value is FocusMode {
	return typeof value === "string" && FOCUS_MODES.has(value as FocusMode);
}

function asFocusMode(value: unknown): FocusMode {
	return isFocusMode(value) ? value : DEFAULT_EDITOR_SETTINGS.focusMode;
}

/** Falls back to the Glyph preset when a selected custom theme no longer exists. */
function resolveSelectedThemeId<T extends string>(
	themeId: T,
	customThemes: readonly CustomTheme[],
	fallback: T,
): T {
	if (!isCustomThemeId(themeId)) return themeId;
	return customThemes.some((theme) => customThemeId(theme.name) === themeId)
		? themeId
		: fallback;
}

function asUiFontFamily(
	value: unknown,
	fallback: UiFontFamily = DEFAULT_UI_FONT_FAMILY,
): UiFontFamily {
	if (typeof value !== "string") return fallback;
	const trimmed = value.trim();
	if (!trimmed) return fallback;
	return trimmed.slice(0, 80);
}

function asUiEditorFontFamily(value: unknown): UiFontFamily {
	return asUiFontFamily(value, DEFAULT_UI_EDITOR_FONT_FAMILY);
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

function asReleaseChannel(value: unknown): ReleaseChannel {
	return value === "alpha" ? "alpha" : "stable";
}

async function emitSettingsUpdated(payload: {
	spacePath?: string;
	ui?: {
		theme?: ThemeMode;
		autoUpdateCheckInterval?: AutoUpdateCheckInterval;
		releaseChannel?: ReleaseChannel;
		lightThemeId?: UiLightThemeId;
		darkThemeId?: UiDarkThemeId;
		customThemes?: CustomTheme[];
		fontFamily?: UiFontFamily;
		editorFontFamily?: UiFontFamily;
		monoFontFamily?: UiFontFamily;
		fontSize?: UiFontSize;
		editorFontSize?: UiFontSize;
		translucentApp?: boolean;
		cornerRadiusStyle?: UiCornerRadiusStyle;
		showToc?: boolean;
		showFileTreeFolderCounts?: boolean;
		showNonMarkdownFiles?: boolean;
		fileTreeSortMode?: FileTreeSortMode;
		folioMode?: boolean;
		classicAllNotesByDefault?: boolean;
		resumeLastSession?: boolean;
		aiAssistantMode?: AiAssistantMode;
		aiEnabled?: boolean;
		language?: AppLanguage;
		dateDisplayFormat?: DateDisplayFormat;
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
	database?: {
		showColumnColor?: boolean;
	};
	editor?: {
		showCollapsibleHeadings?: boolean;
		showCollapsibleLists?: boolean;
		showFrontmatterInEditor?: boolean;
		showHeadingPrefixes?: boolean;
		colorfulHeadings?: boolean;
		headingPaletteId?: HeadingPaletteId;
		beautifulTags?: boolean;
		editorWidthMode?: EditorWidthMode;
		defaultEditorMode?: EditorViewMode;
		attachmentStorageMode?: AttachmentStorageMode;
		attachmentFolder?: string | null;
		enablePeopleMentionsAsTags?: boolean;
		rawMarkdownVimMode?: boolean;
		spellCheck?: boolean;
		showExternalLinkPreviews?: boolean;
		focusMode?: FocusMode;
	};
	shortcuts?: {
		bindings?: ShortcutBindings;
	};
	onboarding?: Partial<OnboardingSettings>;
}): Promise<void> {
	try {
		if (payload.spacePath) {
			await emitTo(getCurrentWindow().label, "settings:updated", payload);
			return;
		}
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

export interface AppSettings {
	currentSpacePath: string | null;
	recentSpaces: string[];
	recentFiles: RecentFile[];
	onboarding: OnboardingSettings;
	ui: {
		aiEnabled: boolean;
		language: AppLanguage;
		theme: ThemeMode;
		autoUpdateCheckInterval: AutoUpdateCheckInterval;
		releaseChannel: ReleaseChannel;
		lightThemeId: UiLightThemeId;
		darkThemeId: UiDarkThemeId;
		customThemes: CustomTheme[];
		fontFamily: UiFontFamily;
		editorFontFamily: UiFontFamily;
		monoFontFamily: UiFontFamily;
		fontSize: UiFontSize;
		editorFontSize: UiFontSize;
		translucentApp: boolean;
		cornerRadiusStyle: UiCornerRadiusStyle;
		showToc: boolean;
		showFileTreeFolderCounts: boolean;
		showNonMarkdownFiles: boolean;
		fileTreeSortMode: FileTreeSortMode;
		folioMode: boolean;
		classicAllNotesByDefault: boolean;
		resumeLastSession: boolean;
		aiAssistantMode: AiAssistantMode;
		dateDisplayFormat: DateDisplayFormat;
	};
	dailyNotes: {
		folder: string | null;
	};
	quickNotes: QuickNotesSettings;
	templates: {
		folder: string | null;
		dailyNoteTemplate: string | null;
	};
	shortcuts: ShortcutSettings;
	editor: EditorSettings;
	database: DatabaseSettings;
}

interface SpaceScopedSettings {
	dailyNotesFolder?: string | null;
	quickNotesFolder?: string;
	templatesFolder?: string | null;
	templatesDailyNoteTemplate?: string | null;
	attachmentStorageMode?: AttachmentStorageMode;
	attachmentFolder?: string | null;
}

type SpaceScopedSettingsMap = Record<string, SpaceScopedSettings>;

export interface SettingsScope {
	spacePath?: string | null;
}

let spaceScopedSettingsWriteQueue: Promise<unknown> = Promise.resolve();

async function withSpaceScopedSettingsWriteLock<T>(
	operation: () => Promise<T>,
): Promise<T> {
	const locks =
		typeof navigator !== "undefined" && "locks" in navigator
			? navigator.locks
			: null;
	if (locks) {
		return locks.request("glyph-space-scoped-settings", operation);
	}
	const run = spaceScopedSettingsWriteQueue.then(operation, operation);
	spaceScopedSettingsWriteQueue = run.catch(() => {});
	return run;
}

const KEYS = {
	currentSpacePath: "space.currentPath",
	recentSpaces: "space.recent",
	recentFiles: "files.recent",
	aiEnabled: "ui.aiEnabled",
	language: "ui.language",
	dateDisplayFormat: "ui.dateDisplayFormat",
	aiAssistantMode: "ui.aiAssistantMode",
	theme: "ui.theme",
	autoUpdateCheckInterval: "ui.autoUpdateCheckInterval",
	releaseChannel: "updates.releaseChannel",
	lightThemeId: "ui.lightThemeId",
	darkThemeId: "ui.darkThemeId",
	customThemes: "ui.customThemes",
	fontFamily: "ui.fontFamily",
	editorFontFamily: "ui.editorFontFamily",
	monoFontFamily: "ui.monoFontFamily",
	fontSize: "ui.fontSize",
	editorFontSize: "ui.editorFontSize",
	translucentApp: "ui.translucentApp",
	cornerRadiusStyle: "ui.cornerRadiusStyle",
	showToc: "ui.showToc",
	showFileTreeFolderCounts: "ui.fileTree.showFolderFileCounts",
	showNonMarkdownFiles: "ui.fileTree.showNonMarkdownFiles",
	fileTreeSortMode: "ui.fileTree.sortMode",
	folioMode: "ui.folioMode",
	classicAllNotesByDefault: "ui.classicAllNotesByDefault",
	resumeLastSession: "ui.resumeLastSession",
	editorShowCollapsibleHeadings: "editor.showCollapsibleHeadings",
	editorShowCollapsibleLists: "editor.showCollapsibleLists",
	editorShowFrontmatterInEditor: "editor.showFrontmatterInEditor",
	editorShowHeadingPrefixes: "editor.showHeadingPrefixes",
	editorColorfulHeadings: "editor.colorfulHeadings",
	editorHeadingPaletteId: "editor.headingPaletteId",
	editorBeautifulTags: "editor.beautifulTags",
	editorEditorWidthMode: "editor.editorWidthMode",
	editorDefaultEditorMode: "editor.defaultEditorMode",
	editorAttachmentStorageMode: "editor.attachmentStorageMode",
	editorAttachmentFolder: "editor.attachmentFolder",
	editorEnablePeopleMentionsAsTags: "editor.enablePeopleMentionsAsTags",
	editorRawMarkdownVimMode: "editor.rawMarkdownVimMode",
	editorSpellCheck: "editor.spellCheck",
	editorShowExternalLinkPreviews: "editor.showExternalLinkPreviews",
	editorFocusMode: "editor.focusMode",
	autoUpdateLastCheckedAt: "updates.lastCheckedAt",
	dailyNotesFolder: "dailyNotes.folder",
	quickNotesFolder: "quickNotes.folder",
	templatesFolder: "templates.folder",
	templatesDailyNoteTemplate: "templates.dailyNoteTemplate",
	shortcutsVersion: "shortcuts.version",
	shortcutsBindings: "shortcuts.bindings",
	databaseShowColumnColor: "database.showColumnColor",
	spaceScopedSettings: "space.scopedSettings",
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSpaceScopedSettings(value: unknown): SpaceScopedSettings {
	if (!isRecord(value)) return {};
	const out: SpaceScopedSettings = {};
	if ("dailyNotesFolder" in value) {
		out.dailyNotesFolder =
			typeof value.dailyNotesFolder === "string"
				? normalizeRelPath(value.dailyNotesFolder) || null
				: null;
	}
	if (typeof value.quickNotesFolder === "string") {
		out.quickNotesFolder = normalizeQuickNotesFolder(value.quickNotesFolder);
	}
	if ("templatesFolder" in value) {
		out.templatesFolder =
			typeof value.templatesFolder === "string"
				? normalizeRelPath(value.templatesFolder)
				: null;
	}
	if ("templatesDailyNoteTemplate" in value) {
		out.templatesDailyNoteTemplate =
			typeof value.templatesDailyNoteTemplate === "string"
				? normalizeRelPath(value.templatesDailyNoteTemplate) || null
				: null;
	}
	if ("attachmentStorageMode" in value) {
		out.attachmentStorageMode = asAttachmentStorageMode(
			value.attachmentStorageMode,
		);
	}
	if ("attachmentFolder" in value) {
		out.attachmentFolder =
			typeof value.attachmentFolder === "string"
				? normalizeRelPath(value.attachmentFolder) || DEFAULT_ATTACHMENT_FOLDER
				: DEFAULT_EDITOR_SETTINGS.attachmentFolder;
	}
	return out;
}

function normalizeSpaceScopedSettingsMap(
	value: unknown,
): SpaceScopedSettingsMap {
	if (!isRecord(value)) return {};
	const out: SpaceScopedSettingsMap = {};
	for (const [spacePath, settings] of Object.entries(value)) {
		const key = spacePath.trim();
		if (!key) continue;
		out[key] = normalizeSpaceScopedSettings(settings);
	}
	return out;
}

async function activeSpacePath(scope?: SettingsScope): Promise<string | null> {
	if (scope && "spacePath" in scope) {
		const path = scope.spacePath?.trim();
		return path || null;
	}
	try {
		return await invoke("space_get_current");
	} catch {
		return null;
	}
}

async function updateActiveSpaceSettings(
	patch: SpaceScopedSettings,
	scope?: SettingsScope,
): Promise<string | null> {
	const spacePath = await activeSpacePath(scope);
	if (!spacePath) return null;
	await withSpaceScopedSettingsWriteLock(async () => {
		const store = await getSettingsStore();
		const map = normalizeSpaceScopedSettingsMap(
			await store.get<unknown>(KEYS.spaceScopedSettings),
		);
		map[spacePath] = { ...map[spacePath], ...patch };
		await store.set(KEYS.spaceScopedSettings, map);
		await saveSettingsStore(store);
	});
	return spacePath;
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

function normalizeQuickNotesFolder(value: unknown): string {
	if (typeof value !== "string") return DEFAULT_QUICK_NOTES_FOLDER;
	const normalized = normalizeRelPath(value);
	return normalized || DEFAULT_QUICK_NOTES_FOLDER;
}

export async function reloadFromDisk(): Promise<void> {
	const store = await getSettingsStore();
	await store.reload();
	invalidateSettingsCache();
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

export async function loadSettings(
	scope?: SettingsScope,
): Promise<AppSettings> {
	const entries = await loadSettingsEntries();
	const currentSpacePathRaw = getSettingValue<string | null>(
		entries,
		KEYS.currentSpacePath,
	);
	const recentSpacesRaw = getSettingValue<string[] | null>(
		entries,
		KEYS.recentSpaces,
	);
	const rawRecentFiles = getSettingValue(entries, KEYS.recentFiles);
	const rawOnboardingLauncherSeen = getSettingValue<boolean | null>(
		entries,
		KEYS.onboardingLauncherSeen,
	);
	const rawOnboardingStarterDismissed = getSettingValue<boolean | null>(
		entries,
		KEYS.onboardingStarterDismissed,
	);
	const rawOnboardingCreatedFirstNote = getSettingValue<boolean | null>(
		entries,
		KEYS.onboardingCreatedFirstNote,
	);
	const rawOnboardingUsedCommandPalette = getSettingValue<boolean | null>(
		entries,
		KEYS.onboardingUsedCommandPalette,
	);
	const rawOnboardingOpenedDailyNote = getSettingValue<boolean | null>(
		entries,
		KEYS.onboardingOpenedDailyNote,
	);
	const rawAiEnabled = getSettingValue<boolean | null>(entries, KEYS.aiEnabled);
	const rawLanguage = getSettingValue(entries, KEYS.language);
	const rawDateDisplayFormat = getSettingValue(entries, KEYS.dateDisplayFormat);
	const rawAiAssistantMode = getSettingValue(entries, KEYS.aiAssistantMode);
	const rawTheme = getSettingValue(entries, KEYS.theme);
	const rawAutoUpdateCheckInterval = getSettingValue(
		entries,
		KEYS.autoUpdateCheckInterval,
	);
	const rawReleaseChannel = getSettingValue(entries, KEYS.releaseChannel);
	const rawLightThemeId = getSettingValue(entries, KEYS.lightThemeId);
	const rawDarkThemeId = getSettingValue(entries, KEYS.darkThemeId);
	const rawFontFamily = getSettingValue(entries, KEYS.fontFamily);
	const rawEditorFontFamily = getSettingValue(entries, KEYS.editorFontFamily);
	const rawMonoFontFamily = getSettingValue(entries, KEYS.monoFontFamily);
	const rawFontSize = getSettingValue(entries, KEYS.fontSize);
	const rawEditorFontSize = getSettingValue(entries, KEYS.editorFontSize);
	const rawTranslucentApp = getSettingValue<boolean | null>(
		entries,
		KEYS.translucentApp,
	);
	const rawCornerRadiusStyle = getSettingValue(entries, KEYS.cornerRadiusStyle);
	const rawShowToc = getSettingValue<boolean | null>(entries, KEYS.showToc);
	const rawShowFileTreeFolderCounts = getSettingValue<boolean | null>(
		entries,
		KEYS.showFileTreeFolderCounts,
	);
	const rawShowNonMarkdownFiles = getSettingValue<boolean | null>(
		entries,
		KEYS.showNonMarkdownFiles,
	);
	const rawFileTreeSortMode = getSettingValue(entries, KEYS.fileTreeSortMode);
	const rawFolioMode = getSettingValue<boolean | null>(entries, KEYS.folioMode);
	const rawClassicAllNotesByDefault = getSettingValue<boolean | null>(
		entries,
		KEYS.classicAllNotesByDefault,
	);
	const rawResumeLastSession = getSettingValue<boolean | null>(
		entries,
		KEYS.resumeLastSession,
	);
	const dailyNotesFolderRaw = getSettingValue<string | null>(
		entries,
		KEYS.dailyNotesFolder,
	);
	const rawQuickNotesFolder = getSettingValue(entries, KEYS.quickNotesFolder);
	const templatesFolderRaw = getSettingValue<string | null>(
		entries,
		KEYS.templatesFolder,
	);
	const templatesDailyNoteTemplateRaw = getSettingValue<string | null>(
		entries,
		KEYS.templatesDailyNoteTemplate,
	);
	const rawEditorShowCollapsibleHeadings = getSettingValue<boolean | null>(
		entries,
		KEYS.editorShowCollapsibleHeadings,
	);
	const rawEditorShowCollapsibleLists = getSettingValue<boolean | null>(
		entries,
		KEYS.editorShowCollapsibleLists,
	);
	const rawEditorShowFrontmatterInEditor = getSettingValue<boolean | null>(
		entries,
		KEYS.editorShowFrontmatterInEditor,
	);
	const rawEditorShowHeadingPrefixes = getSettingValue<boolean | null>(
		entries,
		KEYS.editorShowHeadingPrefixes,
	);
	const rawEditorColorfulHeadings = getSettingValue<boolean | null>(
		entries,
		KEYS.editorColorfulHeadings,
	);
	const rawEditorHeadingPaletteId = getSettingValue(
		entries,
		KEYS.editorHeadingPaletteId,
	);
	const rawEditorBeautifulTags = getSettingValue<boolean | null>(
		entries,
		KEYS.editorBeautifulTags,
	);
	const rawEditorWidthMode = getSettingValue(
		entries,
		KEYS.editorEditorWidthMode,
	);
	const rawEditorDefaultEditorMode = getSettingValue(
		entries,
		KEYS.editorDefaultEditorMode,
	);
	const rawEditorAttachmentStorageMode = getSettingValue(
		entries,
		KEYS.editorAttachmentStorageMode,
	);
	const rawEditorAttachmentFolder = getSettingValue<string | null>(
		entries,
		KEYS.editorAttachmentFolder,
	);
	const rawEditorEnablePeopleMentionsAsTags = getSettingValue<boolean | null>(
		entries,
		KEYS.editorEnablePeopleMentionsAsTags,
	);
	const rawEditorRawMarkdownVimMode = getSettingValue<boolean | null>(
		entries,
		KEYS.editorRawMarkdownVimMode,
	);
	const rawEditorSpellCheck = getSettingValue<boolean | null>(
		entries,
		KEYS.editorSpellCheck,
	);
	const rawEditorShowExternalLinkPreviews = getSettingValue<boolean | null>(
		entries,
		KEYS.editorShowExternalLinkPreviews,
	);
	const rawEditorFocusMode = getSettingValue(entries, KEYS.editorFocusMode);
	const rawDatabaseShowColumnColor = getSettingValue<boolean | null>(
		entries,
		KEYS.databaseShowColumnColor,
	);
	const rawShortcutSettingsVersion = getSettingValue<number | null>(
		entries,
		KEYS.shortcutsVersion,
	);
	const rawShortcutBindings = getSettingValue(entries, KEYS.shortcutsBindings);
	const rawSpaceScopedSettings = getSettingValue(
		entries,
		KEYS.spaceScopedSettings,
	);
	const scopedSettings = normalizeSpaceScopedSettingsMap(
		rawSpaceScopedSettings,
	);
	const activeSettingsSpacePath = await activeSpacePath(scope);
	const currentSpacePath =
		activeSettingsSpacePath ?? currentSpacePathRaw ?? null;
	const activeScopedSettings = activeSettingsSpacePath
		? scopedSettings[activeSettingsSpacePath]
		: undefined;
	const hasActiveSpace = Boolean(activeSettingsSpacePath);
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
	const language = normalizeAppLanguage(rawLanguage);
	const dateDisplayFormat = normalizeDateDisplayFormat(rawDateDisplayFormat);
	const aiAssistantMode = asAiAssistantMode(rawAiAssistantMode);
	const theme = asThemeMode(rawTheme);
	const autoUpdateCheckInterval = asAutoUpdateCheckInterval(
		rawAutoUpdateCheckInterval,
	);
	const releaseChannel = asReleaseChannel(rawReleaseChannel);
	const customThemes = normalizeCustomThemes(
		getSettingValue(entries, KEYS.customThemes),
	);
	const lightThemeId = resolveSelectedThemeId(
		asUiLightThemeId(rawLightThemeId),
		customThemes,
		GLYPH_DEFAULT_LIGHT_THEME_ID,
	);
	const darkThemeId = resolveSelectedThemeId(
		asUiDarkThemeId(rawDarkThemeId),
		customThemes,
		GLYPH_DEFAULT_DARK_THEME_ID,
	);
	const fontFamily = asUiFontFamily(rawFontFamily);
	const monoFontFamily = asUiMonoFontFamily(rawMonoFontFamily);
	const editorFontFamily =
		rawEditorFontFamily === undefined || rawEditorFontFamily === null
			? fontFamily
			: asUiEditorFontFamily(rawEditorFontFamily);
	const fontSize = asUiFontSize(rawFontSize);
	const editorFontSize =
		rawEditorFontSize === undefined || rawEditorFontSize === null
			? DEFAULT_EDITOR_FONT_SIZE
			: asUiEditorFontSize(rawEditorFontSize);
	const translucentApp =
		typeof rawTranslucentApp === "boolean"
			? rawTranslucentApp
			: DEFAULT_UI_TRANSLUCENT_APP;
	const cornerRadiusStyle = asUiCornerRadiusStyle(rawCornerRadiusStyle);
	const showToc = typeof rawShowToc === "boolean" ? rawShowToc : true;
	const showFileTreeFolderCounts =
		typeof rawShowFileTreeFolderCounts === "boolean"
			? rawShowFileTreeFolderCounts
			: DEFAULT_FILE_TREE_SETTINGS.showFolderFileCounts;
	const showNonMarkdownFiles =
		typeof rawShowNonMarkdownFiles === "boolean"
			? rawShowNonMarkdownFiles
			: DEFAULT_FILE_TREE_SETTINGS.showNonMarkdownFiles;
	const fileTreeSortMode = asFileTreeSortMode(rawFileTreeSortMode);
	const folioMode = typeof rawFolioMode === "boolean" ? rawFolioMode : false;
	const classicAllNotesByDefault =
		typeof rawClassicAllNotesByDefault === "boolean"
			? rawClassicAllNotesByDefault
			: false;
	const resumeLastSession =
		typeof rawResumeLastSession === "boolean" ? rawResumeLastSession : false;
	const dailyNotesFolder = hasActiveSpace
		? (activeScopedSettings?.dailyNotesFolder ?? null)
		: typeof dailyNotesFolderRaw === "string"
			? normalizeRelPath(dailyNotesFolderRaw) || null
			: null;
	const quickNotesFolder = hasActiveSpace
		? (activeScopedSettings?.quickNotesFolder ?? DEFAULT_QUICK_NOTES_FOLDER)
		: normalizeQuickNotesFolder(rawQuickNotesFolder);
	const templatesFolder = hasActiveSpace
		? (activeScopedSettings?.templatesFolder ?? null)
		: typeof templatesFolderRaw === "string"
			? normalizeRelPath(templatesFolderRaw)
			: null;
	const templatesDailyNoteTemplate = hasActiveSpace
		? (activeScopedSettings?.templatesDailyNoteTemplate ?? null)
		: typeof templatesDailyNoteTemplateRaw === "string"
			? normalizeRelPath(templatesDailyNoteTemplateRaw) || null
			: null;
	const shortcutBindings = sanitizeShortcutBindings(rawShortcutBindings);
	const shortcuts: ShortcutSettings = {
		version:
			rawShortcutSettingsVersion === 1 ? 1 : DEFAULT_SHORTCUT_SETTINGS.version,
		bindings: shortcutBindings,
	};
	const attachmentStorageMode = hasActiveSpace
		? (activeScopedSettings?.attachmentStorageMode ??
			DEFAULT_EDITOR_SETTINGS.attachmentStorageMode)
		: asAttachmentStorageMode(rawEditorAttachmentStorageMode);
	const attachmentFolder = hasActiveSpace
		? (activeScopedSettings?.attachmentFolder ??
			DEFAULT_EDITOR_SETTINGS.attachmentFolder)
		: typeof rawEditorAttachmentFolder === "string"
			? normalizeRelPath(rawEditorAttachmentFolder) || DEFAULT_ATTACHMENT_FOLDER
			: DEFAULT_EDITOR_SETTINGS.attachmentFolder;
	const editor: EditorSettings = {
		showCollapsibleHeadings:
			typeof rawEditorShowCollapsibleHeadings === "boolean"
				? rawEditorShowCollapsibleHeadings
				: DEFAULT_EDITOR_SETTINGS.showCollapsibleHeadings,
		showCollapsibleLists:
			typeof rawEditorShowCollapsibleLists === "boolean"
				? rawEditorShowCollapsibleLists
				: DEFAULT_EDITOR_SETTINGS.showCollapsibleLists,
		showFrontmatterInEditor:
			typeof rawEditorShowFrontmatterInEditor === "boolean"
				? rawEditorShowFrontmatterInEditor
				: DEFAULT_EDITOR_SETTINGS.showFrontmatterInEditor,
		showHeadingPrefixes:
			typeof rawEditorShowHeadingPrefixes === "boolean"
				? rawEditorShowHeadingPrefixes
				: DEFAULT_EDITOR_SETTINGS.showHeadingPrefixes,
		colorfulHeadings:
			typeof rawEditorColorfulHeadings === "boolean"
				? rawEditorColorfulHeadings
				: DEFAULT_EDITOR_SETTINGS.colorfulHeadings,
		headingPaletteId: asHeadingPaletteId(rawEditorHeadingPaletteId),
		beautifulTags:
			typeof rawEditorBeautifulTags === "boolean"
				? rawEditorBeautifulTags
				: DEFAULT_EDITOR_SETTINGS.beautifulTags,
		editorWidthMode: asEditorWidthMode(rawEditorWidthMode),
		defaultEditorMode: asDefaultEditorMode(rawEditorDefaultEditorMode),
		attachmentStorageMode,
		attachmentFolder,
		enablePeopleMentionsAsTags:
			typeof rawEditorEnablePeopleMentionsAsTags === "boolean"
				? rawEditorEnablePeopleMentionsAsTags
				: DEFAULT_EDITOR_SETTINGS.enablePeopleMentionsAsTags,
		rawMarkdownVimMode:
			typeof rawEditorRawMarkdownVimMode === "boolean"
				? rawEditorRawMarkdownVimMode
				: DEFAULT_EDITOR_SETTINGS.rawMarkdownVimMode,
		spellCheck:
			typeof rawEditorSpellCheck === "boolean"
				? rawEditorSpellCheck
				: DEFAULT_EDITOR_SETTINGS.spellCheck,
		showExternalLinkPreviews:
			typeof rawEditorShowExternalLinkPreviews === "boolean"
				? rawEditorShowExternalLinkPreviews
				: DEFAULT_EDITOR_SETTINGS.showExternalLinkPreviews,
		focusMode: asFocusMode(rawEditorFocusMode),
	};
	const database: DatabaseSettings = {
		showColumnColor:
			typeof rawDatabaseShowColumnColor === "boolean"
				? rawDatabaseShowColumnColor
				: DEFAULT_DATABASE_SETTINGS.showColumnColor,
	};
	setCachedDefaultEditorViewMode(editor.defaultEditorMode);
	return {
		currentSpacePath,
		recentSpaces: Array.isArray(recentSpaces) ? recentSpaces : [],
		recentFiles,
		onboarding,
		ui: {
			aiEnabled,
			language,
			theme,
			autoUpdateCheckInterval,
			releaseChannel,
			lightThemeId,
			darkThemeId,
			customThemes,
			fontFamily,
			editorFontFamily,
			monoFontFamily,
			fontSize,
			editorFontSize,
			translucentApp,
			cornerRadiusStyle,
			showToc,
			showFileTreeFolderCounts,
			showNonMarkdownFiles,
			fileTreeSortMode,
			folioMode,
			classicAllNotesByDefault,
			resumeLastSession,
			aiAssistantMode,
			dateDisplayFormat,
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
		shortcuts,
		editor,
		database,
	};
}

export async function setCurrentSpacePath(path: string): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.currentSpacePath, path);
	const prev = (await store.get<string[] | null>(KEYS.recentSpaces)) ?? [];
	const next = [path, ...prev.filter((p) => p !== path)].slice(0, 20);
	await store.set(KEYS.recentSpaces, next);
	await saveSettingsStore(store);
}

export async function clearCurrentSpacePath(): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.currentSpacePath, null);
	await saveSettingsStore(store);
}

export async function updateOnboardingSettings(
	patch: Partial<OnboardingSettings>,
): Promise<void> {
	const entries = Object.entries(patch).filter(
		(entry): entry is [keyof OnboardingSettings, boolean] =>
			typeof entry[1] === "boolean",
	);
	if (!entries.length) return;
	const store = await getSettingsStore();
	for (const [key, value] of entries) {
		await store.set(ONBOARDING_KEYS[key], value);
	}
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		onboarding: Object.fromEntries(entries) as Partial<OnboardingSettings>,
	});
}

async function saveShortcutBindingsToStore(bindings: ShortcutBindings) {
	const store = await getSettingsStore();
	const sanitized = sanitizeShortcutBindings(bindings);
	await store.set(KEYS.shortcutsVersion, DEFAULT_SHORTCUT_SETTINGS.version);
	await store.set(KEYS.shortcutsBindings, sanitized);
	await saveSettingsStore(store);
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
		const store = await getSettingsStore();
		await store.delete(KEYS.shortcutsVersion);
		await store.delete(KEYS.shortcutsBindings);
		await saveSettingsStore(store);
		void emitSettingsUpdated({ shortcuts: { bindings: {} } });
	});
}

export async function setAiAssistantMode(mode: AiAssistantMode): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.aiAssistantMode, mode);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { aiAssistantMode: mode } });
}

export async function setAiEnabled(enabled: boolean): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.aiEnabled, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { aiEnabled: enabled } });
}

export async function setLanguage(language: AppLanguage): Promise<void> {
	const store = await getSettingsStore();
	const normalized = normalizeAppLanguage(language);
	await store.set(KEYS.language, normalized);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { language: normalized } });
}

export async function setDateDisplayFormat(
	format: DateDisplayFormat,
): Promise<void> {
	const store = await getSettingsStore();
	const next = normalizeDateDisplayFormat(format);
	await store.set(KEYS.dateDisplayFormat, next);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { dateDisplayFormat: next } });
}

export async function setThemeMode(theme: ThemeMode): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.theme, theme);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { theme } });
}

export async function setUiLightThemeId(
	lightThemeId: UiLightThemeId,
): Promise<void> {
	const store = await getSettingsStore();
	const next = asUiLightThemeId(lightThemeId);
	await store.set(KEYS.lightThemeId, next);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { lightThemeId: next } });
}

export async function setUiDarkThemeId(
	darkThemeId: UiDarkThemeId,
): Promise<void> {
	const store = await getSettingsStore();
	const next = asUiDarkThemeId(darkThemeId);
	await store.set(KEYS.darkThemeId, next);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { darkThemeId: next } });
}

export async function setUiCustomThemes(
	customThemes: readonly CustomTheme[],
): Promise<void> {
	const store = await getSettingsStore();
	const next = normalizeCustomThemes(customThemes);
	await store.set(KEYS.customThemes, next);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { customThemes: next } });
}

export async function setUiFontFamily(fontFamily: UiFontFamily): Promise<void> {
	const store = await getSettingsStore();
	const next = asUiFontFamily(fontFamily);
	await store.set(KEYS.fontFamily, next);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { fontFamily: next } });
}

export async function setUiEditorFontFamily(
	fontFamily: UiFontFamily,
): Promise<void> {
	const store = await getSettingsStore();
	const next = asUiEditorFontFamily(fontFamily);
	await store.set(KEYS.editorFontFamily, next);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { editorFontFamily: next } });
}

export async function setUiMonoFontFamily(
	fontFamily: UiFontFamily,
): Promise<void> {
	const store = await getSettingsStore();
	const next = asUiMonoFontFamily(fontFamily);
	await store.set(KEYS.monoFontFamily, next);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { monoFontFamily: next } });
}

export async function setUiFontSize(fontSize: UiFontSize): Promise<void> {
	const store = await getSettingsStore();
	const next = asUiFontSize(fontSize);
	await store.set(KEYS.fontSize, next);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { fontSize: next } });
}

export async function setUiEditorFontSize(fontSize: UiFontSize): Promise<void> {
	const store = await getSettingsStore();
	const next = asUiEditorFontSize(fontSize);
	await store.set(KEYS.editorFontSize, next);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { editorFontSize: next } });
}

export async function setUiTranslucentApp(enabled: boolean): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.translucentApp, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { translucentApp: enabled } });
}

export async function setUiCornerRadiusStyle(
	style: UiCornerRadiusStyle,
): Promise<void> {
	const store = await getSettingsStore();
	const next = asUiCornerRadiusStyle(style);
	await store.set(KEYS.cornerRadiusStyle, next);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { cornerRadiusStyle: next } });
}

export async function setShowToc(enabled: boolean): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.showToc, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { showToc: enabled } });
}

export async function setShowFileTreeFolderCounts(
	enabled: boolean,
): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.showFileTreeFolderCounts, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { showFileTreeFolderCounts: enabled } });
}

export async function setShowNonMarkdownFiles(enabled: boolean): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.showNonMarkdownFiles, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { showNonMarkdownFiles: enabled } });
}

export async function setFileTreeSortMode(
	sortMode: FileTreeSortMode,
): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.fileTreeSortMode, sortMode);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { fileTreeSortMode: sortMode } });
}

export async function setFolioMode(enabled: boolean): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.folioMode, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { folioMode: enabled } });
}

export async function setClassicAllNotesByDefault(
	enabled: boolean,
): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.classicAllNotesByDefault, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { classicAllNotesByDefault: enabled } });
}

export async function setResumeLastSession(enabled: boolean): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.resumeLastSession, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { resumeLastSession: enabled } });
}

export async function setEditorShowCollapsibleHeadings(
	enabled: boolean,
): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.editorShowCollapsibleHeadings, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { showCollapsibleHeadings: enabled },
	});
}

export async function setEditorShowCollapsibleLists(
	enabled: boolean,
): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.editorShowCollapsibleLists, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { showCollapsibleLists: enabled },
	});
}

export async function setEditorColorfulHeadings(
	enabled: boolean,
): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.editorColorfulHeadings, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { colorfulHeadings: enabled },
	});
}

export async function setEditorShowHeadingPrefixes(
	enabled: boolean,
): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.editorShowHeadingPrefixes, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { showHeadingPrefixes: enabled },
	});
}

export async function setEditorHeadingPaletteId(
	headingPaletteId: HeadingPaletteId,
): Promise<void> {
	const store = await getSettingsStore();
	const next = asHeadingPaletteId(headingPaletteId);
	await store.set(KEYS.editorHeadingPaletteId, next);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { headingPaletteId: next },
	});
}

export async function setEditorBeautifulTags(enabled: boolean): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.editorBeautifulTags, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { beautifulTags: enabled },
	});
}

export async function setEditorShowFrontmatterInEditor(
	enabled: boolean,
): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.editorShowFrontmatterInEditor, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { showFrontmatterInEditor: enabled },
	});
}

export async function setEditorDefaultEditorMode(
	mode: EditorViewMode,
): Promise<void> {
	const store = await getSettingsStore();
	const next = asDefaultEditorMode(mode);
	await store.set(KEYS.editorDefaultEditorMode, next);
	await saveSettingsStore(store);
	setCachedDefaultEditorViewMode(next);
	void emitSettingsUpdated({
		editor: { defaultEditorMode: next },
	});
}

export async function setEditorWidthMode(mode: EditorWidthMode): Promise<void> {
	const store = await getSettingsStore();
	const next = asEditorWidthMode(mode);
	await store.set(KEYS.editorEditorWidthMode, next);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { editorWidthMode: next },
	});
}

export async function setEditorAttachmentStorageMode(
	mode: AttachmentStorageMode,
	scope?: SettingsScope,
): Promise<void> {
	const nextMode = asAttachmentStorageMode(mode);
	const spacePath = await updateActiveSpaceSettings(
		{
			attachmentStorageMode: nextMode,
		},
		scope,
	);
	if (spacePath) {
		void emitSettingsUpdated({
			spacePath,
			editor: { attachmentStorageMode: nextMode },
		});
		return;
	}
	const store = await getSettingsStore();
	await store.set(KEYS.editorAttachmentStorageMode, nextMode);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { attachmentStorageMode: nextMode },
	});
}

export async function setEditorAttachmentFolder(
	folder: string | null,
	scope?: SettingsScope,
): Promise<void> {
	const nextFolder =
		typeof folder === "string"
			? normalizeRelPath(folder) || DEFAULT_ATTACHMENT_FOLDER
			: DEFAULT_ATTACHMENT_FOLDER;
	const validationError = validateRelFolderPath(nextFolder);
	if (validationError) {
		throw new Error(validationError);
	}
	const spacePath = await updateActiveSpaceSettings(
		{
			attachmentFolder: nextFolder,
		},
		scope,
	);
	if (spacePath) {
		void emitSettingsUpdated({
			spacePath,
			editor: { attachmentFolder: nextFolder },
		});
		return;
	}
	const store = await getSettingsStore();
	await store.set(KEYS.editorAttachmentFolder, nextFolder);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { attachmentFolder: nextFolder },
	});
}

export async function setEditorEnablePeopleMentionsAsTags(
	enabled: boolean,
): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.editorEnablePeopleMentionsAsTags, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { enablePeopleMentionsAsTags: enabled },
	});
}

export async function setEditorRawMarkdownVimMode(
	enabled: boolean,
): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.editorRawMarkdownVimMode, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { rawMarkdownVimMode: enabled },
	});
}

export async function setEditorSpellCheck(enabled: boolean): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.editorSpellCheck, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { spellCheck: enabled },
	});
}

export async function setEditorShowExternalLinkPreviews(
	enabled: boolean,
): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.editorShowExternalLinkPreviews, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { showExternalLinkPreviews: enabled },
	});
}

export async function setEditorFocusMode(mode: FocusMode): Promise<void> {
	const store = await getSettingsStore();
	const next = asFocusMode(mode);
	await store.set(KEYS.editorFocusMode, next);
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		editor: { focusMode: next },
	});
}

export async function getDailyNotesFolder(
	scope?: SettingsScope,
): Promise<string | null> {
	return (await loadSettings(scope)).dailyNotes.folder;
}

export async function setDailyNotesFolder(
	folder: string | null,
	scope?: SettingsScope,
): Promise<void> {
	const nextFolder =
		typeof folder === "string" ? normalizeRelPath(folder) || null : null;
	const spacePath = await updateActiveSpaceSettings(
		{
			dailyNotesFolder: nextFolder,
		},
		scope,
	);
	if (spacePath) {
		void emitSettingsUpdated({ spacePath, dailyNotes: { folder: nextFolder } });
		return;
	}
	const store = await getSettingsStore();
	if (nextFolder === null) {
		await store.delete(KEYS.dailyNotesFolder);
	} else {
		await store.set(KEYS.dailyNotesFolder, nextFolder);
	}
	await saveSettingsStore(store);
	void emitSettingsUpdated({ dailyNotes: { folder: nextFolder } });
}

export async function setQuickNotesFolder(
	folder: string,
	scope?: SettingsScope,
): Promise<void> {
	const nextFolder = normalizeQuickNotesFolder(folder);
	const spacePath = await updateActiveSpaceSettings(
		{
			quickNotesFolder: nextFolder,
		},
		scope,
	);
	if (spacePath) {
		void emitSettingsUpdated({ spacePath, quickNotes: { folder: nextFolder } });
		return;
	}
	const store = await getSettingsStore();
	await store.set(KEYS.quickNotesFolder, nextFolder);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ quickNotes: { folder: nextFolder } });
}

export async function getTemplatesFolder(
	scope?: SettingsScope,
): Promise<string | null> {
	return (await loadSettings(scope)).templates.folder;
}

export async function setTemplatesFolder(
	folder: string | null,
	scope?: SettingsScope,
): Promise<void> {
	const nextFolder =
		typeof folder === "string" ? normalizeRelPath(folder) : null;
	const scopedPatch: SpaceScopedSettings = { templatesFolder: nextFolder };
	if (nextFolder === null) {
		scopedPatch.templatesDailyNoteTemplate = null;
	}
	const spacePath = await updateActiveSpaceSettings(scopedPatch, scope);
	if (spacePath) {
		void emitSettingsUpdated({
			spacePath,
			templates: {
				folder: nextFolder,
				dailyNoteTemplate: nextFolder === null ? null : undefined,
			},
		});
		return;
	}
	const store = await getSettingsStore();
	if (nextFolder === null) {
		await store.delete(KEYS.templatesFolder);
		await store.delete(KEYS.templatesDailyNoteTemplate);
	} else {
		await store.set(KEYS.templatesFolder, nextFolder);
	}
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		templates: {
			folder: nextFolder,
			dailyNoteTemplate: nextFolder === null ? null : undefined,
		},
	});
}

export async function getDailyNoteTemplate(
	scope?: SettingsScope,
): Promise<string | null> {
	return (await loadSettings(scope)).templates.dailyNoteTemplate;
}

export async function setDailyNoteTemplate(
	templatePath: string | null,
	scope?: SettingsScope,
): Promise<void> {
	const nextPath =
		typeof templatePath === "string"
			? normalizeRelPath(templatePath) || null
			: null;
	const spacePath = await updateActiveSpaceSettings(
		{
			templatesDailyNoteTemplate: nextPath,
		},
		scope,
	);
	if (spacePath) {
		void emitSettingsUpdated({
			spacePath,
			templates: { dailyNoteTemplate: nextPath },
		});
		return;
	}
	const store = await getSettingsStore();
	if (nextPath === null) {
		await store.delete(KEYS.templatesDailyNoteTemplate);
	} else {
		await store.set(KEYS.templatesDailyNoteTemplate, nextPath);
	}
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		templates: { dailyNoteTemplate: nextPath },
	});
}

export async function setDatabaseShowColumnColor(
	enabled: boolean,
): Promise<void> {
	const store = await getSettingsStore();
	await store.set(KEYS.databaseShowColumnColor, enabled);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ database: { showColumnColor: enabled } });
}

export async function setAutoUpdateLastCheckedAt(
	timestamp: number | null,
): Promise<void> {
	const store = await getSettingsStore();
	if (
		typeof timestamp !== "number" ||
		!Number.isFinite(timestamp) ||
		timestamp <= 0
	) {
		await store.delete(KEYS.autoUpdateLastCheckedAt);
	} else {
		await store.set(KEYS.autoUpdateLastCheckedAt, Math.floor(timestamp));
	}
	await saveSettingsStore(store);
}

export async function setReleaseChannel(
	channel: ReleaseChannel,
): Promise<void> {
	const nextChannel = asReleaseChannel(channel);
	const store = await getSettingsStore();
	await store.set(KEYS.releaseChannel, nextChannel);
	await saveSettingsStore(store);
	void emitSettingsUpdated({ ui: { releaseChannel: nextChannel } });
}

export async function getRecentFiles(): Promise<RecentFile[]> {
	const store = await getSettingsStore();
	const raw = await store.get<unknown>(KEYS.recentFiles);
	return isRecentFileArray(raw) ? raw : [];
}

export async function addRecentFile(
	path: string,
	spacePath: string,
): Promise<void> {
	const store = await getSettingsStore();
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
	await saveSettingsStore(store);
}
