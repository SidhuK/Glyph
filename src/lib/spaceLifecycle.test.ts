import { describe, expect, it } from "vitest";
import type { DeeplinkAction } from "./deeplink";
import {
	type SpaceLifecycleAdapters,
	createSpaceLifecycle,
} from "./spaceLifecycle";

function createHarness(initialPath: string | null = null) {
	let spacePath = initialPath;
	const calls: string[] = [];
	let hydrateOk = true;
	let activateOk = true;
	let saveShouldThrow = false;
	let flushShouldThrow = false;
	let pendingFlush: Promise<void> | null = null;
	const navigations: DeeplinkAction[] = [];

	const adapters: SpaceLifecycleAdapters = {
		currentSpacePath: () => spacePath,
		saveEditors: async () => {
			calls.push("save");
			if (saveShouldThrow) throw new Error("save failed");
		},
		flushSession: async () => {
			calls.push("flush");
			if (flushShouldThrow) throw new Error("flush failed");
			if (pendingFlush) await pendingFlush;
		},
		activateSpace: async (path, mode) => {
			calls.push(`activate:${mode}:${path}`);
			if (!activateOk) return false;
			spacePath = path;
			return true;
		},
		closeSpace: async () => {
			calls.push("close");
			spacePath = null;
		},
		hydrateSettings: async (path) => {
			calls.push(`hydrate:${path}`);
			return hydrateOk;
		},
		restoreSession: async (path, generation) => {
			calls.push(`restore:${path}:${generation}`);
		},
		applyNavigation: async (action) => {
			calls.push(`navigate:${action.kind}`);
			navigations.push(action);
		},
	};

	return {
		lifecycle: createSpaceLifecycle(adapters),
		calls,
		navigations,
		get spacePath() {
			return spacePath;
		},
		setHydrateOk(value: boolean) {
			hydrateOk = value;
		},
		setActivateOk(value: boolean) {
			activateOk = value;
		},
		setSaveShouldThrow(value: boolean) {
			saveShouldThrow = value;
		},
		setFlushShouldThrow(value: boolean) {
			flushShouldThrow = value;
		},
		setPendingFlush(promise: Promise<void>) {
			pendingFlush = promise;
		},
	};
}

describe("createSpaceLifecycle", () => {
	it("opens, restores after hydrate, and treats the current space as success", async () => {
		const h = createHarness();
		const opened = await h.lifecycle.submit({
			kind: "activate",
			path: "/vault",
			mode: "open",
		});
		expect(opened).toEqual({ kind: "ok", spacePath: "/vault" });
		expect(h.calls).toEqual(["activate:open:/vault"]);

		const restored = await h.lifecycle.submit({ kind: "restore" });
		expect(restored.kind).toBe("ok");
		expect(h.calls).toEqual([
			"activate:open:/vault",
			"hydrate:/vault",
			"restore:/vault:0",
		]);

		const again = await h.lifecycle.submit({
			kind: "activate",
			path: "/vault",
			mode: "open",
		});
		expect(again).toEqual({ kind: "ok", spacePath: "/vault" });
		expect(h.calls[h.calls.length - 1]).toBe("restore:/vault:0");
	});

	it("creates through the same activate path", async () => {
		const h = createHarness();
		const created = await h.lifecycle.submit({
			kind: "activate",
			path: "/new",
			mode: "create",
		});
		expect(created).toEqual({ kind: "ok", spacePath: "/new" });
		expect(h.calls).toEqual(["activate:create:/new"]);
	});

	it("saves before switching and stops when save fails", async () => {
		const h = createHarness("/current");
		h.setSaveShouldThrow(true);
		const result = await h.lifecycle.submit({
			kind: "activate",
			path: "/next",
			mode: "open",
		});
		expect(result).toEqual({
			kind: "failed",
			spacePath: "/current",
			error: "save_failed",
		});
		expect(h.spacePath).toBe("/current");
		expect(h.calls).toEqual(["save"]);
	});

	it("keeps the previous space when activation fails", async () => {
		const h = createHarness("/current");
		h.setActivateOk(false);
		const result = await h.lifecycle.submit({
			kind: "activate",
			path: "/next",
			mode: "open",
		});
		expect(result).toEqual({
			kind: "failed",
			spacePath: "/current",
			error: "activate_failed",
		});
		expect(h.spacePath).toBe("/current");
		expect(h.calls).toEqual(["save", "flush", "activate:open:/next"]);
	});

	it("skips restore when a live navigation bumped generation", async () => {
		const h = createHarness("/vault");
		const restore = h.lifecycle.submit({ kind: "restore" });
		const nav = h.lifecycle.submit({
			kind: "navigate",
			action: { kind: "open_note", space: "/vault", path: "a.md" },
		});
		await Promise.all([restore, nav]);
		expect(h.calls.filter((call) => call.startsWith("restore:"))).toEqual([]);
		expect(h.navigations).toEqual([
			{ kind: "open_note", space: "/vault", path: "a.md" },
		]);
	});

	it("runs pending navigations in order", async () => {
		const h = createHarness("/vault");
		const first = h.lifecycle.submit({
			kind: "navigate",
			action: { kind: "open_note", space: "/vault", path: "one.md" },
		});
		const second = h.lifecycle.submit({
			kind: "navigate",
			action: { kind: "open_note", space: "/vault", path: "two.md" },
		});
		await Promise.all([first, second]);
		expect(
			h.navigations.map((action) =>
				action.kind === "open_note" ? action.path : "",
			),
		).toEqual(["one.md", "two.md"]);
	});

	it("hydrates before opening a daily note", async () => {
		const h = createHarness("/vault");
		await h.lifecycle.submit({
			kind: "navigate",
			action: { kind: "open_daily_note", space: "/vault" },
		});
		expect(h.calls).toEqual(["hydrate:/vault", "navigate:open_daily_note"]);
	});

	it("waits for a queued session flush before close", async () => {
		const h = createHarness("/vault");
		let release = () => {};
		h.setPendingFlush(
			new Promise<void>((resolve) => {
				release = resolve;
			}),
		);
		const flush = h.lifecycle.submit({ kind: "flushSession" });
		const close = h.lifecycle.submit({ kind: "close" });
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(h.calls).toEqual(["flush"]);
		expect(h.spacePath).toBe("/vault");
		release();
		await Promise.all([flush, close]);
		expect(h.calls).toEqual(["flush", "save", "flush", "close"]);
		expect(h.spacePath).toBeNull();
	});

	it("surfaces a session save failure without closing", async () => {
		const h = createHarness("/vault");
		h.setFlushShouldThrow(true);
		const result = await h.lifecycle.submit({ kind: "flushSession" });
		expect(result).toEqual({
			kind: "failed",
			spacePath: "/vault",
			error: "session_save_failed",
		});
		expect(h.spacePath).toBe("/vault");
	});
});
