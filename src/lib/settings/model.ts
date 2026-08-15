import type { AppLanguage } from "../../i18n/locales";
import type { CustomTheme } from "../customThemes";
import type { DateDisplayFormat } from "../dateDisplayFormat";
import type { EditorViewMode } from "../editorMode";
import type { HeadingPaletteId } from "../headingPalettes";
import type { Shortcut } from "../shortcuts";
import type { ShortcutActionId } from "../shortcuts/registry";
import type { AiAssistantMode } from "../tauri";
import type { UiDarkThemeId, UiLightThemeId } from "../uiThemes";

export type ReleaseChannel = "stable" | "alpha";
export type FileTreeSortMode =
	| "name-asc"
	| "name-desc"
	| "modified-desc"
	| "modified-asc"
	| "created-desc"
	| "created-asc";
export type ThemeMode = "system" | "light" | "dark";
export type AutoUpdateCheckInterval = "3h";
export type AttachmentStorageMode =
	| "space-root"
	| "specific-folder"
	| "note-folder"
	| "note-subfolder";
export type UiCornerRadiusStyle = "default" | "sharp" | "round";
export type UiFontFamily = string;
export type UiFontSize = number;
export type EditorWidthMode = "compact" | "comfortable" | "wide";
export type FocusMode = "off" | "paragraph" | "sentence";

export interface DatabaseSettings {
	showColumnColor: boolean;
}

export interface QuickNotesSettings {
	folder: string;
}

export interface EditorSettings {
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

export interface FileTreeSettings {
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

export interface RecentFile {
	path: string;
	spacePath: string;
	openedAt: number;
}

export interface AppSettings {
	currentSpacePath: string | null;
	recentSpaces: string[];
	recentFiles: RecentFile[];
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
		keepRunningOnLastWindowClose: boolean;
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
		weeklyNoteTemplate: string | null;
		monthlyNoteTemplate: string | null;
		quarterlyNoteTemplate: string | null;
	};
	shortcuts: ShortcutSettings;
	editor: EditorSettings;
	database: DatabaseSettings;
}

export interface SpaceScopedSettings {
	dailyNotesFolder?: string | null;
	quickNotesFolder?: string;
	templatesFolder?: string | null;
	templatesDailyNoteTemplate?: string | null;
	templatesWeeklyNoteTemplate?: string | null;
	templatesMonthlyNoteTemplate?: string | null;
	templatesQuarterlyNoteTemplate?: string | null;
	attachmentStorageMode?: AttachmentStorageMode;
	attachmentFolder?: string | null;
}

export type SpaceScopedSettingsMap = Record<string, SpaceScopedSettings>;

interface SettingsChangeSections {
	ui: AppSettings["ui"];
	dailyNotes: AppSettings["dailyNotes"];
	quickNotes: AppSettings["quickNotes"];
	templates: AppSettings["templates"];
	database: AppSettings["database"];
	editor: AppSettings["editor"];
	shortcuts: Pick<ShortcutSettings, "bindings">;
}

type SettingsChanges = {
	[Section in keyof SettingsChangeSections]?: Partial<
		SettingsChangeSections[Section]
	>;
};

export type SettingsUpdatedPayload = SettingsChanges & {
	spacePath?: string;
};
