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

describe("settings Folio Mode", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("defaults Folio Mode to false", async () => {
		const { loadSettings } = await import("./settings");
		const settings = await loadSettings();
		expect(settings.ui.folioMode).toBe(false);
	});

	it("loads Folio Mode from the store", async () => {
		storeState.set("ui.folioMode", true);
		const { loadSettings } = await import("./settings");
		const settings = await loadSettings();
		expect(settings.ui.folioMode).toBe(true);
	});

	it("persists and emits Folio Mode changes", async () => {
		const { setFolioMode } = await import("./settings");
		await setFolioMode(true);
		expect(storeState.get("ui.folioMode")).toBe(true);
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			ui: { folioMode: true },
		});
	});
});

describe("settings editor width mode", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("defaults editor width mode to compact", async () => {
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.editorWidthMode).toBe("compact");
	});

	it("loads editor width mode from the store", async () => {
		storeState.set("editor.editorWidthMode", "wide");
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.editorWidthMode).toBe("wide");
	});

	it("persists and emits editor width mode changes", async () => {
		const { setEditorWidthMode } = await import("./settings");

		await setEditorWidthMode("comfortable");

		expect(storeState.get("editor.editorWidthMode")).toBe("comfortable");
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			editor: { editorWidthMode: "comfortable" },
		});
	});
});

describe("settings show frontmatter in editor", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("defaults frontmatter visibility to off", async () => {
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.showFrontmatterInEditor).toBe(false);
	});

	it("loads frontmatter visibility from the store", async () => {
		storeState.set("editor.showFrontmatterInEditor", true);
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.showFrontmatterInEditor).toBe(true);
	});

	it("persists and emits frontmatter visibility changes", async () => {
		const { setEditorShowFrontmatterInEditor } = await import("./settings");

		await setEditorShowFrontmatterInEditor(true);

		expect(storeState.get("editor.showFrontmatterInEditor")).toBe(true);
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			editor: { showFrontmatterInEditor: true },
		});
	});
});

describe("attachment storage settings", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
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

describe("shortcut settings", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("loads effective defaults when no overrides are stored", async () => {
		const { loadShortcutSettings, getEffectiveShortcutBindings } = await import(
			"./settings"
		);

		const shortcutSettings = await loadShortcutSettings();

		expect(shortcutSettings.bindings).toEqual({});
		expect(
			getEffectiveShortcutBindings(shortcutSettings.bindings),
		).toMatchObject({
			"open-command-palette": {
				meta: true,
				key: "k",
				ctrl: false,
				alt: false,
				shift: false,
			},
			"open-settings": {
				meta: true,
				key: ",",
				ctrl: false,
				alt: false,
				shift: false,
			},
		});
	});

	it("persists custom shortcut overrides and emits updates", async () => {
		const { setShortcutBinding } = await import("./settings");

		await setShortcutBinding("open-command-palette", {
			meta: true,
			shift: true,
			key: "k",
		});

		expect(storeState.get("shortcuts.version")).toBe(1);
		expect(storeState.get("shortcuts.bindings")).toEqual({
			"open-command-palette": {
				meta: true,
				ctrl: false,
				alt: false,
				shift: true,
				key: "k",
			},
		});
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			shortcuts: {
				bindings: {
					"open-command-palette": {
						meta: true,
						ctrl: false,
						alt: false,
						shift: true,
						key: "k",
					},
				},
			},
		});
	});

	it("rejects conflicting shortcut assignments", async () => {
		const { setShortcutBinding } = await import("./settings");

		await expect(
			setShortcutBinding("open-search-palette", {
				meta: true,
				key: "k",
			}),
		).rejects.toThrow("Shortcut already used by open-command-palette");
	});

	it("drops malformed and conflicting stored bindings on load", async () => {
		storeState.set("shortcuts.version", 1);
		storeState.set("shortcuts.bindings", {
			"open-command-palette": { key: "k" },
			"open-search-palette": { meta: true, key: "k" },
			"new-note": { meta: true, key: "n" },
			"not-a-real-action": { meta: true, key: "y" },
		});

		const { loadShortcutSettings, getEffectiveShortcutBindings } = await import(
			"./settings"
		);

		const shortcutSettings = await loadShortcutSettings();
		const effective = getEffectiveShortcutBindings(shortcutSettings.bindings);

		expect(shortcutSettings.bindings).toEqual({});
		expect(effective["open-command-palette"]).toEqual({
			meta: true,
			ctrl: false,
			alt: false,
			shift: false,
			key: "k",
		});
		expect(effective["open-search-palette"]).toBeNull();
	});

	it("resets all shortcut overrides back to defaults", async () => {
		const { resetAllShortcutBindings, setShortcutBinding } = await import(
			"./settings"
		);

		await setShortcutBinding("open-command-palette", {
			meta: true,
			shift: true,
			key: "k",
		});
		await resetAllShortcutBindings();

		expect(storeState.has("shortcuts.version")).toBe(false);
		expect(storeState.has("shortcuts.bindings")).toBe(false);
		expect(emitMock).toHaveBeenLastCalledWith("settings:updated", {
			shortcuts: { bindings: {} },
		});
	});
});
