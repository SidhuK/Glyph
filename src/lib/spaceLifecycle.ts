import { type DeeplinkAction, isSameSpacePath } from "./deeplink";

export const SPACE_SETTINGS_WAIT_MS = 5000;

export type SpaceLifecycleIntent =
	| { kind: "activate"; path: string; mode: "open" | "create" }
	| { kind: "checkpoint" }
	| { kind: "close" }
	| { kind: "restore" }
	| { kind: "flushSession" }
	| { kind: "navigate"; action: DeeplinkAction };

export type SpaceLifecycleError =
	| "save_failed"
	| "activate_failed"
	| "session_save_failed";

export type SpaceLifecycleResult =
	| { kind: "ok"; spacePath: string | null }
	| { kind: "failed"; spacePath: string | null; error: SpaceLifecycleError };

export type SpaceLifecycleAdapters = {
	currentSpacePath: () => string | null;
	saveEditors: () => Promise<void>;
	flushSession: () => Promise<void>;
	activateSpace: (path: string, mode: "open" | "create") => Promise<boolean>;
	closeSpace: () => Promise<void>;
	hydrateSettings: (spacePath: string) => Promise<boolean>;
	restoreSession: (spacePath: string, generation: number) => Promise<void>;
	applyNavigation: (action: DeeplinkAction) => Promise<void>;
};

export type SpaceLifecycle = {
	submit: (intent: SpaceLifecycleIntent) => Promise<SpaceLifecycleResult>;
};

export function waitUntil(
	ready: () => boolean,
	timeoutMs: number,
): Promise<boolean> {
	if (ready()) return Promise.resolve(true);
	return new Promise((resolve) => {
		const startedAt = Date.now();
		const id = setInterval(() => {
			if (ready()) {
				clearInterval(id);
				resolve(true);
				return;
			}
			if (Date.now() - startedAt >= timeoutMs) {
				clearInterval(id);
				resolve(false);
			}
		}, 16);
	});
}

export function createSpaceLifecycle(
	adapters: SpaceLifecycleAdapters,
): SpaceLifecycle {
	let generation = 0;
	let skipRestore = false;
	let queue: Promise<void> = Promise.resolve();

	const snapshotPath = () => adapters.currentSpacePath();

	const submit = (
		intent: SpaceLifecycleIntent,
	): Promise<SpaceLifecycleResult> => {
		if (intent.kind === "navigate") {
			generation += 1;
			skipRestore = true;
		}
		const run = queue.then(
			() => perform(intent),
			() => perform(intent),
		);
		queue = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};

	const perform = async (
		intent: SpaceLifecycleIntent,
	): Promise<SpaceLifecycleResult> => {
		switch (intent.kind) {
			case "activate":
				return activate(intent.path, intent.mode, false);
			case "checkpoint":
				return checkpoint();
			case "close":
				return closeSpace();
			case "restore":
				return restore();
			case "flushSession":
				return flushSession();
			case "navigate":
				return navigate(intent.action);
			default: {
				const _exhaustive: never = intent;
				return _exhaustive;
			}
		}
	};

	const activate = async (
		path: string,
		mode: "open" | "create",
		fromNavigate: boolean,
	): Promise<SpaceLifecycleResult> => {
		if (isSameSpacePath(snapshotPath(), path)) {
			return { kind: "ok", spacePath: snapshotPath() };
		}
		const saved = await saveCurrent();
		if (!saved) {
			return {
				kind: "failed",
				spacePath: snapshotPath(),
				error: "save_failed",
			};
		}
		try {
			const opened = await adapters.activateSpace(path, mode);
			if (!opened) {
				return {
					kind: "failed",
					spacePath: snapshotPath(),
					error: "activate_failed",
				};
			}
			if (!fromNavigate) skipRestore = false;
			return { kind: "ok", spacePath: snapshotPath() };
		} catch {
			return {
				kind: "failed",
				spacePath: snapshotPath(),
				error: "activate_failed",
			};
		}
	};

	const closeSpace = async (): Promise<SpaceLifecycleResult> => {
		const saved = await saveCurrent();
		if (!saved) {
			return {
				kind: "failed",
				spacePath: snapshotPath(),
				error: "save_failed",
			};
		}
		try {
			await adapters.closeSpace();
			return { kind: "ok", spacePath: snapshotPath() };
		} catch {
			return {
				kind: "failed",
				spacePath: snapshotPath(),
				error: "activate_failed",
			};
		}
	};

	const restore = async (): Promise<SpaceLifecycleResult> => {
		const spacePath = snapshotPath();
		if (!spacePath || skipRestore) return { kind: "ok", spacePath };
		const started = generation;
		await adapters.hydrateSettings(spacePath);
		if (skipRestore) {
			return { kind: "ok", spacePath };
		}
		await adapters.restoreSession(spacePath, started);
		return { kind: "ok", spacePath };
	};

	const flushSession = async (): Promise<SpaceLifecycleResult> => {
		try {
			await adapters.flushSession();
			return { kind: "ok", spacePath: snapshotPath() };
		} catch {
			return {
				kind: "failed",
				spacePath: snapshotPath(),
				error: "session_save_failed",
			};
		}
	};

	const navigate = async (
		action: DeeplinkAction,
	): Promise<SpaceLifecycleResult> => {
		const switched = await activate(action.space, "open", true);
		if (switched.kind === "failed") return switched;
		if (action.kind === "open_daily_note") {
			const ready = await adapters.hydrateSettings(action.space);
			if (!ready) {
				return {
					kind: "failed",
					spacePath: snapshotPath(),
					error: "activate_failed",
				};
			}
		}
		await adapters.applyNavigation(action);
		return { kind: "ok", spacePath: snapshotPath() };
	};

	const saveCurrent = async (): Promise<boolean> => {
		if (!snapshotPath()) return true;
		try {
			await adapters.saveEditors();
			await adapters.flushSession();
			return true;
		} catch {
			return false;
		}
	};

	const checkpoint = async (): Promise<SpaceLifecycleResult> => {
		if (!(await saveCurrent())) {
			return {
				kind: "failed",
				spacePath: snapshotPath(),
				error: "save_failed",
			};
		}
		return { kind: "ok", spacePath: snapshotPath() };
	};

	return {
		submit,
	};
}
