// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const { emitMock, storeState } = vi.hoisted(() => ({
	emitMock: vi.fn(() => Promise.resolve()),
	storeState: new Map<string, unknown>(),
}));

vi.mock("@tauri-apps/api/event", () => ({
	emit: emitMock,
}));

vi.mock("@tauri-apps/plugin-store", () => ({
	LazyStore: class {
		init() {
			return Promise.resolve();
		}

		get<T>(key: string) {
			return Promise.resolve((storeState.get(key) as T | undefined) ?? null);
		}

		set(key: string, value: unknown) {
			storeState.set(key, value);
			return Promise.resolve();
		}

		delete(key: string) {
			storeState.delete(key);
			return Promise.resolve();
		}

		save() {
			return Promise.resolve();
		}

		reload() {
			return Promise.resolve();
		}
	},
}));

describe("settings colorful headings", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("defaults colorful headings to false", async () => {
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.colorfulHeadings).toBe(false);
	});

	it("loads colorful headings from the store", async () => {
		storeState.set("editor.colorfulHeadings", true);
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.colorfulHeadings).toBe(true);
	});

	it("persists and emits colorful headings changes", async () => {
		const { setEditorColorfulHeadings } = await import("./settings");

		await setEditorColorfulHeadings(true);

		expect(storeState.get("editor.colorfulHeadings")).toBe(true);
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			editor: { colorfulHeadings: true },
		});
	});
});

describe("settings Vim keybindings", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("defaults Vim keybindings to false", async () => {
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.vimKeybindings).toBe(false);
	});

	it("loads Vim keybindings from the store", async () => {
		storeState.set("editor.vimKeybindings", true);
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.vimKeybindings).toBe(true);
	});

	it("persists and emits Vim keybinding changes", async () => {
		const { setEditorVimKeybindings } = await import("./settings");

		await setEditorVimKeybindings(true);

		expect(storeState.get("editor.vimKeybindings")).toBe(true);
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			editor: { vimKeybindings: true },
		});
	});
});

describe("attachment storage settings", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("migrates the legacy pasted media folder to specific-folder mode", async () => {
		storeState.set("editor.pastedMediaFolder", "assets/images");
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.attachmentStorageMode).toBe("specific-folder");
		expect(settings.editor.attachmentFolder).toBe("assets/images");
		expect(storeState.get("editor.attachmentStorageMode")).toBe(
			"specific-folder",
		);
		expect(storeState.get("editor.attachmentFolder")).toBe("assets/images");
		expect(storeState.has("editor.pastedMediaFolder")).toBe(false);
	});

	it("defaults attachments to note-folder mode for fresh settings", async () => {
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.attachmentStorageMode).toBe("note-folder");
		expect(settings.editor.attachmentFolder).toBe("assets");
	});

	it("persists and emits attachment mode changes", async () => {
		const { setEditorAttachmentStorageMode } = await import("./settings");

		await setEditorAttachmentStorageMode("space-root");

		expect(storeState.get("editor.attachmentStorageMode")).toBe("space-root");
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			editor: { attachmentStorageMode: "space-root" },
		});
	});

	it("persists and emits attachment folder changes", async () => {
		const { setEditorAttachmentFolder } = await import("./settings");

		await setEditorAttachmentFolder("assets/uploads");

		expect(storeState.get("editor.attachmentFolder")).toBe("assets/uploads");
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			editor: { attachmentFolder: "assets/uploads" },
		});
	});
});
