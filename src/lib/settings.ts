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
				"vaultPath" in item &&
				"openedAt" in item &&
				typeof (item as RecentFile).path === "string" &&
				typeof (item as RecentFile).vaultPath === "string" &&
				typeof (item as RecentFile).openedAt === "number",
		)
	);
}

export async function loadSettings(): Promise<AppSettings> {
	const store = await getStore();
	const [
		currentVaultPathRaw,
		recentVaultsRaw,
		rawRecentFiles,
		aiSidebarWidthRaw,
		rawAiAssistantMode,
		rawTheme,
		dailyNotesFolderRaw,
	] = await Promise.all([
		store.get<string | null>(KEYS.currentVaultPath),
		store.get<string[] | null>(KEYS.recentVaults),
		store.get<unknown>(KEYS.recentFiles),
		store.get<number | null>(KEYS.aiSidebarWidth),
		store.get<unknown>(KEYS.aiAssistantMode),
		store.get<unknown>(KEYS.theme),
		store.get<string | null>(KEYS.dailyNotesFolder),
	]);
	const currentVaultPath = currentVaultPathRaw ?? null;
	const recentVaults = recentVaultsRaw ?? [];
	const recentFiles = isRecentFileArray(rawRecentFiles) ? rawRecentFiles : [];
	const aiSidebarWidth = aiSidebarWidthRaw ?? null;
	const aiAssistantMode = asAiAssistantMode(rawAiAssistantMode);
	const theme = asThemeMode(rawTheme);
	const dailyNotesFolder = dailyNotesFolderRaw ?? null;
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
	const store = await getStore();
	await store.set(KEYS.currentVaultPath, path);
	const prev = (await store.get<string[] | null>(KEYS.recentVaults)) ?? [];
	const next = [path, ...prev.filter((p) => p !== path)].slice(0, 20);
	await store.set(KEYS.recentVaults, next);
	await store.save();
}

export async function clearCurrentVaultPath(): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.currentVaultPath, null);
	await store.save();
}

export async function clearRecentVaults(): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.recentVaults, []);
	await store.save();
}

export async function setAiSidebarWidth(width: number): Promise<void> {
	const store = await getStore();
	if (!Number.isFinite(width)) return;
	await store.set(KEYS.aiSidebarWidth, Math.floor(width));
	await store.save();
}

export async function setAiAssistantMode(mode: AiAssistantMode): Promise<void> {
	const store = await getStore();
	await store.set(KEYS.aiAssistantMode, mode);
	await store.save();
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
}

export async function getRecentFiles(): Promise<RecentFile[]> {
	const store = await getStore();
	const raw = await store.get<unknown>(KEYS.recentFiles);
	return isRecentFileArray(raw) ? raw : [];
}

export async function addRecentFile(
	path: string,
	vaultPath: string,
): Promise<void> {
	const store = await getStore();
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
	const store = await getStore();
	await store.set(KEYS.recentFiles, []);
	await store.save();
}
