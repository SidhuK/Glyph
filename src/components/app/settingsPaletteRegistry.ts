import { i18n } from "../../i18n";
import { LANGUAGE_OPTIONS } from "../../i18n/locales";
import {
	type AppSettings,
	DATE_DISPLAY_FORMAT_OPTIONS,
	DURABLE_SETTINGS,
	MAX_EDITOR_FONT_SIZE,
	MAX_UI_FONT_SIZE,
	MIN_EDITOR_FONT_SIZE,
	MIN_UI_FONT_SIZE,
	SPACE_SETTINGS,
	setTemplatesFolder,
	writeSpaceSetting,
} from "../../lib/settings";
import type {
	ApplicationSettingDefinition,
	SpaceSettingDefinition,
} from "../../lib/settings/definitions";
import { invoke } from "../../lib/tauri";
import { DARK_THEME_OPTIONS, LIGHT_THEME_OPTIONS } from "../../lib/uiThemes";
import type { SettingsTab } from "../settings/settingsConfig";
import { SETTINGS_SEARCH_ENTRIES } from "../settings/settingsSearch";

type PaletteSettingValue = string | number | boolean | null;

export type PaletteSettingControl =
	| "toggle"
	| "choice"
	| "number"
	| "text"
	| "path"
	| "action";

export interface PaletteSettingOption {
	value: string | number;
	label: string;
}

export interface PaletteSettingDefinition {
	id: string;
	tab: SettingsTab;
	scope: "application" | "space";
	control: PaletteSettingControl;
	defaultVisible?: boolean;
	min?: number;
	max?: number;
	options?: readonly PaletteSettingOption[];
	read: (settings: AppSettings) => PaletteSettingValue;
	write: (
		value: PaletteSettingValue,
		spacePath: string | null,
	) => Promise<void>;
}

type EditablePaletteSettingDefinition = Omit<PaletteSettingDefinition, "tab">;
type SettingBinding = Pick<
	EditablePaletteSettingDefinition,
	"id" | "scope" | "read" | "write"
>;

function invalidValue(): never {
	throw new Error(i18n.t("shell:commandPalette.invalidSettingValue"));
}

function searchableId<Value>(
	definition:
		| ApplicationSettingDefinition<Value>
		| SpaceSettingDefinition<Value>,
): string {
	if (definition.discovery.kind === "search") return definition.discovery.id;
	throw new Error(`Palette setting is hidden: ${definition.discovery.reason}`);
}

function bindApplicationSetting<Value extends PaletteSettingValue>(
	definition: ApplicationSettingDefinition<Value>,
): SettingBinding {
	return {
		id: searchableId(definition),
		scope: "application",
		read: definition.read,
		write: async (value) => {
			const result = definition.parse(value);
			if (!result.ok) invalidValue();
			await definition.write(result.value);
		},
	};
}

function bindSpaceSetting<Value extends PaletteSettingValue>(
	definition: SpaceSettingDefinition<Value>,
): SettingBinding {
	return {
		id: searchableId(definition),
		scope: "space",
		read: definition.read,
		write: async (value, spacePath) => {
			const result = definition.parse(value);
			if (!result.ok) invalidValue();
			await writeSpaceSetting(definition, result.value, { spacePath });
		},
	};
}

const editableDefinitions: readonly EditablePaletteSettingDefinition[] = [
	{
		...bindApplicationSetting(DURABLE_SETTINGS.language),
		control: "choice",
		options: LANGUAGE_OPTIONS.map(({ id, nativeLabel }) => ({
			value: id,
			label: nativeLabel,
		})),
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.dateDisplayFormat),
		control: "choice",
		options: DATE_DISPLAY_FORMAT_OPTIONS,
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.resumeLastSession),
		control: "toggle",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.keepRunningOnLastWindowClose),
		control: "toggle",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.theme),
		control: "choice",
		defaultVisible: true,
		options: [
			{ value: "system", label: "System" },
			{ value: "light", label: "Light" },
			{ value: "dark", label: "Dark" },
		],
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.lightThemeId),
		control: "choice",
		options: LIGHT_THEME_OPTIONS.map(({ id, label }) => ({ value: id, label })),
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.darkThemeId),
		control: "choice",
		options: DARK_THEME_OPTIONS.map(({ id, label }) => ({ value: id, label })),
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.translucentApp),
		control: "toggle",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.fontFamily),
		control: "text",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.editorFontFamily),
		control: "text",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.monoFontFamily),
		control: "text",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.fontSize),
		control: "number",
		min: MIN_UI_FONT_SIZE,
		max: MAX_UI_FONT_SIZE,
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.editorFontSize),
		control: "number",
		min: MIN_EDITOR_FONT_SIZE,
		max: MAX_EDITOR_FONT_SIZE,
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.aiEnabled),
		control: "toggle",
		defaultVisible: true,
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.aiAssistantMode),
		control: "choice",
		options: [
			{ value: "chat", label: "Chat" },
			{ value: "create", label: "Create" },
		],
	},
	{
		...bindSpaceSetting(SPACE_SETTINGS.dailyNotesFolder),
		control: "path",
	},
	{
		...bindSpaceSetting(SPACE_SETTINGS.quickNotesFolder),
		control: "path",
	},
	{
		...bindSpaceSetting(SPACE_SETTINGS.attachmentStorageMode),
		control: "choice",
		options: [
			{ value: "space-root", label: "Space root" },
			{ value: "specific-folder", label: "Specific folder" },
			{ value: "note-folder", label: "Note folder" },
			{ value: "note-subfolder", label: "Note subfolder" },
		],
	},
	{
		id: "space-template-folder",
		scope: "space",
		control: "path",
		read: (settings) => settings.templates.folder,
		write: (value, spacePath) => {
			if (typeof value !== "string" && value !== null) invalidValue();
			return setTemplatesFolder(value, { spacePath });
		},
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
		...bindApplicationSetting(DURABLE_SETTINGS.showToc),
		control: "toggle",
		defaultVisible: true,
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.editorShowFrontmatterInEditor),
		control: "toggle",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.editorColorfulHeadings),
		control: "toggle",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.editorBeautifulTags),
		control: "toggle",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.editorWidthMode),
		control: "choice",
		options: [
			{ value: "compact", label: "Compact" },
			{ value: "comfortable", label: "Comfortable" },
			{ value: "wide", label: "Wide" },
		],
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.editorShowCollapsibleHeadings),
		control: "toggle",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.editorShowCollapsibleLists),
		control: "toggle",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.editorSpellCheck),
		control: "toggle",
		defaultVisible: true,
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.editorShowExternalLinkPreviews),
		control: "toggle",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.editorRawMarkdownVimMode),
		control: "toggle",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.folioMode),
		control: "toggle",
		defaultVisible: true,
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.classicAllNotesByDefault),
		control: "toggle",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.showFileTreeFolderCounts),
		control: "toggle",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.showNonMarkdownFiles),
		control: "toggle",
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.fileTreeSortMode),
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
	},
	{
		...bindApplicationSetting(DURABLE_SETTINGS.databaseShowColumnColor),
		control: "toggle",
	},
	{
		id: "about-alpha-releases",
		scope: "application",
		control: "toggle",
		read: (settings) => settings.ui.releaseChannel === "alpha",
		write: async (value) => {
			if (typeof value !== "boolean") invalidValue();
			await DURABLE_SETTINGS.releaseChannel.write(value ? "alpha" : "stable");
		},
	},
];

const settingsTabById = new Map(
	SETTINGS_SEARCH_ENTRIES.map(({ id, tab }) => [id, tab]),
);

export const PALETTE_SETTINGS_REGISTRY: readonly PaletteSettingDefinition[] =
	editableDefinitions.map((definition) => {
		const tab = settingsTabById.get(definition.id);
		if (!tab)
			throw new Error(`Missing settings search entry: ${definition.id}`);
		return { ...definition, tab };
	});

export const PALETTE_SETTING_BY_ID = new Map(
	PALETTE_SETTINGS_REGISTRY.map((definition) => [definition.id, definition]),
);
