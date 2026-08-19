import { emit, emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isAppLanguage, normalizeAppLanguage } from "../../i18n/locales";
import { normalizeRelPath, validateRelFolderPath } from "../../utils/path";
import { DEFAULT_ATTACHMENT_FOLDER } from "../attachmentStorage";
import {
	DEFAULT_CONNECTIONS_GRAPH_OPTIONS,
	normalizeConnectionsGraphOptions,
} from "../connectionsGraphOptions";
import { type CustomTheme, normalizeCustomThemes } from "../customThemes";
import {
	DEFAULT_DATE_DISPLAY_FORMAT,
	isDateDisplayFormat,
	normalizeDateDisplayFormat,
} from "../dateDisplayFormat";
import {
	DEFAULT_EDITOR_VIEW_MODE,
	isEditorViewMode,
	setCachedDefaultEditorViewMode,
} from "../editorMode";
import {
	DEFAULT_HEADING_PALETTE_ID,
	asHeadingPaletteId,
	isHeadingPaletteId,
} from "../headingPalettes";
import { getSettingsStore, saveSettingsStore } from "../settingsStore";
import {
	GLYPH_DEFAULT_DARK_THEME_ID,
	GLYPH_DEFAULT_LIGHT_THEME_ID,
	asUiDarkThemeId,
	asUiLightThemeId,
	isUiDarkThemeId,
	isUiLightThemeId,
} from "../uiThemes";
import type {
	AppSettings,
	AttachmentStorageMode,
	AutoUpdateCheckInterval,
	EditorWidthMode,
	FileTreeSortMode,
	FocusMode,
	ReleaseChannel,
	SettingsUpdatedPayload,
	SpaceScopedSettings,
	ThemeMode,
	UiCornerRadiusStyle,
	UiFontFamily,
	UiFontSize,
} from "./model";

export const MIN_UI_FONT_SIZE = 7;
export const MAX_UI_FONT_SIZE = 40;
export const MIN_EDITOR_FONT_SIZE = 10;
export const MAX_EDITOR_FONT_SIZE = 40;
export const DEFAULT_UI_TRANSLUCENT_APP = false;
export const DEFAULT_QUICK_NOTES_FOLDER = "Quick Notes";

const DEFAULT_UI_FONT_FAMILY = "Geist";
const DEFAULT_UI_MONO_FONT_FAMILY = "JetBrains Mono";
const DEFAULT_AUTO_UPDATE_CHECK_INTERVAL: AutoUpdateCheckInterval = "3h";
const DEFAULT_UI_FONT_SIZE = 14;
const DEFAULT_EDITOR_FONT_SIZE = 16;
const DEFAULT_FILE_TREE_SORT_MODE: FileTreeSortMode = "name-asc";
const DEFAULT_EDITOR_WIDTH_MODE: EditorWidthMode = "compact";
const DEFAULT_FOCUS_MODE: FocusMode = "off";
const DEFAULT_ATTACHMENT_STORAGE_MODE: AttachmentStorageMode = "note-folder";

export const DEFAULT_UI_CORNER_RADIUS_STYLE: UiCornerRadiusStyle = "default";

type SettingDiscovery =
	| { readonly kind: "search"; readonly id: string }
	| { readonly kind: "hidden"; readonly reason: string };

interface NativeConsumption {
	readonly kind: "settings-store";
	readonly consumer: "last-window-close-policy";
}

export type SettingParseResult<Value> =
	| { readonly ok: true; readonly value: Value }
	| { readonly ok: false };

export interface ApplicationSettingDefinition<Value> {
	readonly key: string;
	readonly defaultValue: Value;
	readonly discovery: SettingDiscovery;
	readonly nativeConsumption?: NativeConsumption;
	readonly normalize: (value: unknown) => Value;
	readonly parse: (value: unknown) => SettingParseResult<Value>;
	readonly load: (entries: ReadonlyMap<string, unknown>) => Value;
	readonly read: (settings: AppSettings) => Value;
	readonly write: (value: Value) => Promise<void>;
}

interface ApplicationSettingConfig<Value> {
	readonly key: string;
	readonly defaultValue: Value;
	readonly discovery: SettingDiscovery;
	readonly nativeConsumption?: NativeConsumption;
	readonly normalize: (value: unknown) => Value;
	readonly parse: (value: unknown) => SettingParseResult<Value>;
	readonly read: (settings: AppSettings) => Value;
	readonly change: (value: Value) => SettingsUpdatedPayload;
	readonly afterSave?: (value: Value) => void;
}

export interface SpaceSettingDefinition<Value> {
	readonly legacyKey: string;
	readonly field: keyof SpaceScopedSettings;
	readonly defaultValue: Value;
	readonly discovery: SettingDiscovery;
	readonly normalize: (value: unknown) => Value;
	readonly parse: (value: unknown) => SettingParseResult<Value>;
	readonly read: (settings: AppSettings) => Value;
	readonly patch: (value: Value) => SpaceScopedSettings;
	readonly change: (value: Value) => SettingsUpdatedPayload;
	readonly validate?: (value: Value) => string | null;
}

const INVALID_PARSE_RESULT: SettingParseResult<never> = { ok: false };

function searchable(id: string): SettingDiscovery {
	return { kind: "search", id };
}

function hidden(reason: string): SettingDiscovery {
	return { kind: "hidden", reason };
}

function parsed<Value>(value: Value): SettingParseResult<Value> {
	return { ok: true, value };
}

export async function emitSettingsUpdated(
	payload: SettingsUpdatedPayload,
): Promise<void> {
	try {
		if (payload.spacePath) {
			await emitTo(getCurrentWindow().label, "settings:updated", payload);
			return;
		}
		await emit("settings:updated", payload);
	} catch {
		// Cross-window synchronization is best effort during window teardown.
	}
}

function defineApplicationSetting<Value>(
	config: ApplicationSettingConfig<Value>,
): ApplicationSettingDefinition<Value> {
	const write = async (value: Value): Promise<void> => {
		const normalized = config.normalize(value);
		const store = await getSettingsStore();
		await store.set(config.key, normalized);
		await saveSettingsStore(store);
		config.afterSave?.(normalized);
		void emitSettingsUpdated(config.change(normalized));
	};

	return {
		key: config.key,
		defaultValue: config.defaultValue,
		discovery: config.discovery,
		nativeConsumption: config.nativeConsumption,
		normalize: config.normalize,
		parse: config.parse,
		load: (entries) => config.normalize(entries.get(config.key)),
		read: config.read,
		write,
	};
}

function defineSpaceSetting<Value>(
	config: SpaceSettingDefinition<Value>,
): SpaceSettingDefinition<Value> {
	return config;
}

function booleanSpaceSetting(
	config: Omit<SpaceSettingDefinition<boolean>, "normalize" | "parse">,
): SpaceSettingDefinition<boolean> {
	return defineSpaceSetting({
		...config,
		normalize: (value) =>
			typeof value === "boolean" ? value : config.defaultValue,
		parse: (value) =>
			typeof value === "boolean" ? parsed(value) : INVALID_PARSE_RESULT,
	});
}

function booleanSetting(
	config: Omit<ApplicationSettingConfig<boolean>, "normalize" | "parse">,
): ApplicationSettingDefinition<boolean> {
	return defineApplicationSetting({
		...config,
		normalize: (value) =>
			typeof value === "boolean" ? value : config.defaultValue,
		parse: (value) =>
			typeof value === "boolean" ? parsed(value) : INVALID_PARSE_RESULT,
	});
}

function nullablePath(value: unknown): string | null {
	return typeof value === "string" ? normalizeRelPath(value) || null : null;
}

function isThemeMode(value: unknown): value is ThemeMode {
	return value === "system" || value === "light" || value === "dark";
}

export function isFileTreeSortMode(value: unknown): value is FileTreeSortMode {
	return (
		value === "name-asc" ||
		value === "name-desc" ||
		value === "modified-desc" ||
		value === "modified-asc" ||
		value === "created-desc" ||
		value === "created-asc"
	);
}

function isAiAssistantMode(value: unknown): value is "chat" | "create" {
	return value === "chat" || value === "create";
}

export function isAttachmentStorageMode(
	value: unknown,
): value is AttachmentStorageMode {
	return (
		value === "space-root" ||
		value === "specific-folder" ||
		value === "note-folder" ||
		value === "note-subfolder"
	);
}

export function isEditorWidthMode(value: unknown): value is EditorWidthMode {
	return value === "compact" || value === "comfortable" || value === "wide";
}

export function isFocusMode(value: unknown): value is FocusMode {
	return value === "off" || value === "paragraph" || value === "sentence";
}

export function isUiCornerRadiusStyle(
	value: unknown,
): value is UiCornerRadiusStyle {
	return value === "default" || value === "sharp" || value === "round";
}

function normalizeUiFontFamily(
	value: unknown,
	fallback: UiFontFamily = DEFAULT_UI_FONT_FAMILY,
): UiFontFamily {
	if (typeof value !== "string") return fallback;
	const trimmed = value.trim();
	return trimmed ? trimmed.slice(0, 80) : fallback;
}

function normalizeUiMonoFontFamily(value: unknown): UiFontFamily {
	return normalizeUiFontFamily(value, DEFAULT_UI_MONO_FONT_FAMILY);
}

function normalizeUiFontSize(value: unknown): UiFontSize {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.max(
			MIN_UI_FONT_SIZE,
			Math.min(MAX_UI_FONT_SIZE, Math.round(value)),
		);
	}
	if (value === "small") return 12;
	if (value === "large") return 16;
	return DEFAULT_UI_FONT_SIZE;
}

function normalizeEditorFontSize(value: unknown): UiFontSize {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.max(
			MIN_EDITOR_FONT_SIZE,
			Math.min(MAX_EDITOR_FONT_SIZE, Math.round(value)),
		);
	}
	return DEFAULT_EDITOR_FONT_SIZE;
}

function parseFiniteNumber(value: unknown): SettingParseResult<number> {
	return typeof value === "number" && Number.isFinite(value)
		? parsed(value)
		: INVALID_PARSE_RESULT;
}

function parseString(value: unknown): SettingParseResult<string> {
	return typeof value === "string" ? parsed(value) : INVALID_PARSE_RESULT;
}

function normalizeAutoUpdateCheckInterval(
	value: unknown,
): AutoUpdateCheckInterval {
	return value === "3h" || value === "launch" || value === "12h"
		? "3h"
		: DEFAULT_AUTO_UPDATE_CHECK_INTERVAL;
}

function normalizeAttachmentFolder(value: unknown): string | null {
	return typeof value === "string"
		? normalizeRelPath(value) || DEFAULT_ATTACHMENT_FOLDER
		: DEFAULT_ATTACHMENT_FOLDER;
}

/**
 * Coordinated settings intentionally outside the one-value definition path.
 * They require write locks, ordered collections, timestamps, or multi-field
 * updates rather than an independent load/write lifecycle.
 */
export const INTERNAL_SETTING_KEYS = {
	currentSpacePath: "space.currentPath",
	recentSpaces: "space.recent",
	recentFiles: "files.recent",
	autoUpdateLastCheckedAt: "updates.lastCheckedAt",
	shortcutsVersion: "shortcuts.version",
	shortcutsBindings: "shortcuts.bindings",
	spaceScopedSettings: "space.scopedSettings",
	templatesFolder: "templates.folder",
} as const;

export const DURABLE_SETTINGS = {
	aiEnabled: booleanSetting({
		key: "ui.aiEnabled",
		defaultValue: true,
		discovery: searchable("ai-features"),
		read: (settings) => settings.ui.aiEnabled,
		change: (value) => ({ ui: { aiEnabled: value } }),
	}),
	language: defineApplicationSetting({
		key: "ui.language",
		defaultValue: normalizeAppLanguage(undefined),
		discovery: searchable("general-language"),
		normalize: normalizeAppLanguage,
		parse: (value) =>
			isAppLanguage(value) ? parsed(value) : INVALID_PARSE_RESULT,
		read: (settings) => settings.ui.language,
		change: (value) => ({ ui: { language: value } }),
	}),
	dateDisplayFormat: defineApplicationSetting({
		key: "ui.dateDisplayFormat",
		defaultValue: DEFAULT_DATE_DISPLAY_FORMAT,
		discovery: searchable("general-date-format"),
		normalize: normalizeDateDisplayFormat,
		parse: (value) =>
			isDateDisplayFormat(value) ? parsed(value) : INVALID_PARSE_RESULT,
		read: (settings) => settings.ui.dateDisplayFormat,
		change: (value) => ({ ui: { dateDisplayFormat: value } }),
	}),
	aiAssistantMode: defineApplicationSetting<
		AppSettings["ui"]["aiAssistantMode"]
	>({
		key: "ui.aiAssistantMode",
		defaultValue: "create",
		discovery: searchable("ai-assistant-behavior-tools"),
		normalize: (value) => (isAiAssistantMode(value) ? value : "create"),
		parse: (value) =>
			isAiAssistantMode(value) ? parsed(value) : INVALID_PARSE_RESULT,
		read: (settings) => settings.ui.aiAssistantMode,
		change: (value) => ({ ui: { aiAssistantMode: value } }),
	}),
	theme: defineApplicationSetting<ThemeMode>({
		key: "ui.theme",
		defaultValue: "system",
		discovery: searchable("appearance-theme-mode"),
		normalize: (value) => (isThemeMode(value) ? value : "system"),
		parse: (value) =>
			isThemeMode(value) ? parsed(value) : INVALID_PARSE_RESULT,
		read: (settings) => settings.ui.theme,
		change: (value) => ({ ui: { theme: value } }),
	}),
	autoUpdateCheckInterval: defineApplicationSetting({
		key: "ui.autoUpdateCheckInterval",
		defaultValue: DEFAULT_AUTO_UPDATE_CHECK_INTERVAL,
		discovery: hidden("The interval is fixed and has no editable control."),
		normalize: normalizeAutoUpdateCheckInterval,
		parse: (value) => (value === "3h" ? parsed(value) : INVALID_PARSE_RESULT),
		read: (settings) => settings.ui.autoUpdateCheckInterval,
		change: (value) => ({ ui: { autoUpdateCheckInterval: value } }),
	}),
	releaseChannel: defineApplicationSetting<ReleaseChannel>({
		key: "updates.releaseChannel",
		defaultValue: "stable",
		discovery: searchable("about-alpha-releases"),
		normalize: (value) => (value === "alpha" ? "alpha" : "stable"),
		parse: (value) =>
			value === "alpha" || value === "stable"
				? parsed(value)
				: INVALID_PARSE_RESULT,
		read: (settings) => settings.ui.releaseChannel,
		change: (value) => ({ ui: { releaseChannel: value } }),
	}),
	customThemes: defineApplicationSetting<CustomTheme[]>({
		key: "ui.customThemes",
		defaultValue: [],
		discovery: searchable("appearance-custom-themes"),
		normalize: normalizeCustomThemes,
		parse: (value) =>
			Array.isArray(value)
				? parsed(normalizeCustomThemes(value))
				: INVALID_PARSE_RESULT,
		read: (settings) => settings.ui.customThemes,
		change: (value) => ({ ui: { customThemes: value } }),
	}),
	lightThemeId: defineApplicationSetting({
		key: "ui.lightThemeId",
		defaultValue: GLYPH_DEFAULT_LIGHT_THEME_ID,
		discovery: searchable("appearance-light-theme"),
		normalize: asUiLightThemeId,
		parse: (value) =>
			isUiLightThemeId(value) ? parsed(value) : INVALID_PARSE_RESULT,
		read: (settings) => settings.ui.lightThemeId,
		change: (value) => ({ ui: { lightThemeId: value } }),
	}),
	darkThemeId: defineApplicationSetting({
		key: "ui.darkThemeId",
		defaultValue: GLYPH_DEFAULT_DARK_THEME_ID,
		discovery: searchable("appearance-dark-theme"),
		normalize: asUiDarkThemeId,
		parse: (value) =>
			isUiDarkThemeId(value) ? parsed(value) : INVALID_PARSE_RESULT,
		read: (settings) => settings.ui.darkThemeId,
		change: (value) => ({ ui: { darkThemeId: value } }),
	}),
	fontFamily: defineApplicationSetting({
		key: "ui.fontFamily",
		defaultValue: DEFAULT_UI_FONT_FAMILY,
		discovery: searchable("appearance-interface-font"),
		normalize: normalizeUiFontFamily,
		parse: parseString,
		read: (settings) => settings.ui.fontFamily,
		change: (value) => ({ ui: { fontFamily: value } }),
	}),
	editorFontFamily: defineApplicationSetting({
		key: "ui.editorFontFamily",
		defaultValue: DEFAULT_UI_FONT_FAMILY,
		discovery: searchable("appearance-editor-font"),
		normalize: (value) => normalizeUiFontFamily(value, DEFAULT_UI_FONT_FAMILY),
		parse: parseString,
		read: (settings) => settings.ui.editorFontFamily,
		change: (value) => ({ ui: { editorFontFamily: value } }),
	}),
	monoFontFamily: defineApplicationSetting({
		key: "ui.monoFontFamily",
		defaultValue: DEFAULT_UI_MONO_FONT_FAMILY,
		discovery: searchable("appearance-monospace-font"),
		normalize: normalizeUiMonoFontFamily,
		parse: parseString,
		read: (settings) => settings.ui.monoFontFamily,
		change: (value) => ({ ui: { monoFontFamily: value } }),
	}),
	fontSize: defineApplicationSetting({
		key: "ui.fontSize",
		defaultValue: DEFAULT_UI_FONT_SIZE,
		discovery: searchable("appearance-ui-font-size"),
		normalize: normalizeUiFontSize,
		parse: parseFiniteNumber,
		read: (settings) => settings.ui.fontSize,
		change: (value) => ({ ui: { fontSize: value } }),
	}),
	editorFontSize: defineApplicationSetting({
		key: "ui.editorFontSize",
		defaultValue: DEFAULT_EDITOR_FONT_SIZE,
		discovery: searchable("appearance-editor-font-size"),
		normalize: normalizeEditorFontSize,
		parse: parseFiniteNumber,
		read: (settings) => settings.ui.editorFontSize,
		change: (value) => ({ ui: { editorFontSize: value } }),
	}),
	translucentApp: booleanSetting({
		key: "ui.translucentApp",
		defaultValue: DEFAULT_UI_TRANSLUCENT_APP,
		discovery: searchable("appearance-translucent-app"),
		read: (settings) => settings.ui.translucentApp,
		change: (value) => ({ ui: { translucentApp: value } }),
	}),
	cornerRadiusStyle: defineApplicationSetting({
		key: "ui.cornerRadiusStyle",
		defaultValue: DEFAULT_UI_CORNER_RADIUS_STYLE,
		discovery: hidden("The current search catalog has no corner-radius row."),
		normalize: (value) =>
			isUiCornerRadiusStyle(value) ? value : DEFAULT_UI_CORNER_RADIUS_STYLE,
		parse: (value) =>
			isUiCornerRadiusStyle(value) ? parsed(value) : INVALID_PARSE_RESULT,
		read: (settings) => settings.ui.cornerRadiusStyle,
		change: (value) => ({ ui: { cornerRadiusStyle: value } }),
	}),
	showToc: booleanSetting({
		key: "ui.showToc",
		defaultValue: true,
		discovery: searchable("general-editor-table-of-contents"),
		read: (settings) => settings.ui.showToc,
		change: (value) => ({ ui: { showToc: value } }),
	}),
	showFileTreeFolderCounts: booleanSetting({
		key: "ui.fileTree.showFolderFileCounts",
		defaultValue: false,
		discovery: searchable("general-file-tree-folder-counts"),
		read: (settings) => settings.ui.showFileTreeFolderCounts,
		change: (value) => ({ ui: { showFileTreeFolderCounts: value } }),
	}),
	showNonMarkdownFiles: booleanSetting({
		key: "ui.fileTree.showNonMarkdownFiles",
		defaultValue: true,
		discovery: searchable("general-file-tree-non-markdown-files"),
		read: (settings) => settings.ui.showNonMarkdownFiles,
		change: (value) => ({ ui: { showNonMarkdownFiles: value } }),
	}),
	fileTreeSortMode: defineApplicationSetting({
		key: "ui.fileTree.sortMode",
		defaultValue: DEFAULT_FILE_TREE_SORT_MODE,
		discovery: searchable("general-file-tree-sort"),
		normalize: (value) =>
			isFileTreeSortMode(value) ? value : DEFAULT_FILE_TREE_SORT_MODE,
		parse: (value) =>
			isFileTreeSortMode(value) ? parsed(value) : INVALID_PARSE_RESULT,
		read: (settings) => settings.ui.fileTreeSortMode,
		change: (value) => ({ ui: { fileTreeSortMode: value } }),
	}),
	folioMode: booleanSetting({
		key: "ui.folioMode",
		defaultValue: false,
		discovery: searchable("appearance-layout-folio-mode"),
		read: (settings) => settings.ui.folioMode,
		change: (value) => ({ ui: { folioMode: value } }),
	}),
	noteSidePeek: booleanSetting({
		key: "ui.noteSidePeek",
		defaultValue: false,
		discovery: searchable("appearance-layout-note-side-peek"),
		read: (settings) => settings.ui.noteSidePeek,
		change: (value) => ({ ui: { noteSidePeek: value } }),
	}),
	resumeLastSession: booleanSetting({
		key: "ui.resumeLastSession",
		defaultValue: false,
		discovery: searchable("general-resume-last-session"),
		read: (settings) => settings.ui.resumeLastSession,
		change: (value) => ({ ui: { resumeLastSession: value } }),
	}),
	keepRunningOnLastWindowClose: booleanSetting({
		key: "ui.keepRunningOnLastWindowClose",
		defaultValue: false,
		discovery: searchable("general-keep-running-on-close"),
		nativeConsumption: {
			kind: "settings-store",
			consumer: "last-window-close-policy",
		},
		read: (settings) => settings.ui.keepRunningOnLastWindowClose,
		change: (value) => ({ ui: { keepRunningOnLastWindowClose: value } }),
	}),
	editorShowCollapsibleHeadings: booleanSetting({
		key: "editor.showCollapsibleHeadings",
		defaultValue: false,
		discovery: searchable("general-editor-collapsible-headings"),
		read: (settings) => settings.editor.showCollapsibleHeadings,
		change: (value) => ({ editor: { showCollapsibleHeadings: value } }),
	}),
	editorShowCollapsibleLists: booleanSetting({
		key: "editor.showCollapsibleLists",
		defaultValue: false,
		discovery: searchable("general-editor-collapsible-lists"),
		read: (settings) => settings.editor.showCollapsibleLists,
		change: (value) => ({ editor: { showCollapsibleLists: value } }),
	}),
	editorShowFrontmatterInEditor: booleanSetting({
		key: "editor.showFrontmatterInEditor",
		defaultValue: false,
		discovery: searchable("general-editor-frontmatter"),
		read: (settings) => settings.editor.showFrontmatterInEditor,
		change: (value) => ({ editor: { showFrontmatterInEditor: value } }),
	}),
	editorShowHeadingPrefixes: booleanSetting({
		key: "editor.showHeadingPrefixes",
		defaultValue: true,
		discovery: searchable("general-editor-heading-prefixes"),
		read: (settings) => settings.editor.showHeadingPrefixes,
		change: (value) => ({ editor: { showHeadingPrefixes: value } }),
	}),
	editorColorfulHeadings: booleanSetting({
		key: "editor.colorfulHeadings",
		defaultValue: false,
		discovery: searchable("general-editor-colorful-headings"),
		read: (settings) => settings.editor.colorfulHeadings,
		change: (value) => ({ editor: { colorfulHeadings: value } }),
	}),
	editorHeadingPaletteId: defineApplicationSetting({
		key: "editor.headingPaletteId",
		defaultValue: DEFAULT_HEADING_PALETTE_ID,
		discovery: hidden("The heading palette is grouped with colorful headings."),
		normalize: asHeadingPaletteId,
		parse: (value) =>
			isHeadingPaletteId(value) ? parsed(value) : INVALID_PARSE_RESULT,
		read: (settings) => settings.editor.headingPaletteId,
		change: (value) => ({ editor: { headingPaletteId: value } }),
	}),
	editorBeautifulTags: booleanSetting({
		key: "editor.beautifulTags",
		defaultValue: false,
		discovery: searchable("appearance-editor-presentation-beautiful-tags"),
		read: (settings) => settings.editor.beautifulTags,
		change: (value) => ({ editor: { beautifulTags: value } }),
	}),
	editorWidthMode: defineApplicationSetting({
		key: "editor.editorWidthMode",
		defaultValue: DEFAULT_EDITOR_WIDTH_MODE,
		discovery: searchable("appearance-editor-presentation-width"),
		normalize: (value) =>
			isEditorWidthMode(value) ? value : DEFAULT_EDITOR_WIDTH_MODE,
		parse: (value) =>
			isEditorWidthMode(value) ? parsed(value) : INVALID_PARSE_RESULT,
		read: (settings) => settings.editor.editorWidthMode,
		change: (value) => ({ editor: { editorWidthMode: value } }),
	}),
	editorDefaultEditorMode: defineApplicationSetting({
		key: "editor.defaultEditorMode",
		defaultValue: DEFAULT_EDITOR_VIEW_MODE,
		discovery: hidden("The default editor mode is not exposed in search."),
		normalize: (value) =>
			isEditorViewMode(value) ? value : DEFAULT_EDITOR_VIEW_MODE,
		parse: (value) =>
			isEditorViewMode(value) ? parsed(value) : INVALID_PARSE_RESULT,
		read: (settings) => settings.editor.defaultEditorMode,
		change: (value) => ({ editor: { defaultEditorMode: value } }),
		afterSave: setCachedDefaultEditorViewMode,
	}),
	editorEnablePeopleMentionsAsTags: booleanSetting({
		key: "editor.enablePeopleMentionsAsTags",
		defaultValue: false,
		discovery: searchable("space-search-index-people-tags"),
		read: (settings) => settings.editor.enablePeopleMentionsAsTags,
		change: (value) => ({ editor: { enablePeopleMentionsAsTags: value } }),
	}),
	editorRawMarkdownVimMode: booleanSetting({
		key: "editor.rawMarkdownVimMode",
		defaultValue: false,
		discovery: searchable("general-editor-vim-mode"),
		read: (settings) => settings.editor.rawMarkdownVimMode,
		change: (value) => ({ editor: { rawMarkdownVimMode: value } }),
	}),
	editorSpellCheck: booleanSetting({
		key: "editor.spellCheck",
		defaultValue: true,
		discovery: searchable("general-editor-spell-check"),
		read: (settings) => settings.editor.spellCheck,
		change: (value) => ({ editor: { spellCheck: value } }),
	}),
	editorShowExternalLinkPreviews: booleanSetting({
		key: "editor.showExternalLinkPreviews",
		defaultValue: false,
		discovery: searchable("general-editor-external-link-previews"),
		read: (settings) => settings.editor.showExternalLinkPreviews,
		change: (value) => ({ editor: { showExternalLinkPreviews: value } }),
	}),
	editorFocusMode: defineApplicationSetting({
		key: "editor.focusMode",
		defaultValue: DEFAULT_FOCUS_MODE,
		discovery: hidden("Focus mode is controlled from the editor."),
		normalize: (value) => (isFocusMode(value) ? value : DEFAULT_FOCUS_MODE),
		parse: (value) =>
			isFocusMode(value) ? parsed(value) : INVALID_PARSE_RESULT,
		read: (settings) => settings.editor.focusMode,
		change: (value) => ({ editor: { focusMode: value } }),
	}),
	databaseShowColumnColor: booleanSetting({
		key: "database.showColumnColor",
		defaultValue: true,
		discovery: searchable("appearance-database-column-color"),
		read: (settings) => settings.database.showColumnColor,
		change: (value) => ({ database: { showColumnColor: value } }),
	}),
} as const;

export const SPACE_SETTINGS = {
	dailyNotesFolder: defineSpaceSetting({
		legacyKey: "dailyNotes.folder",
		field: "dailyNotesFolder",
		defaultValue: null,
		discovery: searchable("space-daily-notes-folder"),
		normalize: nullablePath,
		parse: (value) =>
			typeof value === "string" || value === null
				? parsed(value)
				: INVALID_PARSE_RESULT,
		read: (settings) => settings.dailyNotes.folder,
		patch: (value) => ({ dailyNotesFolder: value }),
		change: (value) => ({ dailyNotes: { folder: value } }),
	}),
	dailyNotesWeeklyNotes: booleanSpaceSetting({
		legacyKey: "dailyNotes.weeklyNotes",
		field: "dailyNotesWeeklyNotes",
		defaultValue: false,
		discovery: searchable("space-weekly-notes"),
		read: (settings) => settings.dailyNotes.weeklyNotes,
		patch: (value) => ({ dailyNotesWeeklyNotes: value }),
		change: (value) => ({ dailyNotes: { weeklyNotes: value } }),
	}),
	dailyNotesMonthlyNotes: booleanSpaceSetting({
		legacyKey: "dailyNotes.monthlyNotes",
		field: "dailyNotesMonthlyNotes",
		defaultValue: false,
		discovery: searchable("space-monthly-notes"),
		read: (settings) => settings.dailyNotes.monthlyNotes,
		patch: (value) => ({ dailyNotesMonthlyNotes: value }),
		change: (value) => ({ dailyNotes: { monthlyNotes: value } }),
	}),
	dailyNotesQuarterlyNotes: booleanSpaceSetting({
		legacyKey: "dailyNotes.quarterlyNotes",
		field: "dailyNotesQuarterlyNotes",
		defaultValue: false,
		discovery: searchable("space-quarterly-notes"),
		read: (settings) => settings.dailyNotes.quarterlyNotes,
		patch: (value) => ({ dailyNotesQuarterlyNotes: value }),
		change: (value) => ({ dailyNotes: { quarterlyNotes: value } }),
	}),
	quickNotesFolder: defineSpaceSetting({
		legacyKey: "quickNotes.folder",
		field: "quickNotesFolder",
		defaultValue: DEFAULT_QUICK_NOTES_FOLDER,
		discovery: searchable("space-quick-notes-folder"),
		normalize: (value) =>
			typeof value === "string"
				? normalizeRelPath(value) || DEFAULT_QUICK_NOTES_FOLDER
				: DEFAULT_QUICK_NOTES_FOLDER,
		parse: (value) =>
			value === null ? parsed(DEFAULT_QUICK_NOTES_FOLDER) : parseString(value),
		read: (settings) => settings.quickNotes.folder,
		patch: (value) => ({ quickNotesFolder: value }),
		change: (value) => ({ quickNotes: { folder: value } }),
	}),
	noteCreationDefaultFolder: defineSpaceSetting({
		legacyKey: "noteCreation.defaultFolder",
		field: "noteCreationDefaultFolder",
		defaultValue: null,
		discovery: searchable("space-default-new-note-folder"),
		normalize: nullablePath,
		parse: (value) =>
			typeof value === "string" || value === null
				? parsed(value)
				: INVALID_PARSE_RESULT,
		read: (settings) => settings.noteCreation.defaultFolder,
		patch: (value) => ({ noteCreationDefaultFolder: value }),
		change: (value) => ({ noteCreation: { defaultFolder: value } }),
		validate: (value) => (value === null ? null : validateRelFolderPath(value)),
	}),
	templatesDailyNoteTemplate: defineSpaceSetting({
		legacyKey: "templates.dailyNoteTemplate",
		field: "templatesDailyNoteTemplate",
		defaultValue: null,
		discovery: searchable("space-default-daily-template"),
		normalize: nullablePath,
		parse: (value) =>
			typeof value === "string" || value === null
				? parsed(value)
				: INVALID_PARSE_RESULT,
		read: (settings) => settings.templates.dailyNoteTemplate,
		patch: (value) => ({ templatesDailyNoteTemplate: value }),
		change: (value) => ({ templates: { dailyNoteTemplate: value } }),
	}),
	templatesWeeklyNoteTemplate: defineSpaceSetting({
		legacyKey: "templates.weeklyNoteTemplate",
		field: "templatesWeeklyNoteTemplate",
		defaultValue: null,
		discovery: searchable("space-default-weekly-template"),
		normalize: nullablePath,
		parse: (value) =>
			typeof value === "string" || value === null
				? parsed(value)
				: INVALID_PARSE_RESULT,
		read: (settings) => settings.templates.weeklyNoteTemplate,
		patch: (value) => ({ templatesWeeklyNoteTemplate: value }),
		change: (value) => ({ templates: { weeklyNoteTemplate: value } }),
	}),
	templatesMonthlyNoteTemplate: defineSpaceSetting({
		legacyKey: "templates.monthlyNoteTemplate",
		field: "templatesMonthlyNoteTemplate",
		defaultValue: null,
		discovery: searchable("space-default-monthly-template"),
		normalize: nullablePath,
		parse: (value) =>
			typeof value === "string" || value === null
				? parsed(value)
				: INVALID_PARSE_RESULT,
		read: (settings) => settings.templates.monthlyNoteTemplate,
		patch: (value) => ({ templatesMonthlyNoteTemplate: value }),
		change: (value) => ({ templates: { monthlyNoteTemplate: value } }),
	}),
	templatesQuarterlyNoteTemplate: defineSpaceSetting({
		legacyKey: "templates.quarterlyNoteTemplate",
		field: "templatesQuarterlyNoteTemplate",
		defaultValue: null,
		discovery: searchable("space-default-quarterly-template"),
		normalize: nullablePath,
		parse: (value) =>
			typeof value === "string" || value === null
				? parsed(value)
				: INVALID_PARSE_RESULT,
		read: (settings) => settings.templates.quarterlyNoteTemplate,
		patch: (value) => ({ templatesQuarterlyNoteTemplate: value }),
		change: (value) => ({ templates: { quarterlyNoteTemplate: value } }),
	}),
	attachmentStorageMode: defineSpaceSetting({
		legacyKey: "editor.attachmentStorageMode",
		field: "attachmentStorageMode",
		defaultValue: DEFAULT_ATTACHMENT_STORAGE_MODE,
		discovery: searchable("space-attachments-location"),
		normalize: (value) =>
			isAttachmentStorageMode(value) ? value : DEFAULT_ATTACHMENT_STORAGE_MODE,
		parse: (value) =>
			isAttachmentStorageMode(value) ? parsed(value) : INVALID_PARSE_RESULT,
		read: (settings) => settings.editor.attachmentStorageMode,
		patch: (value) => ({ attachmentStorageMode: value }),
		change: (value) => ({ editor: { attachmentStorageMode: value } }),
	}),
	attachmentFolder: defineSpaceSetting({
		legacyKey: "editor.attachmentFolder",
		field: "attachmentFolder",
		defaultValue: DEFAULT_ATTACHMENT_FOLDER,
		discovery: hidden("The folder is part of the attachment location control."),
		normalize: normalizeAttachmentFolder,
		parse: (value) =>
			typeof value === "string" || value === null
				? parsed(value)
				: INVALID_PARSE_RESULT,
		read: (settings) => settings.editor.attachmentFolder,
		patch: (value) => ({ attachmentFolder: value }),
		change: (value) => ({ editor: { attachmentFolder: value } }),
		validate: (value) => validateRelFolderPath(value ?? ""),
	}),
	connectionsGraph: defineSpaceSetting({
		legacyKey: "connections.graph",
		field: "connectionsGraph",
		defaultValue: DEFAULT_CONNECTIONS_GRAPH_OPTIONS,
		discovery: searchable("space-connections-graph"),
		normalize: normalizeConnectionsGraphOptions,
		parse: (value) =>
			value === null || typeof value === "object"
				? parsed(normalizeConnectionsGraphOptions(value))
				: INVALID_PARSE_RESULT,
		read: (settings) => settings.connectionsGraph,
		patch: (value) => ({ connectionsGraph: value }),
		change: (value) => ({ connectionsGraph: value }),
	}),
} as const;

export const SEARCHABLE_SETTING_IDS = [
	...Object.values(DURABLE_SETTINGS),
	...Object.values(SPACE_SETTINGS),
].flatMap((definition) =>
	definition.discovery.kind === "search" ? [definition.discovery.id] : [],
);
