import { i18n } from "../../i18n";
import { LANGUAGE_OPTIONS } from "../../i18n/locales";
import {
	type AppSettings,
	DATE_DISPLAY_FORMAT_OPTIONS,
	MAX_EDITOR_FONT_SIZE,
	MAX_UI_FONT_SIZE,
	MIN_EDITOR_FONT_SIZE,
	MIN_UI_FONT_SIZE,
	setAiAssistantMode,
	setAiEnabled,
	setClassicAllNotesByDefault,
	setDailyNoteTemplate,
	setDailyNotesFolder,
	setDatabaseShowColumnColor,
	setDateDisplayFormat,
	setEditorAttachmentStorageMode,
	setEditorBeautifulTags,
	setEditorColorfulHeadings,
	setEditorEnablePeopleMentionsAsTags,
	setEditorRawMarkdownVimMode,
	setEditorShowCollapsibleHeadings,
	setEditorShowCollapsibleLists,
	setEditorShowFrontmatterInEditor,
	setEditorSpellCheck,
	setEditorWidthMode,
	setFileTreeSortMode,
	setFolioMode,
	setLanguage,
	setQuickNotesFolder,
	setReleaseChannel,
	setResumeLastSession,
	setShowFileTreeFolderCounts,
	setShowNonMarkdownFiles,
	setShowToc,
	setTemplatesFolder,
	setThemeMode,
	setUiAccent,
	setUiDarkThemeId,
	setUiEditorFontFamily,
	setUiEditorFontSize,
	setUiFontFamily,
	setUiFontSize,
	setUiLightThemeId,
	setUiMonoFontFamily,
	setUiTranslucentApp,
} from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { DARK_THEME_OPTIONS, LIGHT_THEME_OPTIONS } from "../../lib/uiThemes";
import type { SettingsTab } from "../settings/settingsConfig";
import { SETTINGS_SEARCH_ENTRIES } from "../settings/settingsSearch";

export type PaletteSettingControl =
	| "toggle"
	| "choice"
	| "number"
	| "text"
	| "path"
	| "secret"
	| "account"
	| "action"
	| "information";

export interface PaletteSettingOption {
	value: string | number;
	label: string;
}

export interface PaletteSettingDefinition {
	id: string;
	tab: SettingsTab;
	scope: "application" | "space";
	control: PaletteSettingControl;
	sensitive?: boolean;
	defaultVisible?: boolean;
	min?: number;
	max?: number;
	options?: readonly PaletteSettingOption[];
	read: (settings: AppSettings) => string | number | boolean | null;
	write?: (
		value: string | number | boolean | null,
		spacePath: string | null,
	) => Promise<void>;
}

type EditablePaletteSettingDefinition = Omit<PaletteSettingDefinition, "tab">;

function invalidValue(): never {
	throw new Error(i18n.t("shell:commandPalette.invalidSettingValue"));
}

function requireString(value: string | number | boolean | null): string {
	return typeof value === "string" ? value : invalidValue();
}

function requireBoolean(value: string | number | boolean | null): boolean {
	return typeof value === "boolean" ? value : invalidValue();
}

function requireNumber(value: string | number | boolean | null): number {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: invalidValue();
}

function scope(spacePath: string | null) {
	return { spacePath };
}

const editableDefinitions: readonly EditablePaletteSettingDefinition[] = [
	{
		id: "general-language",
		scope: "application",
		control: "choice",
		options: LANGUAGE_OPTIONS.map(({ id, nativeLabel }) => ({
			value: id,
			label: nativeLabel,
		})),
		read: (settings) => settings.ui.language,
		write: async (value) => {
			const language = requireString(value);
			const option = LANGUAGE_OPTIONS.find(({ id }) => id === language);
			if (!option) invalidValue();
			await setLanguage(option.id);
		},
	},
	{
		id: "general-date-format",
		scope: "application",
		control: "choice",
		options: DATE_DISPLAY_FORMAT_OPTIONS,
		read: (settings) => settings.ui.dateDisplayFormat,
		write: async (value) => {
			const format = requireString(value);
			const option = DATE_DISPLAY_FORMAT_OPTIONS.find(
				(candidate) => candidate.value === format,
			);
			if (!option) invalidValue();
			await setDateDisplayFormat(option.value);
		},
	},
	{
		id: "general-resume-last-session",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.ui.resumeLastSession,
		write: (value) => setResumeLastSession(requireBoolean(value)),
	},
	{
		id: "appearance-theme-mode",
		scope: "application",
		control: "choice",
		defaultVisible: true,
		options: [
			{ value: "system", label: "System" },
			{ value: "light", label: "Light" },
			{ value: "dark", label: "Dark" },
		],
		read: (settings) => settings.ui.theme,
		write: async (value) => {
			const mode = requireString(value);
			if (mode !== "system" && mode !== "light" && mode !== "dark")
				invalidValue();
			await setThemeMode(mode);
		},
	},
	{
		id: "appearance-light-theme",
		scope: "application",
		control: "choice",
		options: LIGHT_THEME_OPTIONS.map(({ id, label }) => ({ value: id, label })),
		read: (settings) => settings.ui.lightThemeId,
		write: async (value) => {
			const id = requireString(value);
			const option = LIGHT_THEME_OPTIONS.find(
				(candidate) => candidate.id === id,
			);
			if (!option) invalidValue();
			await setUiLightThemeId(option.id);
		},
	},
	{
		id: "appearance-dark-theme",
		scope: "application",
		control: "choice",
		options: DARK_THEME_OPTIONS.map(({ id, label }) => ({ value: id, label })),
		read: (settings) => settings.ui.darkThemeId,
		write: async (value) => {
			const id = requireString(value);
			const option = DARK_THEME_OPTIONS.find(
				(candidate) => candidate.id === id,
			);
			if (!option) invalidValue();
			await setUiDarkThemeId(option.id);
		},
	},
	{
		id: "appearance-translucent-app",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.ui.translucentApp,
		write: (value) => setUiTranslucentApp(requireBoolean(value)),
	},
	{
		id: "appearance-accent",
		scope: "application",
		control: "choice",
		options: [
			{ value: "neutral", label: "Neutral" },
			{ value: "glyph-orange", label: "Glyph Orange" },
			{ value: "glyph-red", label: "Glyph Red" },
			{ value: "cerulean", label: "Cerulean" },
			{ value: "tropical-teal", label: "Tropical Teal" },
		],
		read: (settings) => settings.ui.accent,
		write: async (value) => {
			const accent = requireString(value);
			if (
				accent !== "neutral" &&
				accent !== "glyph-orange" &&
				accent !== "glyph-red" &&
				accent !== "cerulean" &&
				accent !== "tropical-teal"
			)
				invalidValue();
			await setUiAccent(accent);
		},
	},
	{
		id: "appearance-interface-font",
		scope: "application",
		control: "text",
		read: (settings) => settings.ui.fontFamily,
		write: (value) => setUiFontFamily(requireString(value)),
	},
	{
		id: "appearance-editor-font",
		scope: "application",
		control: "text",
		read: (settings) => settings.ui.editorFontFamily,
		write: (value) => setUiEditorFontFamily(requireString(value)),
	},
	{
		id: "appearance-monospace-font",
		scope: "application",
		control: "text",
		read: (settings) => settings.ui.monoFontFamily,
		write: (value) => setUiMonoFontFamily(requireString(value)),
	},
	{
		id: "appearance-ui-font-size",
		scope: "application",
		control: "number",
		min: MIN_UI_FONT_SIZE,
		max: MAX_UI_FONT_SIZE,
		read: (settings) => settings.ui.fontSize,
		write: (value) => setUiFontSize(requireNumber(value)),
	},
	{
		id: "appearance-editor-font-size",
		scope: "application",
		control: "number",
		min: MIN_EDITOR_FONT_SIZE,
		max: MAX_EDITOR_FONT_SIZE,
		read: (settings) => settings.ui.editorFontSize,
		write: (value) => setUiEditorFontSize(requireNumber(value)),
	},
	{
		id: "ai-features",
		scope: "application",
		control: "toggle",
		defaultVisible: true,
		read: (settings) => settings.ui.aiEnabled,
		write: (value) => setAiEnabled(requireBoolean(value)),
	},
	{
		id: "ai-assistant-behavior-tools",
		scope: "application",
		control: "choice",
		options: [
			{ value: "chat", label: "Chat" },
			{ value: "create", label: "Create" },
		],
		read: (settings) => settings.ui.aiAssistantMode,
		write: async (value) => {
			const mode = requireString(value);
			if (mode !== "chat" && mode !== "create") invalidValue();
			await setAiAssistantMode(mode);
		},
	},
	{
		id: "space-daily-notes-folder",
		scope: "space",
		control: "path",
		read: (settings) => settings.dailyNotes.folder,
		write: (value, spacePath) =>
			setDailyNotesFolder(
				value === null ? null : requireString(value),
				scope(spacePath),
			),
	},
	{
		id: "space-quick-notes-folder",
		scope: "space",
		control: "path",
		read: (settings) => settings.quickNotes.folder,
		write: (value, spacePath) =>
			setQuickNotesFolder(requireString(value), scope(spacePath)),
	},
	{
		id: "space-attachments-location",
		scope: "space",
		control: "choice",
		options: [
			{ value: "space-root", label: "Space root" },
			{ value: "specific-folder", label: "Specific folder" },
			{ value: "note-folder", label: "Note folder" },
			{ value: "note-subfolder", label: "Note subfolder" },
		],
		read: (settings) => settings.editor.attachmentStorageMode,
		write: async (value, spacePath) => {
			const mode = requireString(value);
			if (
				mode !== "space-root" &&
				mode !== "specific-folder" &&
				mode !== "note-folder" &&
				mode !== "note-subfolder"
			)
				invalidValue();
			await setEditorAttachmentStorageMode(mode, scope(spacePath));
		},
	},
	{
		id: "space-template-folder",
		scope: "space",
		control: "path",
		read: (settings) => settings.templates.folder,
		write: (value, spacePath) =>
			setTemplatesFolder(
				value === null ? null : requireString(value),
				scope(spacePath),
			),
	},
	{
		id: "space-default-daily-template",
		scope: "space",
		control: "path",
		read: (settings) => settings.templates.dailyNoteTemplate,
		write: (value, spacePath) =>
			setDailyNoteTemplate(
				value === null ? null : requireString(value),
				scope(spacePath),
			),
	},
	{
		id: "space-search-index-status",
		scope: "space",
		control: "action",
		read: () => null,
		write: async () => {
			await invoke("index_rebuild");
		},
	},
	{
		id: "space-search-index-people-tags",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.editor.enablePeopleMentionsAsTags,
		write: (value) =>
			setEditorEnablePeopleMentionsAsTags(requireBoolean(value)),
	},
	{
		id: "general-editor-table-of-contents",
		scope: "application",
		control: "toggle",
		defaultVisible: true,
		read: (settings) => settings.ui.showToc,
		write: (value) => setShowToc(requireBoolean(value)),
	},
	{
		id: "general-editor-frontmatter",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.editor.showFrontmatterInEditor,
		write: (value) => setEditorShowFrontmatterInEditor(requireBoolean(value)),
	},
	{
		id: "general-editor-colorful-headings",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.editor.colorfulHeadings,
		write: (value) => setEditorColorfulHeadings(requireBoolean(value)),
	},
	{
		id: "appearance-editor-presentation-beautiful-tags",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.editor.beautifulTags,
		write: (value) => setEditorBeautifulTags(requireBoolean(value)),
	},
	{
		id: "appearance-editor-presentation-width",
		scope: "application",
		control: "choice",
		options: [
			{ value: "compact", label: "Compact" },
			{ value: "comfortable", label: "Comfortable" },
			{ value: "wide", label: "Wide" },
		],
		read: (settings) => settings.editor.editorWidthMode,
		write: async (value) => {
			const width = requireString(value);
			if (width !== "compact" && width !== "comfortable" && width !== "wide")
				invalidValue();
			await setEditorWidthMode(width);
		},
	},
	{
		id: "general-editor-collapsible-headings",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.editor.showCollapsibleHeadings,
		write: (value) => setEditorShowCollapsibleHeadings(requireBoolean(value)),
	},
	{
		id: "general-editor-collapsible-lists",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.editor.showCollapsibleLists,
		write: (value) => setEditorShowCollapsibleLists(requireBoolean(value)),
	},
	{
		id: "general-editor-spell-check",
		scope: "application",
		control: "toggle",
		defaultVisible: true,
		read: (settings) => settings.editor.spellCheck,
		write: (value) => setEditorSpellCheck(requireBoolean(value)),
	},
	{
		id: "general-editor-vim-mode",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.editor.rawMarkdownVimMode,
		write: (value) => setEditorRawMarkdownVimMode(requireBoolean(value)),
	},
	{
		id: "appearance-layout-folio-mode",
		scope: "application",
		control: "toggle",
		defaultVisible: true,
		read: (settings) => settings.ui.folioMode,
		write: (value) => setFolioMode(requireBoolean(value)),
	},
	{
		id: "appearance-layout-classic-all-notes",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.ui.classicAllNotesByDefault,
		write: (value) => setClassicAllNotesByDefault(requireBoolean(value)),
	},
	{
		id: "general-file-tree-folder-counts",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.ui.showFileTreeFolderCounts,
		write: (value) => setShowFileTreeFolderCounts(requireBoolean(value)),
	},
	{
		id: "general-file-tree-non-markdown-files",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.ui.showNonMarkdownFiles,
		write: (value) => setShowNonMarkdownFiles(requireBoolean(value)),
	},
	{
		id: "general-file-tree-sort",
		scope: "application",
		control: "choice",
		defaultVisible: true,
		options: [
			{ value: "name-asc", label: "Name A–Z" },
			{ value: "name-desc", label: "Name Z–A" },
			{ value: "modified-desc", label: "Modified newest" },
			{ value: "modified-asc", label: "Modified oldest" },
			{ value: "created-desc", label: "Created newest" },
			{ value: "created-asc", label: "Created oldest" },
		],
		read: (settings) => settings.ui.fileTreeSortMode,
		write: async (value) => {
			const mode = requireString(value);
			if (
				mode !== "name-asc" &&
				mode !== "name-desc" &&
				mode !== "modified-desc" &&
				mode !== "modified-asc" &&
				mode !== "created-desc" &&
				mode !== "created-asc"
			)
				invalidValue();
			await setFileTreeSortMode(mode);
		},
	},
	{
		id: "appearance-database-column-color",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.database.showColumnColor,
		write: (value) => setDatabaseShowColumnColor(requireBoolean(value)),
	},
	{
		id: "about-alpha-releases",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.ui.releaseChannel === "alpha",
		write: (value) =>
			setReleaseChannel(requireBoolean(value) ? "alpha" : "stable"),
	},
];

const editableById = new Map(
	editableDefinitions.map((definition) => [definition.id, definition]),
);

const sensitiveIds = new Set([
	"general-license-key",
	"ai-api-key",
	"ai-chatgpt-identity",
]);
const accountIds = new Set([
	"ai-chatgpt-account",
	"ai-chatgpt-authentication",
	"ai-chatgpt-rate-limits",
]);
const actionIds = new Set([
	"general-activate-glyph",
	"space-search-index-status",
	"git-sync-actions",
	"about-updates",
	"about-update-status",
]);

export const PALETTE_SETTINGS_REGISTRY: readonly PaletteSettingDefinition[] =
	SETTINGS_SEARCH_ENTRIES.map(({ id, tab }) => {
		const editable = editableById.get(id);
		if (editable) return { ...editable, tab };
		return {
			id,
			tab,
			scope:
				tab === "space" || tab === "git" || tab === "ai"
					? "space"
					: "application",
			control: sensitiveIds.has(id)
				? "secret"
				: accountIds.has(id)
					? "account"
					: actionIds.has(id)
						? "action"
						: "information",
			sensitive: sensitiveIds.has(id),
			read: () => null,
		};
	});

export const PALETTE_SETTING_BY_ID = new Map(
	PALETTE_SETTINGS_REGISTRY.map((definition) => [definition.id, definition]),
);

if (import.meta.env.DEV) {
	const ids = new Set<string>();
	for (const definition of PALETTE_SETTINGS_REGISTRY) {
		if (ids.has(definition.id)) {
			throw new Error(`Duplicate palette setting ID: ${definition.id}`);
		}
		ids.add(definition.id);
		if (definition.write && definition.control === "information") {
			throw new Error(
				`Writable palette setting lacks a control: ${definition.id}`,
			);
		}
	}
	for (const entry of SETTINGS_SEARCH_ENTRIES) {
		if (!ids.has(entry.id)) {
			throw new Error(`Missing palette setting definition: ${entry.id}`);
		}
	}
}
