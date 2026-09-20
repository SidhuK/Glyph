import { emit } from "@tauri-apps/api/event";
import {
	DEFAULT_TAG_ICON_NAME,
	type TagIconName,
	isTagIconName,
	resolveTagIconName,
} from "./tagIcons";
import { getSettingsStore, saveSettingsStore, withSettingsStoreWriteLock } from "./settingsStore";

const SPACE_ICON_OVERRIDES_KEY = "space.iconOverrides";

const FALLBACK_SPACE_ICONS = [
	"home",
	"briefcase",
	"book-open",
	"rocket",
	"idea",
	"code",
	"star",
	"globe",
	"coffee",
	"target",
	"folder",
	"note",
] as const satisfies readonly TagIconName[];

export type SpaceIconOverrides = Readonly<Record<string, TagIconName>>;

export interface SpaceDefinition {
	path: string;
	name: string;
	iconName: TagIconName;
	iconOverride: TagIconName | null;
}

export type SpaceRegistryUpdatedPayload =
	| { kind: "icons"; iconOverrides: SpaceIconOverrides }
	| { kind: "paths"; paths: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSpaceIconOverrides(value: unknown): SpaceIconOverrides {
	if (!isRecord(value)) return {};
	const overrides: Record<string, TagIconName> = {};
	for (const [path, iconName] of Object.entries(value)) {
		if (!path || typeof iconName !== "string" || !isTagIconName(iconName)) continue;
		overrides[path] = iconName;
	}
	return overrides;
}

function stablePathHash(path: string): number {
	let hash = 2166136261;
	for (const character of path) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

export function spaceDisplayName(path: string): string {
	const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

export function defaultSpaceIconName(path: string): TagIconName {
	const semanticIcon = resolveTagIconName(spaceDisplayName(path), null, true);
	if (semanticIcon !== DEFAULT_TAG_ICON_NAME && isTagIconName(semanticIcon)) return semanticIcon;
	return FALLBACK_SPACE_ICONS[stablePathHash(path) % FALLBACK_SPACE_ICONS.length];
}

export function buildSpaceDefinitions(
	paths: readonly string[],
	iconOverrides: SpaceIconOverrides,
): SpaceDefinition[] {
	return paths.map((path) => {
		const iconOverride = iconOverrides[path] ?? null;
		return {
			path,
			name: spaceDisplayName(path),
			iconName: iconOverride ?? defaultSpaceIconName(path),
			iconOverride,
		};
	});
}

export async function loadSpaceIconOverrides(): Promise<SpaceIconOverrides> {
	const store = await getSettingsStore();
	return normalizeSpaceIconOverrides(await store.get<unknown>(SPACE_ICON_OVERRIDES_KEY));
}

async function emitSpaceRegistryUpdated(payload: SpaceRegistryUpdatedPayload): Promise<void> {
	try {
		await emit<SpaceRegistryUpdatedPayload>("space:registry_updated", payload);
	} catch {
		// Cross-window synchronization is best effort during window teardown.
	}
}

export async function emitSpacePathsUpdated(paths: string[]): Promise<void> {
	await emitSpaceRegistryUpdated({ kind: "paths", paths });
}

export async function writeSpaceIconOverride(
	path: string,
	iconName: string | null,
): Promise<SpaceIconOverrides> {
	if (!path) throw new Error("A space path is required");
	if (iconName !== null && !isTagIconName(iconName)) {
		throw new Error("The selected space icon is invalid");
	}

	const next = await withSettingsStoreWriteLock(async () => {
		const store = await getSettingsStore();
		const current = normalizeSpaceIconOverrides(await store.get<unknown>(SPACE_ICON_OVERRIDES_KEY));
		const updated: Record<string, TagIconName> = { ...current };
		if (iconName === null) {
			delete updated[path];
		} else {
			updated[path] = iconName;
		}
		await store.set(SPACE_ICON_OVERRIDES_KEY, updated);
		await saveSettingsStore(store);
		return updated;
	});
	await emitSpaceRegistryUpdated({ kind: "icons", iconOverrides: next });
	return next;
}
