import { emit } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
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
const DEFAULT_ANALYTICS_ENABLED = false;
const DEFAULT_AI_ENABLED = true;
export type UiFontFamily = string;
export type UiFontSize = number;
const AI_ASSISTANT_MODES = new Set<AiAssistantMode>(["chat", "create"]);

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
	};
	dailyNotes?: {
		folder?: string | null;
	};
	analytics?: {
		enabled?: boolean;
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
	analytics: {
		enabled: boolean;
		distinctId: string;
	};
}

const KEYS = {
	currentSpacePath: "space.currentPath",
	recentSpaces: "space.recent",
	recentFiles: "files.recent",
	aiEnabled: "ui.aiEnabled",
	aiSidebarWidth: "ui.aiSidebarWidth",
	aiAssistantMode: "ui.aiAssistantMode",
	theme: "ui.theme",
	accent: "ui.accent",
	fontFamily: "ui.fontFamily",
	monoFontFamily: "ui.monoFontFamily",
	fontSize: "ui.fontSize",
	dailyNotesFolder: "dailyNotes.folder",
	analyticsEnabled: "analytics.enabled",
	analyticsDistinctId: "analytics.distinctId",
} as const;

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
		aiSidebarWidthRaw,
		rawAiAssistantMode,
		rawTheme,
		rawAccent,
		rawFontFamily,
		rawMonoFontFamily,
		rawFontSize,
		dailyNotesFolderRaw,
		analyticsEnabledRaw,
		analyticsDistinctIdRaw,
	] = await Promise.all([
		store.get<string | null>(KEYS.currentSpacePath),
		store.get<string[] | null>(KEYS.recentSpaces),
		store.get<unknown>(KEYS.recentFiles),
		store.get<boolean | null>(KEYS.aiEnabled),
		store.get<number | null>(KEYS.aiSidebarWidth),
		store.get<unknown>(KEYS.aiAssistantMode),
		store.get<unknown>(KEYS.theme),
		store.get<unknown>(KEYS.accent),
		store.get<unknown>(KEYS.fontFamily),
		store.get<unknown>(KEYS.monoFontFamily),
		store.get<unknown>(KEYS.fontSize),
		store.get<string | null>(KEYS.dailyNotesFolder),
		store.get<boolean | null>(KEYS.analyticsEnabled),
		store.get<string | null>(KEYS.analyticsDistinctId),
	]);
	const currentSpacePath = currentSpacePathRaw ?? null;
	const recentSpaces = recentSpacesRaw ?? [];
	const recentFiles = isRecentFileArray(rawRecentFiles) ? rawRecentFiles : [];
	const aiEnabled =
		typeof rawAiEnabled === "boolean" ? rawAiEnabled : DEFAULT_AI_ENABLED;
	const aiSidebarWidth = aiSidebarWidthRaw ?? null;
	const aiAssistantMode = asAiAssistantMode(rawAiAssistantMode);
	const theme = asThemeMode(rawTheme);
	const accent = asUiAccent(rawAccent);
	const fontFamily = asUiFontFamily(rawFontFamily);
	const monoFontFamily = asUiMonoFontFamily(rawMonoFontFamily);
	const fontSize = asUiFontSize(rawFontSize);
	const dailyNotesFolder = dailyNotesFolderRaw ?? null;
	const analyticsEnabled =
		typeof analyticsEnabledRaw === "boolean"
			? analyticsEnabledRaw
			: DEFAULT_ANALYTICS_ENABLED;
	const analyticsDistinctId =
		typeof analyticsDistinctIdRaw === "string" ? analyticsDistinctIdRaw : "";
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
		analytics: {
			enabled: analyticsEnabled,
			distinctId: analyticsDistinctId,
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

export async function getAnalyticsEnabled(): Promise<boolean> {
	const store = await getStore();
	const raw = await store.get<boolean | null>(KEYS.analyticsEnabled);
	return typeof raw === "boolean" ? raw : DEFAULT_ANALYTICS_ENABLED;
}

export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.analyticsEnabled, enabled);
	await store.save();
	void emitSettingsUpdated({ analytics: { enabled } });
}

export async function getOrCreateAnalyticsDistinctId(): Promise<string> {
	const store = await getStore();
	const existing = await store.get<string | null>(KEYS.analyticsDistinctId);
	if (typeof existing === "string" && existing.trim().length > 0) {
		return existing.trim();
	}
	const next = crypto.randomUUID();
	await store.set(KEYS.analyticsDistinctId, next);
	await store.save();
	return next;
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
