// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const { emitMock, listenMock, storeState } = vi.hoisted(() => ({
	emitMock: vi.fn(() => Promise.resolve()),
	listenMock: vi.fn(() => Promise.resolve(() => {})),
	storeState: new Map<string, unknown>(),
}));

vi.mock("@tauri-apps/api/event", () => ({
	emit: emitMock,
	emitTo: emitMock,
	listen: listenMock,
}));

vi.mock("@tauri-apps/plugin-store", () => ({
	LazyStore: class {
		init() {
			return Promise.resolve();
		}

		get<T>(key: string) {
			return Promise.resolve((storeState.get(key) as T | undefined) ?? null);
		}

		entries<T>() {
			return Promise.resolve(
				Array.from(storeState.entries()) as Array<[string, T]>,
			);
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
		const { DURABLE_SETTINGS } = await import("./settings");

		await DURABLE_SETTINGS.editorColorfulHeadings.write(true);

		expect(storeState.get("editor.colorfulHeadings")).toBe(true);
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			editor: { colorfulHeadings: true },
		});
	});
});

describe("settings spell check", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("defaults spell check to true", async () => {
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.spellCheck).toBe(true);
	});

	it("loads spell check from the store", async () => {
		storeState.set("editor.spellCheck", false);
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.spellCheck).toBe(false);
	});

	it("persists and emits spell check changes", async () => {
		const { DURABLE_SETTINGS } = await import("./settings");

		await DURABLE_SETTINGS.editorSpellCheck.write(false);

		expect(storeState.get("editor.spellCheck")).toBe(false);
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			editor: { spellCheck: false },
		});
	});
});

describe("settings Raw Markdown Vim Mode", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("defaults Raw Markdown Vim Mode to false", async () => {
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.rawMarkdownVimMode).toBe(false);
	});

	it("loads Raw Markdown Vim Mode from the store", async () => {
		storeState.set("editor.rawMarkdownVimMode", true);
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.editor.rawMarkdownVimMode).toBe(true);
	});

	it("persists and emits Raw Markdown Vim Mode changes", async () => {
		const { DURABLE_SETTINGS } = await import("./settings");

		await DURABLE_SETTINGS.editorRawMarkdownVimMode.write(true);

		expect(storeState.get("editor.rawMarkdownVimMode")).toBe(true);
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			editor: { rawMarkdownVimMode: true },
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
		const { DURABLE_SETTINGS } = await import("./settings");
		await DURABLE_SETTINGS.folioMode.write(true);
		expect(storeState.get("ui.folioMode")).toBe(true);
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			ui: { folioMode: true },
		});
	});
});

describe("settings workspace session restore", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("defaults resume last session to false", async () => {
		const { loadSettings } = await import("./settings");
		const settings = await loadSettings();
		expect(settings.ui.resumeLastSession).toBe(false);
	});

	it("persists and emits resume last session changes", async () => {
		const { DURABLE_SETTINGS } = await import("./settings");
		await DURABLE_SETTINGS.resumeLastSession.write(true);
		expect(storeState.get("ui.resumeLastSession")).toBe(true);
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			ui: { resumeLastSession: true },
		});
	});

	it("saves normalized per-space workspace session snapshots", async () => {
		const { loadWorkspaceSessionSnapshot, saveWorkspaceSessionSnapshot } =
			await import("./workspaceSession");

		await saveWorkspaceSessionSnapshot("/tmp/space", {
			version: 1,
			savedAt: 123.5,
			tabs: [
				{
					kind: "file",
					target: "Notes/A.md",
					paneId: "editor-pane-primary",
					isPinned: true,
				},
				{
					kind: "special",
					target: "all-docs",
					paneId: "editor-pane-primary",
					isPinned: false,
				},
			],
			activeTabTarget: "all-docs",
			activeTabTargetByPane: {
				"editor-pane-primary": "all-docs",
			},
			focusedPaneId: "editor-pane-primary",
			splitLayout: {
				type: "pane",
				paneId: "editor-pane-primary",
			},
		});

		expect(await loadWorkspaceSessionSnapshot("/tmp/space")).toEqual({
			version: 1,
			savedAt: 123,
			tabs: [
				{
					kind: "file",
					target: "Notes/A.md",
					paneId: "editor-pane-primary",
					isPinned: true,
				},
				{
					kind: "special",
					target: "all-docs",
					paneId: "editor-pane-primary",
					isPinned: false,
				},
			],
			activeTabTarget: "all-docs",
			activeTabTargetByPane: {
				"editor-pane-primary": "all-docs",
			},
			focusedPaneId: "editor-pane-primary",
			splitLayout: {
				type: "pane",
				paneId: "editor-pane-primary",
			},
		});
	});

	it("normalizes malformed persisted workspace session snapshots", async () => {
		const { loadWorkspaceSessionSnapshot } = await import("./workspaceSession");

		storeState.set("workspace.sessionBySpace", {
			"/tmp/space": {
				version: 1,
				savedAt: Number.POSITIVE_INFINITY,
				tabs: [
					{ kind: "file", target: "Notes/A.md" },
					{ kind: "special", target: "Notes/A.md" },
					{ kind: "file", target: "Notes/B.markdown" },
					{ kind: "file", target: "Notes/C.txt" },
					{ kind: "unknown", target: "Notes/D.md" },
					{ kind: "special", target: "x".repeat(121) },
					{ kind: "special", target: "all-docs" },
				],
				activeTabTarget: "missing",
			},
		});

		expect(await loadWorkspaceSessionSnapshot("/tmp/missing")).toBeNull();
		expect(await loadWorkspaceSessionSnapshot("/tmp/space")).toEqual({
			version: 1,
			savedAt: 0,
			tabs: [
				{
					kind: "file",
					target: "Notes/A.md",
					paneId: "editor-pane-primary",
					isPinned: false,
				},
				{
					kind: "file",
					target: "Notes/B.markdown",
					paneId: "editor-pane-primary",
					isPinned: false,
				},
				{
					kind: "special",
					target: "all-docs",
					paneId: "editor-pane-primary",
					isPinned: false,
				},
			],
			activeTabTarget: null,
			activeTabTargetByPane: {
				"editor-pane-primary": null,
			},
			focusedPaneId: null,
			splitLayout: null,
		});
	});
});

describe("settings corner radius style", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("defaults corner radius style to default", async () => {
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.ui.cornerRadiusStyle).toBe("default");
	});

	it("loads corner radius style from the store", async () => {
		storeState.set("ui.cornerRadiusStyle", "round");
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.ui.cornerRadiusStyle).toBe("round");
	});

	it("falls back to default for invalid corner radius style values", async () => {
		storeState.set("ui.cornerRadiusStyle", "invalid");
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.ui.cornerRadiusStyle).toBe("default");
	});

	it("persists and emits corner radius style changes", async () => {
		const { DURABLE_SETTINGS } = await import("./settings");

		await DURABLE_SETTINGS.cornerRadiusStyle.write("sharp");

		expect(storeState.get("ui.cornerRadiusStyle")).toBe("sharp");
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			ui: { cornerRadiusStyle: "sharp" },
		});

		await DURABLE_SETTINGS.cornerRadiusStyle.write("round");

		expect(storeState.get("ui.cornerRadiusStyle")).toBe("round");
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			ui: { cornerRadiusStyle: "round" },
		});
	});
});

describe("settings app translucency", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("defaults app translucency to false", async () => {
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.ui.translucentApp).toBe(false);
	});

	it("loads app translucency from the store", async () => {
		storeState.set("ui.translucentApp", true);
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.ui.translucentApp).toBe(true);
	});

	it("persists and emits app translucency changes", async () => {
		const { DURABLE_SETTINGS } = await import("./settings");

		await DURABLE_SETTINGS.translucentApp.write(true);

		expect(storeState.get("ui.translucentApp")).toBe(true);
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			ui: { translucentApp: true },
		});

		await DURABLE_SETTINGS.translucentApp.write(false);

		expect(storeState.get("ui.translucentApp")).toBe(false);
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			ui: { translucentApp: false },
		});
	});
});

describe("settings editor font family", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("derives the editor font from the UI font when unset", async () => {
		storeState.set("ui.fontFamily", "Atkinson Hyperlegible");
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.ui.editorFontFamily).toBe("Atkinson Hyperlegible");
		expect(storeState.get("ui.editorFontFamily")).toBeUndefined();
	});

	it("preserves an existing editor font instead of deriving it from the UI font", async () => {
		storeState.set("ui.fontFamily", "Atkinson Hyperlegible");
		storeState.set("ui.editorFontFamily", "Literata");
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.ui.fontFamily).toBe("Atkinson Hyperlegible");
		expect(settings.ui.editorFontFamily).toBe("Literata");
		expect(storeState.get("ui.editorFontFamily")).toBe("Literata");
	});

	it("persists and emits editor font changes", async () => {
		const { DURABLE_SETTINGS } = await import("./settings");

		await DURABLE_SETTINGS.editorFontFamily.write("Literata");

		expect(storeState.get("ui.editorFontFamily")).toBe("Literata");
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			ui: { editorFontFamily: "Literata" },
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
		const { DURABLE_SETTINGS } = await import("./settings");

		await DURABLE_SETTINGS.editorWidthMode.write("comfortable");

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
		const { DURABLE_SETTINGS } = await import("./settings");

		await DURABLE_SETTINGS.editorShowFrontmatterInEditor.write(true);

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
		const { SPACE_SETTINGS, writeSpaceSetting } = await import("./settings");

		await writeSpaceSetting(SPACE_SETTINGS.attachmentStorageMode, "space-root");
		await writeSpaceSetting(
			SPACE_SETTINGS.attachmentStorageMode,
			"note-subfolder",
		);

		expect(storeState.get("editor.attachmentStorageMode")).toBe(
			"note-subfolder",
		);
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			editor: { attachmentStorageMode: "note-subfolder" },
		});
	});

	it("persists and emits attachment folder changes", async () => {
		const { SPACE_SETTINGS, writeSpaceSetting } = await import("./settings");

		await writeSpaceSetting(SPACE_SETTINGS.attachmentFolder, "assets/uploads");

		expect(storeState.get("editor.attachmentFolder")).toBe("assets/uploads");
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			editor: { attachmentFolder: "assets/uploads" },
		});
	});

	it("recognizes note-subfolder as a valid attachment storage mode", async () => {
		const { isAttachmentStorageMode } = await import("./settings");

		expect(isAttachmentStorageMode("note-subfolder")).toBe(true);
		expect(isAttachmentStorageMode("invalid-mode")).toBe(false);
	});

	it("rejects invalid attachment folder paths", async () => {
		const { SPACE_SETTINGS, writeSpaceSetting } = await import("./settings");

		await expect(
			writeSpaceSetting(SPACE_SETTINGS.attachmentFolder, "../secret"),
		).rejects.toThrow("..");
		await expect(
			writeSpaceSetting(SPACE_SETTINGS.attachmentFolder, ".hidden"),
		).rejects.toThrow("hidden");
	});
});

describe("space-scoped settings", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("does not inherit legacy global space settings for a fresh space", async () => {
		storeState.set("dailyNotes.folder", "Old Daily");
		storeState.set("quickNotes.folder", "Old Quick");
		storeState.set("templates.folder", "Old Templates");
		storeState.set("templates.dailyNoteTemplate", "Old Templates/Daily.md");
		storeState.set("editor.attachmentStorageMode", "specific-folder");
		storeState.set("editor.attachmentFolder", "old-assets");
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings({ spacePath: "/spaces/fresh" });

		expect(settings.dailyNotes.folder).toBeNull();
		expect(settings.dailyNotes.weeklyNotes).toBe(false);
		expect(settings.dailyNotes.monthlyNotes).toBe(false);
		expect(settings.dailyNotes.quarterlyNotes).toBe(false);
		expect(settings.quickNotes.folder).toBe("Quick Notes");
		expect(settings.templates.folder).toBeNull();
		expect(settings.templates.dailyNoteTemplate).toBeNull();
		expect(settings.templates.weeklyNoteTemplate).toBeNull();
		expect(settings.templates.monthlyNoteTemplate).toBeNull();
		expect(settings.templates.quarterlyNoteTemplate).toBeNull();
		expect(settings.editor.attachmentStorageMode).toBe("note-folder");
		expect(settings.editor.attachmentFolder).toBe("assets");
	});

	it("persists folder settings under the explicit space path", async () => {
		const { SPACE_SETTINGS, setTemplatesFolder, writeSpaceSetting } =
			await import("./settings");

		await writeSpaceSetting(SPACE_SETTINGS.dailyNotesFolder, "Daily", {
			spacePath: "/spaces/work",
		});
		await writeSpaceSetting(SPACE_SETTINGS.quickNotesFolder, "Inbox", {
			spacePath: "/spaces/work",
		});
		await setTemplatesFolder("Templates", { spacePath: "/spaces/work" });
		await writeSpaceSetting(
			SPACE_SETTINGS.attachmentStorageMode,
			"specific-folder",
			{
				spacePath: "/spaces/work",
			},
		);

		expect(storeState.get("space.scopedSettings")).toEqual({
			"/spaces/work": {
				dailyNotesFolder: "Daily",
				quickNotesFolder: "Inbox",
				templatesFolder: "Templates",
				attachmentStorageMode: "specific-folder",
			},
		});
		expect(storeState.has("dailyNotes.folder")).toBe(false);
		expect(storeState.has("quickNotes.folder")).toBe(false);
		expect(storeState.has("templates.folder")).toBe(false);
		expect(storeState.has("editor.attachmentStorageMode")).toBe(false);
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

describe("settings language", () => {
	beforeEach(() => {
		vi.resetModules();
		emitMock.mockClear();
		storeState.clear();
	});

	it("defaults language to en", async () => {
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.ui.language).toBe("en");
	});

	it("loads language from the store", async () => {
		storeState.set("ui.language", "ja");
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.ui.language).toBe("ja");
	});

	it("falls back to en for unsupported language values", async () => {
		storeState.set("ui.language", "system");
		const { loadSettings } = await import("./settings");

		const settings = await loadSettings();

		expect(settings.ui.language).toBe("en");
	});

	it("persists and emits language changes", async () => {
		const { DURABLE_SETTINGS } = await import("./settings");

		await DURABLE_SETTINGS.language.write("es");

		expect(storeState.get("ui.language")).toBe("es");
		expect(emitMock).toHaveBeenCalledWith("settings:updated", {
			ui: { language: "es" },
		});
	});
});
