import { LazyStore } from "@tauri-apps/plugin-store";
import type { AiAssistantMode } from "./tauri";

export type { AiAssistantMode } from "./tauri";

const store = new LazyStore("settings.json");
const initPromise = store.init();

async function ensureLoaded(): Promise<void> {
	await initPromise;
}

export type ThemeMode = "system" | "light" | "dark";
const THEME_MODES = new Set<ThemeMode>(["system", "light", "dark"]);
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

export interface RecentFile {
	path: string;
	vaultPath: string;
	openedAt: number;
}

export interface AppSettings {
	currentVaultPath: string | null;
	recentVaults: string[];
	recentFiles: RecentFile[];
	ui: {
		aiSidebarWidth: number | null;
		theme: ThemeMode;
		aiAssistantMode: AiAssistantMode;
	};
	dailyNotes: {
		folder: string | null;
	};
}

const KEYS = {
	currentVaultPath: "vault.currentPath",
	recentVaults: "vault.recent",
	recentFiles: "files.recent",
	aiSidebarWidth: "ui.aiSidebarWidth",
	aiAssistantMode: "ui.aiAssistantMode",
	theme: "ui.theme",
	dailyNotesFolder: "dailyNotes.folder",
} as const;

export async function reloadFromDisk(): Promise<void> {
	await ensureLoaded();
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
				"vaultPath" in item &&
				"openedAt" in item &&
				typeof (item as RecentFile).path === "string" &&
				typeof (item as RecentFile).vaultPath === "string" &&
				typeof (item as RecentFile).openedAt === "number",
		)
	);
}

export async function loadSettings(): Promise<AppSettings> {
	await ensureLoaded();
	const currentVaultPath =
		(await store.get<string | null>(KEYS.currentVaultPath)) ?? null;
	const recentVaults =
		(await store.get<string[] | null>(KEYS.recentVaults)) ?? [];
	const rawRecentFiles = await store.get<unknown>(KEYS.recentFiles);
	const recentFiles = isRecentFileArray(rawRecentFiles) ? rawRecentFiles : [];
	const aiSidebarWidth =
		(await store.get<number | null>(KEYS.aiSidebarWidth)) ?? null;
	const rawAiAssistantMode = await store.get<unknown>(KEYS.aiAssistantMode);
	const aiAssistantMode = asAiAssistantMode(rawAiAssistantMode);
	const rawTheme = await store.get<unknown>(KEYS.theme);
	const theme = asThemeMode(rawTheme);
	const dailyNotesFolder =
		(await store.get<string | null>(KEYS.dailyNotesFolder)) ?? null;
	return {
		currentVaultPath,
		recentVaults: Array.isArray(recentVaults) ? recentVaults : [],
		recentFiles,
		ui: {
			aiSidebarWidth:
				typeof aiSidebarWidth === "number" && Number.isFinite(aiSidebarWidth)
					? aiSidebarWidth
					: null,
			theme,
			aiAssistantMode,
		},
		dailyNotes: {
			folder: dailyNotesFolder,
		},
	};
}

export async function setCurrentVaultPath(path: string): Promise<void> {
	await ensureLoaded();
	await store.set(KEYS.currentVaultPath, path);
	const prev = (await store.get<string[] | null>(KEYS.recentVaults)) ?? [];
	const next = [path, ...prev.filter((p) => p !== path)].slice(0, 20);
	await store.set(KEYS.recentVaults, next);
	await store.save();
}

export async function clearCurrentVaultPath(): Promise<void> {
	await ensureLoaded();
	await store.set(KEYS.currentVaultPath, null);
	await store.save();
}

export async function clearRecentVaults(): Promise<void> {
	await ensureLoaded();
	await store.set(KEYS.recentVaults, []);
	await store.save();
}

export async function setAiSidebarWidth(width: number): Promise<void> {
	await ensureLoaded();
	if (!Number.isFinite(width)) return;
	await store.set(KEYS.aiSidebarWidth, Math.floor(width));
	await store.save();
}

export async function setAiAssistantMode(mode: AiAssistantMode): Promise<void> {
	await ensureLoaded();
	await store.set(KEYS.aiAssistantMode, mode);
	await store.save();
}

export async function getDailyNotesFolder(): Promise<string | null> {
	await ensureLoaded();
	return (await store.get<string | null>(KEYS.dailyNotesFolder)) ?? null;
}

export async function setDailyNotesFolder(
	folder: string | null,
): Promise<void> {
	await ensureLoaded();
	if (folder === null) {
		await store.delete(KEYS.dailyNotesFolder);
	} else {
		await store.set(KEYS.dailyNotesFolder, folder);
	}
	await store.save();
}

export async function getRecentFiles(): Promise<RecentFile[]> {
	await ensureLoaded();
	const raw = await store.get<unknown>(KEYS.recentFiles);
	return isRecentFileArray(raw) ? raw : [];
}

export async function addRecentFile(
	path: string,
	vaultPath: string,
): Promise<void> {
	await ensureLoaded();
	const raw = await store.get<unknown>(KEYS.recentFiles);
	const recent = isRecentFileArray(raw) ? raw : [];
	const filtered = recent.filter(
		(r) => r.path !== path || r.vaultPath !== vaultPath,
	);
	const next: RecentFile[] = [
		{ path, vaultPath, openedAt: Date.now() },
		...filtered,
	].slice(0, 20);
	await store.set(KEYS.recentFiles, next);
	await store.save();
}

export async function clearRecentFiles(): Promise<void> {
	await ensureLoaded();
	await store.set(KEYS.recentFiles, []);
	await store.save();
}
