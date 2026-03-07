import { emit } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import { normalizeRelPath } from "../utils/path";
import type { AiAssistantMode } from "./tauri";

export type { AiAssistantMode } from "./tauri";

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
const DEFAULT_UI_FONT_FAMILY = "Inter";
const DEFAULT_UI_MONO_FONT_FAMILY = "JetBrains Mono";
const MIN_UI_FONT_SIZE = 7;
const MAX_UI_FONT_SIZE = 40;
const DEFAULT_UI_FONT_SIZE = 14;
const DEFAULT_AI_ENABLED = true;
const DEFAULT_SHOW_WINDOWS_MENU_BAR = false;
export type UiFontFamily = string;
export type UiFontSize = number;
const AI_ASSISTANT_MODES = new Set<AiAssistantMode>(["chat", "create"]);
export type TaskSourceMode = "space" | "folders";

export interface TaskSourceSetting {
	mode: TaskSourceMode;
	folders: string[];
}

function asThemeMode(value: unknown): ThemeMode {
	return typeof value === "string" && THEME_MODES.has(value as ThemeMode)
		? (value as ThemeMode)
		: "system";
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

async function emitSettingsUpdated(payload: {
	ui?: {
		theme?: ThemeMode;
		accent?: UiAccent;
		fontFamily?: UiFontFamily;
		monoFontFamily?: UiFontFamily;
		fontSize?: UiFontSize;
		aiAssistantMode?: AiAssistantMode;
		aiEnabled?: boolean;
		aiSidebarWidth?: number | null;
		showWindowsMenuBar?: boolean;
	};
	dailyNotes?: {
		folder?: string | null;
	};
	tasks?: {
		source?: TaskSourceSetting;
	};
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
	ui: {
		aiEnabled: boolean;
		aiSidebarWidth: number | null;
		showWindowsMenuBar: boolean;
		theme: ThemeMode;
		accent: UiAccent;
		fontFamily: UiFontFamily;
		monoFontFamily: UiFontFamily;
		fontSize: UiFontSize;
		aiAssistantMode: AiAssistantMode;
	};
	dailyNotes: {
		folder: string | null;
	};
	tasks: {
		source: TaskSourceSetting;
	};
}

const KEYS = {
	currentSpacePath: "space.currentPath",
	recentSpaces: "space.recent",
	recentFiles: "files.recent",
	fileTreeOrderBySpace: "fileTree.orderBySpace",
	aiEnabled: "ui.aiEnabled",
	showWindowsMenuBar: "ui.showWindowsMenuBar",
	aiSidebarWidth: "ui.aiSidebarWidth",
	aiAssistantMode: "ui.aiAssistantMode",
	theme: "ui.theme",
	accent: "ui.accent",
	fontFamily: "ui.fontFamily",
	monoFontFamily: "ui.monoFontFamily",
	fontSize: "ui.fontSize",
	dailyNotesFolder: "dailyNotes.folder",
	taskSource: "tasks.source",
} as const;

const ROOT_FILE_TREE_ORDER_KEY = "__root__";

function normalizeStoredFileTreeOrderByDir(
	value: unknown,
): Record<string, string[]> {
	if (typeof value !== "object" || value === null) return {};
	const next: Record<string, string[]> = {};
	for (const [rawKey, rawValue] of Object.entries(value)) {
		const key =
			rawKey === ROOT_FILE_TREE_ORDER_KEY
				? ROOT_FILE_TREE_ORDER_KEY
				: normalizeRelPath(rawKey);
		if (!key) continue;
		if (!Array.isArray(rawValue)) continue;
		const paths = Array.from(
			new Set(
				rawValue
					.filter((entry): entry is string => typeof entry === "string")
					.map((entry) => normalizeRelPath(entry))
					.filter(Boolean),
			),
		);
		if (paths.length > 0) next[key] = paths;
	}
	return next;
}

function normalizeStoredFileTreeOrderBySpace(
	value: unknown,
): Record<string, Record<string, string[]>> {
	if (typeof value !== "object" || value === null) return {};
	const next: Record<string, Record<string, string[]>> = {};
	for (const [rawSpacePath, rawOrder] of Object.entries(value)) {
		const spacePath = rawSpacePath.trim();
		if (!spacePath) continue;
		const normalized = normalizeStoredFileTreeOrderByDir(rawOrder);
		if (Object.keys(normalized).length > 0) next[spacePath] = normalized;
	}
	return next;
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
		rawAiEnabled,
		rawShowWindowsMenuBar,
		aiSidebarWidthRaw,
		rawAiAssistantMode,
		rawTheme,
		rawAccent,
		rawFontFamily,
		rawMonoFontFamily,
		rawFontSize,
		dailyNotesFolderRaw,
		taskSourceRaw,
	] = await Promise.all([
		store.get<string | null>(KEYS.currentSpacePath),
		store.get<string[] | null>(KEYS.recentSpaces),
		store.get<unknown>(KEYS.recentFiles),
		store.get<boolean | null>(KEYS.aiEnabled),
		store.get<boolean | null>(KEYS.showWindowsMenuBar),
		store.get<number | null>(KEYS.aiSidebarWidth),
		store.get<unknown>(KEYS.aiAssistantMode),
		store.get<unknown>(KEYS.theme),
		store.get<unknown>(KEYS.accent),
		store.get<unknown>(KEYS.fontFamily),
		store.get<unknown>(KEYS.monoFontFamily),
		store.get<unknown>(KEYS.fontSize),
		store.get<string | null>(KEYS.dailyNotesFolder),
		store.get<unknown>(KEYS.taskSource),
	]);
	const currentSpacePath = currentSpacePathRaw ?? null;
	const recentSpaces = recentSpacesRaw ?? [];
	const recentFiles = isRecentFileArray(rawRecentFiles) ? rawRecentFiles : [];
	const aiEnabled =
		typeof rawAiEnabled === "boolean" ? rawAiEnabled : DEFAULT_AI_ENABLED;
	const showWindowsMenuBar =
		typeof rawShowWindowsMenuBar === "boolean"
			? rawShowWindowsMenuBar
			: DEFAULT_SHOW_WINDOWS_MENU_BAR;
	const aiSidebarWidth = aiSidebarWidthRaw ?? null;
	const aiAssistantMode = asAiAssistantMode(rawAiAssistantMode);
	const theme = asThemeMode(rawTheme);
	const accent = asUiAccent(rawAccent);
	const fontFamily = asUiFontFamily(rawFontFamily);
	const monoFontFamily = asUiMonoFontFamily(rawMonoFontFamily);
	const fontSize = asUiFontSize(rawFontSize);
	const dailyNotesFolder = dailyNotesFolderRaw ?? null;
	const taskSource =
		normalizeLegacyTaskSourceSetting(taskSourceRaw) ??
		normalizeTaskSourceSetting(taskSourceRaw);
	return {
		currentSpacePath,
		recentSpaces: Array.isArray(recentSpaces) ? recentSpaces : [],
		recentFiles,
		ui: {
			aiEnabled,
			aiSidebarWidth:
				typeof aiSidebarWidth === "number" && Number.isFinite(aiSidebarWidth)
					? aiSidebarWidth
					: null,
			showWindowsMenuBar,
			theme,
			accent,
			fontFamily,
			monoFontFamily,
			fontSize,
			aiAssistantMode,
		},
		dailyNotes: {
			folder: dailyNotesFolder,
		},
		tasks: {
			source: taskSource,
		},
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

export async function setAiSidebarWidth(width: number): Promise<void> {
	const store = await getStore();
	if (!Number.isFinite(width)) return;
	const next = Math.floor(width);
	await store.set(KEYS.aiSidebarWidth, next);
	await store.save();
	void emitSettingsUpdated({ ui: { aiSidebarWidth: next } });
}

export async function setShowWindowsMenuBar(show: boolean): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.showWindowsMenuBar, show);
	await store.save();
	void emitSettingsUpdated({ ui: { showWindowsMenuBar: show } });
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

export async function getDailyNotesFolder(): Promise<string | null> {
	const store = await getStore();
	return (await store.get<string | null>(KEYS.dailyNotesFolder)) ?? null;
}

export async function setDailyNotesFolder(
	folder: string | null,
): Promise<void> {
	const store = await getStore();
	if (folder === null) {
		await store.delete(KEYS.dailyNotesFolder);
	} else {
		await store.set(KEYS.dailyNotesFolder, folder);
	}
	await store.save();
	void emitSettingsUpdated({ dailyNotes: { folder } });
}

export async function setTaskSource(source: TaskSourceSetting): Promise<void> {
	const store = await getStore();
	const next = normalizeTaskSourceSetting(source);
	await store.set(KEYS.taskSource, next);
	await store.save();
	void emitSettingsUpdated({ tasks: { source: next } });
}

export async function getRecentFiles(): Promise<RecentFile[]> {
	const store = await getStore();
	const raw = await store.get<unknown>(KEYS.recentFiles);
	return isRecentFileArray(raw) ? raw : [];
}

export async function getFileTreeOrder(
	spacePath: string | null,
): Promise<Record<string, string[]>> {
	if (!spacePath) return {};
	const store = await getStore();
	const raw = await store.get<unknown>(KEYS.fileTreeOrderBySpace);
	const all = normalizeStoredFileTreeOrderBySpace(raw);
	return all[spacePath] ?? {};
}

export async function updateFileTreeOrder(
	spacePath: string | null,
	updater: (
		current: Record<string, string[]>,
	) => Record<string, string[]>,
): Promise<Record<string, string[]>> {
	if (!spacePath) return {};
	const store = await getStore();
	const raw = await store.get<unknown>(KEYS.fileTreeOrderBySpace);
	const all = normalizeStoredFileTreeOrderBySpace(raw);
	const nextForSpace = normalizeStoredFileTreeOrderByDir(
		updater(all[spacePath] ?? {}),
	);
	if (Object.keys(nextForSpace).length === 0) {
		delete all[spacePath];
	} else {
		all[spacePath] = nextForSpace;
	}
	await store.set(KEYS.fileTreeOrderBySpace, all);
	await store.save();
	return nextForSpace;
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
