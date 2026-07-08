import { type UnlistenFn, listen } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";

let storeInstance: LazyStore | null = null;
let storeInitPromise: Promise<void> | null = null;
let settingsEntriesCache: Map<string, unknown> | null = null;
let settingsEntriesPromise: Promise<Map<string, unknown>> | null = null;
let settingsEntriesGeneration = 0;
let settingsInvalidationUnlisten: UnlistenFn | null = null;
let settingsInvalidationUnlistenPromise: Promise<UnlistenFn> | null = null;

function runSettingsInvalidationUnlisten(unlisten: UnlistenFn): void {
	try {
		const result = unlisten() as unknown;
		void Promise.resolve(result).catch(() => {});
	} catch {
		// Ignore listener cleanup races during Tauri window teardown.
	}
}

function ensureSettingsInvalidationListener() {
	if (settingsInvalidationUnlisten || settingsInvalidationUnlistenPromise)
		return;

	const unlistenPromise = listen("settings:updated", () => {
		invalidateSettingsCache();
	});
	settingsInvalidationUnlistenPromise = unlistenPromise;
	void unlistenPromise
		.then((unlisten) => {
			if (settingsInvalidationUnlistenPromise !== unlistenPromise) return;
			settingsInvalidationUnlisten = unlisten;
			settingsInvalidationUnlistenPromise = null;
		})
		.catch(() => {
			if (settingsInvalidationUnlistenPromise === unlistenPromise) {
				settingsInvalidationUnlistenPromise = null;
			}
		});
}

export function disposeSettingsInvalidationListener(): void {
	const unlisten = settingsInvalidationUnlisten;
	const unlistenPromise = settingsInvalidationUnlistenPromise;
	settingsInvalidationUnlisten = null;
	settingsInvalidationUnlistenPromise = null;

	if (unlisten) {
		runSettingsInvalidationUnlisten(unlisten);
		return;
	}
	if (unlistenPromise) {
		void unlistenPromise.then(runSettingsInvalidationUnlisten).catch(() => {});
	}
}

if (import.meta.hot) {
	import.meta.hot.dispose(disposeSettingsInvalidationListener);
}

export async function getSettingsStore(): Promise<LazyStore> {
	ensureSettingsInvalidationListener();
	if (!storeInstance) {
		storeInstance = new LazyStore("settings.json");
		storeInitPromise = storeInstance.init().catch((cause) => {
			storeInstance = null;
			storeInitPromise = null;
			throw cause;
		});
	}
	if (storeInitPromise) {
		await storeInitPromise;
	}
	return storeInstance;
}

export function invalidateSettingsCache() {
	settingsEntriesGeneration += 1;
	settingsEntriesCache = null;
	settingsEntriesPromise = null;
}

export async function saveSettingsStore(store: LazyStore): Promise<void> {
	await store.save();
	invalidateSettingsCache();
}

export async function loadSettingsEntries(): Promise<Map<string, unknown>> {
	if (settingsEntriesCache) return settingsEntriesCache;
	if (settingsEntriesPromise) return settingsEntriesPromise;

	const generation = settingsEntriesGeneration;
	const promise = getSettingsStore()
		.then((store) => store.entries<unknown>())
		.then((entries) => {
			const next = new Map(entries);
			if (generation === settingsEntriesGeneration) {
				settingsEntriesCache = next;
			}
			return next;
		})
		.finally(() => {
			if (settingsEntriesPromise === promise) {
				settingsEntriesPromise = null;
			}
		});
	settingsEntriesPromise = promise;
	return settingsEntriesPromise;
}
