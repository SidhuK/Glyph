import type { AppLanguage } from "../../i18n/locales";
import type { ConnectionsGraphOptions } from "../connectionsGraphOptions";
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

const SIDEBAR_VISIBILITY_KEYS = [
	"newNote",
	"pinned",
	"allNotes",
	"databases",
	"connections",
	"calendar",
	"search",
	"periodNotes",
	"quickNote",
	"templates",
	"gitSync",
] as const;

export type SidebarVisibilityKey = (typeof SIDEBAR_VISIBILITY_KEYS)[number];

export type SidebarVisibility = {
	[Key in SidebarVisibilityKey]: boolean;
};

export type SidebarOrder = readonly SidebarVisibilityKey[];

export const DEFAULT_SIDEBAR_ORDER: SidebarOrder = [
	"newNote",
	"pinned",
	"allNotes",
	"databases",
	"connections",
	"calendar",
	"search",
	"quickNote",
	"templates",
	"gitSync",
	"periodNotes",
];

export const DEFAULT_SIDEBAR_VISIBILITY = {
	newNote: true,
	pinned: true,
	allNotes: true,
	databases: true,
	connections: true,
	calendar: false,
	search: false,
	periodNotes: false,
	quickNote: false,
	templates: false,
	gitSync: false,
} satisfies SidebarVisibility;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeSidebarVisibility(value: unknown): SidebarVisibility {
	const record = isRecord(value) ? value : {};
	const read = (key: SidebarVisibilityKey): boolean => {
		const current = record[key];
		return typeof current === "boolean"
			? current
			: DEFAULT_SIDEBAR_VISIBILITY[key];
	};
	return {
		newNote: read("newNote"),
		pinned: read("pinned"),
		allNotes: read("allNotes"),
		databases: read("databases"),
		connections: read("connections"),
		calendar: read("calendar"),
		search: read("search"),
		periodNotes: read("periodNotes"),
		quickNote: read("quickNote"),
		templates: read("templates"),
		gitSync: read("gitSync"),
	};
}

const SIDEBAR_VISIBILITY_KEY_SET = new Set<string>(SIDEBAR_VISIBILITY_KEYS);

function isSidebarVisibilityKey(value: unknown): value is SidebarVisibilityKey {
	return typeof value === "string" && SIDEBAR_VISIBILITY_KEY_SET.has(value);
}

export function normalizeSidebarOrder(value: unknown): SidebarOrder {
	const seen = new Set<SidebarVisibilityKey>();
	const order: SidebarVisibilityKey[] = [];
	const input = Array.isArray(value) ? value : [];
	for (const key of input) {
		if (!isSidebarVisibilityKey(key) || seen.has(key)) continue;
		seen.add(key);
		order.push(key);
	}
	for (const key of DEFAULT_SIDEBAR_ORDER) {
		if (seen.has(key)) continue;
		seen.add(key);
		order.push(key);
	}
	return order;
}

export interface DatabaseSettings {
	showColumnColor: boolean;
}

export interface QuickNotesSettings {
	folder: string;
}

export interface NoteCreationSettings {
	defaultFolder: string | null;
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
	showFormatBar: boolean;
	zenMode: boolean;
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
		sidebarFolderTabs: string[];
		folioMode: boolean;
		noteSidePeek: boolean;
		resumeLastSession: boolean;
		keepRunningOnLastWindowClose: boolean;
		aiAssistantMode: AiAssistantMode;
		dateDisplayFormat: DateDisplayFormat;
		sidebarVisibility: SidebarVisibility;
		sidebarOrder: SidebarOrder;
	};
	dailyNotes: {
		folder: string | null;
		weeklyNotes: boolean;
		monthlyNotes: boolean;
		quarterlyNotes: boolean;
	};
	quickNotes: QuickNotesSettings;
	noteCreation: NoteCreationSettings;
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
	connectionsGraph: ConnectionsGraphOptions;
}

export interface SpaceScopedSettings {
	dailyNotesFolder?: string | null;
	dailyNotesWeeklyNotes?: boolean;
	dailyNotesMonthlyNotes?: boolean;
	dailyNotesQuarterlyNotes?: boolean;
	quickNotesFolder?: string;
	noteCreationDefaultFolder?: string | null;
	templatesFolder?: string | null;
	templatesDailyNoteTemplate?: string | null;
	templatesWeeklyNoteTemplate?: string | null;
	templatesMonthlyNoteTemplate?: string | null;
	templatesQuarterlyNoteTemplate?: string | null;
	attachmentStorageMode?: AttachmentStorageMode;
	attachmentFolder?: string | null;
	sidebarFolderTabs?: string[];
	connectionsGraph?: ConnectionsGraphOptions;
}

export type SpaceScopedSettingsMap = Record<string, SpaceScopedSettings>;

interface SettingsChangeSections {
	ui: AppSettings["ui"];
	dailyNotes: AppSettings["dailyNotes"];
	quickNotes: AppSettings["quickNotes"];
	noteCreation: AppSettings["noteCreation"];
	templates: AppSettings["templates"];
	database: AppSettings["database"];
	editor: AppSettings["editor"];
	connectionsGraph: AppSettings["connectionsGraph"];
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
