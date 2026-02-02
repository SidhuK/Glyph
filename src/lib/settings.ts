import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("settings.json");

async function ensureLoaded(): Promise<void> {
	await store.init();
}

export interface AppSettings {
	currentVaultPath: string | null;
}

const KEYS = {
	currentVaultPath: "vault.currentPath",
} as const;

export async function loadSettings(): Promise<AppSettings> {
	await ensureLoaded();
	const currentVaultPath =
		(await store.get<string | null>(KEYS.currentVaultPath)) ?? null;
	return { currentVaultPath };
}

export async function setCurrentVaultPath(path: string): Promise<void> {
	await ensureLoaded();
	await store.set(KEYS.currentVaultPath, path);
	await store.save();
}
