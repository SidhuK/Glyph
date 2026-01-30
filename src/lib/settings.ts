import { LazyStore } from "@tauri-apps/plugin-store";

const store = new LazyStore("settings.json");

async function ensureLoaded(): Promise<void> {
  await store.init();
}

export interface AppSettings {
  currentVaultPath: string | null;
  recentVaultPaths: string[];
}

const KEYS = {
  currentVaultPath: "vault.currentPath",
  recentVaultPaths: "vault.recentPaths",
} as const;

function uniqueMostRecentFirst(paths: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (!p) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

export async function loadSettings(): Promise<AppSettings> {
  await ensureLoaded();
  const currentVaultPath = (await store.get<string | null>(KEYS.currentVaultPath)) ?? null;
  const recentVaultPaths = (await store.get<string[]>(KEYS.recentVaultPaths)) ?? [];
  return { currentVaultPath, recentVaultPaths };
}

export async function setCurrentVaultPath(path: string): Promise<void> {
  await ensureLoaded();
  await store.set(KEYS.currentVaultPath, path);

  const recent = ((await store.get<string[] | null>(KEYS.recentVaultPaths)) ?? []).slice();
  const next = uniqueMostRecentFirst([path, ...recent]).slice(0, 20);
  await store.set(KEYS.recentVaultPaths, next);
  await store.save();
}
