import { normalizeRelPath } from "../utils/path";
import { setCachedDefaultEditorViewMode } from "./editorMode";
export { DEFAULT_ATTACHMENT_FOLDER } from "./attachmentStorage";
import {
	type CustomTheme,
	customThemeId,
	isCustomThemeId,
} from "./customThemes";
import {
	DURABLE_SETTINGS,
	INTERNAL_SETTING_KEYS,
	SPACE_SETTINGS,
	type SpaceSettingDefinition,
	emitSettingsUpdated,
} from "./settings/definitions";
import type {
	AppSettings,
	EffectiveShortcutBindings,
	RecentFile,
	ShortcutBindings,
	ShortcutSettings,
	SpaceScopedSettings,
	SpaceScopedSettingsMap,
} from "./settings/model";
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
import {
	GLYPH_DEFAULT_DARK_THEME_ID,
	GLYPH_DEFAULT_LIGHT_THEME_ID,
} from "./uiThemes";

export {
	DEFAULT_QUICK_NOTES_FOLDER,
	DEFAULT_UI_CORNER_RADIUS_STYLE,
	DEFAULT_UI_TRANSLUCENT_APP,
	DURABLE_SETTINGS,
	MAX_EDITOR_FONT_SIZE,
	MAX_UI_FONT_SIZE,
	MIN_EDITOR_FONT_SIZE,
	MIN_UI_FONT_SIZE,
	SPACE_SETTINGS,
	isAttachmentStorageMode,
	isEditorWidthMode,
	isFileTreeSortMode,
	isFocusMode,
	isUiCornerRadiusStyle,
} from "./settings/definitions";
export type {
	AppSettings,
	AttachmentStorageMode,
	AutoUpdateCheckInterval,
	EditorWidthMode,
	EffectiveShortcutBindings,
	FileTreeSortMode,
	FocusMode,
	RecentFile,
	ReleaseChannel,
	SettingsUpdatedPayload,
	SidebarOrder,
	SidebarVisibility,
	ShortcutBindings,
	ShortcutSettings,
	ThemeMode,
	UiCornerRadiusStyle,
	UiFontFamily,
	UiFontSize,
} from "./settings/model";
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

const DEFAULT_SHORTCUT_SETTINGS: ShortcutSettings = {
	version: 1,
	bindings: {},
};

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
		out.dailyNotesFolder = SPACE_SETTINGS.dailyNotesFolder.normalize(
			value.dailyNotesFolder,
		);
	}
	if ("dailyNotesWeeklyNotes" in value) {
		out.dailyNotesWeeklyNotes = SPACE_SETTINGS.dailyNotesWeeklyNotes.normalize(
			value.dailyNotesWeeklyNotes,
		);
	}
	if ("dailyNotesMonthlyNotes" in value) {
		out.dailyNotesMonthlyNotes =
			SPACE_SETTINGS.dailyNotesMonthlyNotes.normalize(
				value.dailyNotesMonthlyNotes,
			);
	}
	if ("dailyNotesQuarterlyNotes" in value) {
		out.dailyNotesQuarterlyNotes =
			SPACE_SETTINGS.dailyNotesQuarterlyNotes.normalize(
				value.dailyNotesQuarterlyNotes,
			);
	}
	if ("quickNotesFolder" in value) {
		out.quickNotesFolder = SPACE_SETTINGS.quickNotesFolder.normalize(
			value.quickNotesFolder,
		);
	}
	if ("sidebarFolderTabs" in value) {
		out.sidebarFolderTabs = SPACE_SETTINGS.sidebarFolderTabs.normalize(
			value.sidebarFolderTabs,
		);
	}
	if ("noteCreationDefaultFolder" in value) {
		const folder = SPACE_SETTINGS.noteCreationDefaultFolder.normalize(
			value.noteCreationDefaultFolder,
		);
		out.noteCreationDefaultFolder =
			SPACE_SETTINGS.noteCreationDefaultFolder.validate?.(folder)
				? null
				: folder;
	}
	if ("templatesFolder" in value) {
		out.templatesFolder =
			typeof value.templatesFolder === "string"
				? normalizeRelPath(value.templatesFolder)
				: null;
	}
	if ("templatesDailyNoteTemplate" in value) {
		out.templatesDailyNoteTemplate =
			SPACE_SETTINGS.templatesDailyNoteTemplate.normalize(
				value.templatesDailyNoteTemplate,
			);
	}
	if ("templatesWeeklyNoteTemplate" in value) {
		out.templatesWeeklyNoteTemplate =
			SPACE_SETTINGS.templatesWeeklyNoteTemplate.normalize(
				value.templatesWeeklyNoteTemplate,
			);
	}
	if ("templatesMonthlyNoteTemplate" in value) {
		out.templatesMonthlyNoteTemplate =
			SPACE_SETTINGS.templatesMonthlyNoteTemplate.normalize(
				value.templatesMonthlyNoteTemplate,
			);
	}
	if ("templatesQuarterlyNoteTemplate" in value) {
		out.templatesQuarterlyNoteTemplate =
			SPACE_SETTINGS.templatesQuarterlyNoteTemplate.normalize(
				value.templatesQuarterlyNoteTemplate,
			);
	}
	if ("attachmentStorageMode" in value) {
		out.attachmentStorageMode = SPACE_SETTINGS.attachmentStorageMode.normalize(
			value.attachmentStorageMode,
		);
	}
	if ("attachmentFolder" in value) {
		out.attachmentFolder = SPACE_SETTINGS.attachmentFolder.normalize(
			value.attachmentFolder,
		);
	}
	if ("connectionsGraph" in value) {
		out.connectionsGraph = SPACE_SETTINGS.connectionsGraph.normalize(
			value.connectionsGraph,
		);
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
			await store.get<unknown>(INTERNAL_SETTING_KEYS.spaceScopedSettings),
		);
		map[spacePath] = { ...map[spacePath], ...patch };
		await store.set(INTERNAL_SETTING_KEYS.spaceScopedSettings, map);
		await saveSettingsStore(store);
	});
	return spacePath;
}

export async function writeSpaceSetting<Value>(
	definition: SpaceSettingDefinition<Value>,
	value: Value,
	scope?: SettingsScope,
): Promise<void> {
	const normalized = definition.normalize(value);
	const validationError = definition.validate?.(normalized);
	if (validationError) throw new Error(validationError);

	const spacePath = await updateActiveSpaceSettings(
		definition.patch(normalized),
		scope,
	);
	if (spacePath) {
		void emitSettingsUpdated({
			...definition.change(normalized),
			spacePath,
		});
		return;
	}

	const store = await getSettingsStore();
	if (normalized === null) {
		await store.delete(definition.legacyKey);
	} else {
		await store.set(definition.legacyKey, normalized);
	}
	await saveSettingsStore(store);
	void emitSettingsUpdated(definition.change(normalized));
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
				typeof item.path === "string" &&
				typeof item.spacePath === "string" &&
				typeof item.openedAt === "number",
		)
	);
}

function loadSpaceSettingValue<Value>(
	definition: SpaceSettingDefinition<Value>,
	entries: ReadonlyMap<string, unknown>,
	activeSettings: SpaceScopedSettings | undefined,
	hasActiveSpace: boolean,
): Value {
	const storedValue = hasActiveSpace
		? activeSettings?.[definition.field]
		: entries.get(definition.legacyKey);
	const normalized = definition.normalize(storedValue);
	return definition.validate?.(normalized)
		? definition.defaultValue
		: normalized;
}

export async function loadSettings(
	scope?: SettingsScope,
): Promise<AppSettings> {
	const entries = await loadSettingsEntries();
	const currentSpacePathRaw = entries.get(
		INTERNAL_SETTING_KEYS.currentSpacePath,
	);
	const recentSpacesRaw = entries.get(INTERNAL_SETTING_KEYS.recentSpaces);
	const rawRecentFiles = entries.get(INTERNAL_SETTING_KEYS.recentFiles);
	const rawShortcutSettingsVersion = entries.get(
		INTERNAL_SETTING_KEYS.shortcutsVersion,
	);
	const rawShortcutBindings = entries.get(
		INTERNAL_SETTING_KEYS.shortcutsBindings,
	);
	const rawSpaceScopedSettings = entries.get(
		INTERNAL_SETTING_KEYS.spaceScopedSettings,
	);
	const scopedSettings = normalizeSpaceScopedSettingsMap(
		rawSpaceScopedSettings,
	);
	const activeSettingsSpacePath = await activeSpacePath(scope);
	const currentSpacePath =
		activeSettingsSpacePath ??
		(typeof currentSpacePathRaw === "string" ? currentSpacePathRaw : null);
	const activeScopedSettings = activeSettingsSpacePath
		? scopedSettings[activeSettingsSpacePath]
		: undefined;
	const hasActiveSpace = Boolean(activeSettingsSpacePath);
	const recentSpaces = Array.isArray(recentSpacesRaw)
		? recentSpacesRaw.filter((path): path is string => typeof path === "string")
		: [];
	const recentFiles = isRecentFileArray(rawRecentFiles) ? rawRecentFiles : [];
	const aiEnabled = DURABLE_SETTINGS.aiEnabled.load(entries);
	const language = DURABLE_SETTINGS.language.load(entries);
	const dateDisplayFormat = DURABLE_SETTINGS.dateDisplayFormat.load(entries);
	const aiAssistantMode = DURABLE_SETTINGS.aiAssistantMode.load(entries);
	const theme = DURABLE_SETTINGS.theme.load(entries);
	const autoUpdateCheckInterval =
		DURABLE_SETTINGS.autoUpdateCheckInterval.load(entries);
	const releaseChannel = DURABLE_SETTINGS.releaseChannel.load(entries);
	const customThemes = DURABLE_SETTINGS.customThemes.load(entries);
	const lightThemeId = resolveSelectedThemeId(
		DURABLE_SETTINGS.lightThemeId.load(entries),
		customThemes,
		GLYPH_DEFAULT_LIGHT_THEME_ID,
	);
	const darkThemeId = resolveSelectedThemeId(
		DURABLE_SETTINGS.darkThemeId.load(entries),
		customThemes,
		GLYPH_DEFAULT_DARK_THEME_ID,
	);
	const fontFamily = DURABLE_SETTINGS.fontFamily.load(entries);
	const editorFontFamily =
		entries.get(DURABLE_SETTINGS.editorFontFamily.key) == null
			? fontFamily
			: DURABLE_SETTINGS.editorFontFamily.load(entries);
	const monoFontFamily = DURABLE_SETTINGS.monoFontFamily.load(entries);
	const fontSize = DURABLE_SETTINGS.fontSize.load(entries);
	const editorFontSize = DURABLE_SETTINGS.editorFontSize.load(entries);
	const translucentApp = DURABLE_SETTINGS.translucentApp.load(entries);
	const cornerRadiusStyle = DURABLE_SETTINGS.cornerRadiusStyle.load(entries);
	const showToc = DURABLE_SETTINGS.showToc.load(entries);
	const sidebarVisibility = DURABLE_SETTINGS.sidebarVisibility.load(entries);
	const sidebarOrder = DURABLE_SETTINGS.sidebarOrder.load(entries);
	const showFileTreeFolderCounts =
		DURABLE_SETTINGS.showFileTreeFolderCounts.load(entries);
	const showNonMarkdownFiles =
		DURABLE_SETTINGS.showNonMarkdownFiles.load(entries);
	const fileTreeSortMode = DURABLE_SETTINGS.fileTreeSortMode.load(entries);
	const folioMode = DURABLE_SETTINGS.folioMode.load(entries);
	const noteSidePeek = DURABLE_SETTINGS.noteSidePeek.load(entries);
	const resumeLastSession = DURABLE_SETTINGS.resumeLastSession.load(entries);
	const keepRunningOnLastWindowClose =
		DURABLE_SETTINGS.keepRunningOnLastWindowClose.load(entries);
	const dailyNotesFolder = loadSpaceSettingValue(
		SPACE_SETTINGS.dailyNotesFolder,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const dailyNotesWeeklyNotes = loadSpaceSettingValue(
		SPACE_SETTINGS.dailyNotesWeeklyNotes,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const dailyNotesMonthlyNotes = loadSpaceSettingValue(
		SPACE_SETTINGS.dailyNotesMonthlyNotes,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const dailyNotesQuarterlyNotes = loadSpaceSettingValue(
		SPACE_SETTINGS.dailyNotesQuarterlyNotes,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const quickNotesFolder = loadSpaceSettingValue(
		SPACE_SETTINGS.quickNotesFolder,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const sidebarFolderTabs = loadSpaceSettingValue(
		SPACE_SETTINGS.sidebarFolderTabs,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const noteCreationDefaultFolder = loadSpaceSettingValue(
		SPACE_SETTINGS.noteCreationDefaultFolder,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const legacyTemplatesFolder = entries.get(
		INTERNAL_SETTING_KEYS.templatesFolder,
	);
	const templatesFolder = hasActiveSpace
		? (activeScopedSettings?.templatesFolder ?? null)
		: typeof legacyTemplatesFolder === "string"
			? normalizeRelPath(legacyTemplatesFolder)
			: null;
	const templatesDailyNoteTemplate = loadSpaceSettingValue(
		SPACE_SETTINGS.templatesDailyNoteTemplate,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const templatesWeeklyNoteTemplate = loadSpaceSettingValue(
		SPACE_SETTINGS.templatesWeeklyNoteTemplate,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const templatesMonthlyNoteTemplate = loadSpaceSettingValue(
		SPACE_SETTINGS.templatesMonthlyNoteTemplate,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const templatesQuarterlyNoteTemplate = loadSpaceSettingValue(
		SPACE_SETTINGS.templatesQuarterlyNoteTemplate,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const shortcutBindings = sanitizeShortcutBindings(rawShortcutBindings);
	const shortcuts: ShortcutSettings = {
		version:
			rawShortcutSettingsVersion === 1 ? 1 : DEFAULT_SHORTCUT_SETTINGS.version,
		bindings: shortcutBindings,
	};
	const attachmentStorageMode = loadSpaceSettingValue(
		SPACE_SETTINGS.attachmentStorageMode,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const attachmentFolder = loadSpaceSettingValue(
		SPACE_SETTINGS.attachmentFolder,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const connectionsGraph = loadSpaceSettingValue(
		SPACE_SETTINGS.connectionsGraph,
		entries,
		activeScopedSettings,
		hasActiveSpace,
	);
	const editor: AppSettings["editor"] = {
		showCollapsibleHeadings:
			DURABLE_SETTINGS.editorShowCollapsibleHeadings.load(entries),
		showCollapsibleLists:
			DURABLE_SETTINGS.editorShowCollapsibleLists.load(entries),
		showFrontmatterInEditor:
			DURABLE_SETTINGS.editorShowFrontmatterInEditor.load(entries),
		showHeadingPrefixes:
			DURABLE_SETTINGS.editorShowHeadingPrefixes.load(entries),
		colorfulHeadings: DURABLE_SETTINGS.editorColorfulHeadings.load(entries),
		headingPaletteId: DURABLE_SETTINGS.editorHeadingPaletteId.load(entries),
		beautifulTags: DURABLE_SETTINGS.editorBeautifulTags.load(entries),
		editorWidthMode: DURABLE_SETTINGS.editorWidthMode.load(entries),
		defaultEditorMode: DURABLE_SETTINGS.editorDefaultEditorMode.load(entries),
		attachmentStorageMode,
		attachmentFolder,
		enablePeopleMentionsAsTags:
			DURABLE_SETTINGS.editorEnablePeopleMentionsAsTags.load(entries),
		rawMarkdownVimMode: DURABLE_SETTINGS.editorRawMarkdownVimMode.load(entries),
		spellCheck: DURABLE_SETTINGS.editorSpellCheck.load(entries),
		showExternalLinkPreviews:
			DURABLE_SETTINGS.editorShowExternalLinkPreviews.load(entries),
		showFormatBar: DURABLE_SETTINGS.editorShowFormatBar.load(entries),
		zenMode: DURABLE_SETTINGS.editorZenMode.load(entries),
		focusMode: DURABLE_SETTINGS.editorFocusMode.load(entries),
	};
	const database: AppSettings["database"] = {
		showColumnColor: DURABLE_SETTINGS.databaseShowColumnColor.load(entries),
	};
	setCachedDefaultEditorViewMode(editor.defaultEditorMode);
	return {
		currentSpacePath,
		recentSpaces,
		recentFiles,
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
			appIcon: DURABLE_SETTINGS.appIcon.load(entries),
			cornerRadiusStyle,
			showToc,
			sidebarVisibility,
			sidebarOrder,
			showFileTreeFolderCounts,
			showNonMarkdownFiles,
			fileTreeSortMode,
			sidebarFolderTabs,
			folioMode,
			noteSidePeek,
			resumeLastSession,
			keepRunningOnLastWindowClose,
			aiAssistantMode,
			dateDisplayFormat,
		},
		dailyNotes: {
			folder: dailyNotesFolder,
			weeklyNotes: dailyNotesWeeklyNotes,
			monthlyNotes: dailyNotesMonthlyNotes,
			quarterlyNotes: dailyNotesQuarterlyNotes,
		},
		quickNotes: {
			folder: quickNotesFolder,
		},
		noteCreation: {
			defaultFolder: noteCreationDefaultFolder,
		},
		templates: {
			folder: templatesFolder,
			dailyNoteTemplate: templatesDailyNoteTemplate,
			weeklyNoteTemplate: templatesWeeklyNoteTemplate,
			monthlyNoteTemplate: templatesMonthlyNoteTemplate,
			quarterlyNoteTemplate: templatesQuarterlyNoteTemplate,
		},
		shortcuts,
		editor,
		database,
		connectionsGraph,
	};
}

export async function setCurrentSpacePath(path: string): Promise<void> {
	const store = await getSettingsStore();
	await store.set(INTERNAL_SETTING_KEYS.currentSpacePath, path);
	const prev =
		(await store.get<string[] | null>(INTERNAL_SETTING_KEYS.recentSpaces)) ??
		[];
	const next = [path, ...prev.filter((p) => p !== path)].slice(0, 20);
	await store.set(INTERNAL_SETTING_KEYS.recentSpaces, next);
	await saveSettingsStore(store);
}

async function saveShortcutBindingsToStore(bindings: ShortcutBindings) {
	const store = await getSettingsStore();
	const sanitized = sanitizeShortcutBindings(bindings);
	await store.set(
		INTERNAL_SETTING_KEYS.shortcutsVersion,
		DEFAULT_SHORTCUT_SETTINGS.version,
	);
	await store.set(INTERNAL_SETTING_KEYS.shortcutsBindings, sanitized);
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

export async function setTemplatesFolder(
	folder: string | null,
	scope?: SettingsScope,
): Promise<void> {
	const nextFolder =
		typeof folder === "string" ? normalizeRelPath(folder) : null;
	const scopedPatch: SpaceScopedSettings = { templatesFolder: nextFolder };
	if (nextFolder === null) {
		scopedPatch.templatesDailyNoteTemplate = null;
		scopedPatch.templatesWeeklyNoteTemplate = null;
		scopedPatch.templatesMonthlyNoteTemplate = null;
		scopedPatch.templatesQuarterlyNoteTemplate = null;
	}
	const spacePath = await updateActiveSpaceSettings(scopedPatch, scope);
	if (spacePath) {
		void emitSettingsUpdated({
			spacePath,
			templates: {
				folder: nextFolder,
				dailyNoteTemplate: nextFolder === null ? null : undefined,
				weeklyNoteTemplate: nextFolder === null ? null : undefined,
				monthlyNoteTemplate: nextFolder === null ? null : undefined,
				quarterlyNoteTemplate: nextFolder === null ? null : undefined,
			},
		});
		return;
	}
	const store = await getSettingsStore();
	if (nextFolder === null) {
		await store.delete(INTERNAL_SETTING_KEYS.templatesFolder);
		await store.delete(SPACE_SETTINGS.templatesDailyNoteTemplate.legacyKey);
		await store.delete(SPACE_SETTINGS.templatesWeeklyNoteTemplate.legacyKey);
		await store.delete(SPACE_SETTINGS.templatesMonthlyNoteTemplate.legacyKey);
		await store.delete(SPACE_SETTINGS.templatesQuarterlyNoteTemplate.legacyKey);
	} else {
		await store.set(INTERNAL_SETTING_KEYS.templatesFolder, nextFolder);
	}
	await saveSettingsStore(store);
	void emitSettingsUpdated({
		templates: {
			folder: nextFolder,
			dailyNoteTemplate: nextFolder === null ? null : undefined,
			weeklyNoteTemplate: nextFolder === null ? null : undefined,
			monthlyNoteTemplate: nextFolder === null ? null : undefined,
			quarterlyNoteTemplate: nextFolder === null ? null : undefined,
		},
	});
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
		await store.delete(INTERNAL_SETTING_KEYS.autoUpdateLastCheckedAt);
	} else {
		await store.set(
			INTERNAL_SETTING_KEYS.autoUpdateLastCheckedAt,
			Math.floor(timestamp),
		);
	}
	await saveSettingsStore(store);
}

export async function getRecentFiles(): Promise<RecentFile[]> {
	const store = await getSettingsStore();
	const raw = await store.get<unknown>(INTERNAL_SETTING_KEYS.recentFiles);
	return isRecentFileArray(raw) ? raw : [];
}

export async function addRecentFile(
	path: string,
	spacePath: string,
): Promise<void> {
	const store = await getSettingsStore();
	const raw = await store.get<unknown>(INTERNAL_SETTING_KEYS.recentFiles);
	const recent = isRecentFileArray(raw) ? raw : [];
	const filtered = recent.filter(
		(r) => r.path !== path || r.spacePath !== spacePath,
	);
	const next: RecentFile[] = [
		{ path, spacePath, openedAt: Date.now() },
		...filtered,
	].slice(0, 20);
	await store.set(INTERNAL_SETTING_KEYS.recentFiles, next);
	await saveSettingsStore(store);
}
