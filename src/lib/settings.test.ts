// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSettings } from "./settings/model";

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

function resetSettingsHarness() {
	vi.resetModules();
	emitMock.mockClear();
	storeState.clear();
}

const DURABLE_SETTING_CASES = [
	{
		name: "colorful headings",
		storeKey: "editor.colorfulHeadings",
		read: (settings: AppSettings) => settings.editor.colorfulHeadings,
		defaultValue: false,
		storedValue: true,
		writeKey: "editorColorfulHeadings",
		writes: [{ value: true, payload: { editor: { colorfulHeadings: true } } }],
	},
	{
		name: "spell check",
		storeKey: "editor.spellCheck",
		read: (settings: AppSettings) => settings.editor.spellCheck,
		defaultValue: true,
		storedValue: false,
		writeKey: "editorSpellCheck",
		writes: [{ value: false, payload: { editor: { spellCheck: false } } }],
	},
	{
		name: "Raw Markdown Vim Mode",
		storeKey: "editor.rawMarkdownVimMode",
		read: (settings: AppSettings) => settings.editor.rawMarkdownVimMode,
		defaultValue: false,
		storedValue: true,
		writeKey: "editorRawMarkdownVimMode",
		writes: [
			{ value: true, payload: { editor: { rawMarkdownVimMode: true } } },
		],
	},
	{
		name: "formatting bar",
		storeKey: "editor.showFormatBar",
		read: (settings: AppSettings) => settings.editor.showFormatBar,
		defaultValue: true,
		storedValue: false,
		writeKey: "editorShowFormatBar",
		writes: [{ value: false, payload: { editor: { showFormatBar: false } } }],
	},
	{
		name: "note side peek",
		storeKey: "ui.noteSidePeek",
		read: (settings: AppSettings) => settings.ui.noteSidePeek,
		defaultValue: false,
		storedValue: true,
		invalidStoredValue: "yes",
		writeKey: "noteSidePeek",
		writes: [{ value: true, payload: { ui: { noteSidePeek: true } } }],
	},
	{
		name: "Folio Mode",
		storeKey: "ui.folioMode",
		read: (settings: AppSettings) => settings.ui.folioMode,
		defaultValue: false,
		storedValue: true,
		writeKey: "folioMode",
		writes: [{ value: true, payload: { ui: { folioMode: true } } }],
	},
	{
		name: "resume last session",
		storeKey: "ui.resumeLastSession",
		read: (settings: AppSettings) => settings.ui.resumeLastSession,
		defaultValue: false,
		writeKey: "resumeLastSession",
		writes: [{ value: true, payload: { ui: { resumeLastSession: true } } }],
	},
	{
		name: "corner radius style",
		storeKey: "ui.cornerRadiusStyle",
		read: (settings: AppSettings) => settings.ui.cornerRadiusStyle,
		defaultValue: "default",
		storedValue: "round",
		invalidStoredValue: "invalid",
		writeKey: "cornerRadiusStyle",
		writes: [
			{ value: "sharp", payload: { ui: { cornerRadiusStyle: "sharp" } } },
			{ value: "round", payload: { ui: { cornerRadiusStyle: "round" } } },
		],
	},
	{
		name: "app translucency",
		storeKey: "ui.translucentApp",
		read: (settings: AppSettings) => settings.ui.translucentApp,
		defaultValue: false,
		storedValue: true,
		writeKey: "translucentApp",
		writes: [
			{ value: true, payload: { ui: { translucentApp: true } } },
			{ value: false, payload: { ui: { translucentApp: false } } },
		],
	},
	{
		name: "editor width mode",
		storeKey: "editor.editorWidthMode",
		read: (settings: AppSettings) => settings.editor.editorWidthMode,
		defaultValue: "compact",
		storedValue: "wide",
		writeKey: "editorWidthMode",
		writes: [
			{
				value: "comfortable",
				payload: { editor: { editorWidthMode: "comfortable" } },
			},
		],
	},
	{
		name: "frontmatter visibility",
		storeKey: "editor.showFrontmatterInEditor",
		read: (settings: AppSettings) => settings.editor.showFrontmatterInEditor,
		defaultValue: false,
		storedValue: true,
		writeKey: "editorShowFrontmatterInEditor",
		writes: [
			{
				value: true,
				payload: { editor: { showFrontmatterInEditor: true } },
			},
		],
	},
	{
		name: "language",
		storeKey: "ui.language",
		read: (settings: AppSettings) => settings.ui.language,
		defaultValue: "en",
		storedValue: "ja",
		invalidStoredValue: "system",
		writeKey: "language",
		writes: [{ value: "es", payload: { ui: { language: "es" } } }],
	},
] as const;

describe("durable settings", () => {
	beforeEach(resetSettingsHarness);

	it.each(DURABLE_SETTING_CASES)(
		"defaults $name",
		async ({ read, defaultValue }) => {
			const { loadSettings } = await import("./settings");
			expect(read(await loadSettings())).toBe(defaultValue);
		},
	);

	it.each(DURABLE_SETTING_CASES.filter((setting) => "storedValue" in setting))(
		"loads $name from the store",
		async ({ storeKey, storedValue, read }) => {
			storeState.set(storeKey, storedValue);
			const { loadSettings } = await import("./settings");
			expect(read(await loadSettings())).toBe(storedValue);
		},
	);

	it.each(
		DURABLE_SETTING_CASES.filter((setting) => "invalidStoredValue" in setting),
	)(
		"falls back to the default for invalid $name values",
		async ({ storeKey, invalidStoredValue, read, defaultValue }) => {
			storeState.set(storeKey, invalidStoredValue);
			const { loadSettings } = await import("./settings");
			expect(read(await loadSettings())).toBe(defaultValue);
		},
	);

	it.each(DURABLE_SETTING_CASES)(
		"persists and emits $name changes",
		async ({ writeKey, writes, storeKey }) => {
			const { DURABLE_SETTINGS } = await import("./settings");
			const setting = DURABLE_SETTINGS[writeKey] as {
				write: (value: unknown) => Promise<unknown>;
			};
			for (const write of writes) {
				await setting.write(write.value);
				expect(storeState.get(storeKey)).toBe(write.value);
				expect(emitMock).toHaveBeenCalledWith(
					"settings:updated",
					write.payload,
				);
			}
		},
	);
});

describe("settings workspace session restore", () => {
	beforeEach(resetSettingsHarness);

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

describe("settings editor font family", () => {
	beforeEach(resetSettingsHarness);

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

describe("attachment storage settings", () => {
	beforeEach(resetSettingsHarness);

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
	beforeEach(resetSettingsHarness);

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
	beforeEach(resetSettingsHarness);

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
