import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("settings.json");
const initPromise = store.init();

async function ensureLoaded(): Promise<void> {
	await initPromise;
}

export type ThemeMode = "system" | "light" | "dark";
const THEME_MODES = new Set<ThemeMode>(["system", "light", "dark"]);

function asThemeMode(value: unknown): ThemeMode {
	return typeof value === "string" && THEME_MODES.has(value as ThemeMode)
		? (value as ThemeMode)
		: "system";
}

export interface AppSettings {
	currentVaultPath: string | null;
	recentVaults: string[];
	ui: {
		aiSidebarWidth: number | null;
		theme: ThemeMode;
	};
}

const KEYS = {
	currentVaultPath: "vault.currentPath",
	recentVaults: "vault.recent",
	aiSidebarWidth: "ui.aiSidebarWidth",
	theme: "ui.theme",
} as const;

export async function loadSettings(): Promise<AppSettings> {
	await ensureLoaded();
	const currentVaultPath =
		(await store.get<string | null>(KEYS.currentVaultPath)) ?? null;
	const recentVaults =
		(await store.get<string[] | null>(KEYS.recentVaults)) ?? [];
	const aiSidebarWidth =
		(await store.get<number | null>(KEYS.aiSidebarWidth)) ?? null;
	const rawTheme = await store.get<unknown>(KEYS.theme);
	const theme = asThemeMode(rawTheme);
	return {
		currentVaultPath,
		recentVaults: Array.isArray(recentVaults) ? recentVaults : [],
		ui: {
			aiSidebarWidth:
				typeof aiSidebarWidth === "number" && Number.isFinite(aiSidebarWidth)
					? aiSidebarWidth
					: null,
			theme,
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

export async function setTheme(theme: ThemeMode): Promise<void> {
	await ensureLoaded();
	await store.set(KEYS.theme, theme);
	await store.save();
}
