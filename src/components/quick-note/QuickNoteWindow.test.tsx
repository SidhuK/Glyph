// @vitest-environment jsdom

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickNoteWindow } from "./QuickNoteWindow";

const {
	emitMock,
	invokeMock,
	loadSettingsMock,
	editorReadyCallbackRef,
	mockEditor,
	setEditorText,
	additionalExtensionsRef,
} = vi.hoisted(() => {
	const listeners = new Map<string, Set<() => void>>();
	let text = "";
	const mockEditor = {
		getText: () => text,
		getMarkdown: () => text,
		commands: {
			focus: vi.fn(),
			setContent: vi.fn((content: string) => {
				text = content;
				for (const callback of listeners.get("update") ?? []) {
					callback();
				}
			}),
		},
		on: vi.fn((event: string, callback: () => void) => {
			if (!listeners.has(event)) {
				listeners.set(event, new Set());
			}
			listeners.get(event)?.add(callback);
		}),
		off: vi.fn((event: string, callback: () => void) => {
			listeners.get(event)?.delete(callback);
		}),
	};

	return {
		emitMock: vi.fn(() => Promise.resolve()),
		invokeMock: vi.fn(),
		loadSettingsMock: vi.fn(() =>
			Promise.resolve({
				quickNotes: {
					folder: "Quick Notes",
				},
			}),
		),
		editorReadyCallbackRef: {
			current: null as
				| ((
						editor: typeof mockEditor | null,
						contentRoot: HTMLElement | null,
				  ) => void)
				| null,
		},
		additionalExtensionsRef: {
			current: null as unknown[] | null,
		},
		mockEditor,
		setEditorText(next: string) {
			text = next;
			for (const callback of listeners.get("update") ?? []) {
				callback();
			}
		},
	};
});

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/api/event", () => ({
	emit: emitMock,
}));

vi.mock("../../lib/settings", () => ({
	loadSettings: loadSettingsMock,
	reloadFromDisk: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../lib/tauri", () => ({
	invoke: invokeMock,
}));

vi.mock("../../lib/tauriEvents", () => ({
	useTauriEvent: () => {},
}));

vi.mock("../editor/NoteInlineEditor", () => ({
	NoteInlineEditor: ({
		onChange,
		onEditorReady,
		deferHeavyFeatures,
		chrome,
		placeholder,
		additionalExtensions,
	}: {
		onChange: (nextMarkdown: string) => void;
		onEditorReady?: (
			editor: typeof mockEditor | null,
			contentRoot: HTMLElement | null,
		) => void;
		deferHeavyFeatures?: boolean;
		chrome?: string;
		placeholder?: string;
		additionalExtensions?: unknown[];
	}) => {
		editorReadyCallbackRef.current = onEditorReady ?? null;
		if (additionalExtensions) {
			if (
				additionalExtensionsRef.current &&
				additionalExtensionsRef.current !== additionalExtensions
			) {
				(
					globalThis as typeof globalThis & {
						__quickNoteAdditionalExtensionsChanged?: boolean;
					}
				).__quickNoteAdditionalExtensionsChanged = true;
			}
			additionalExtensionsRef.current = additionalExtensions;
		}
		return (
			<div
				data-testid="quick-note-editor"
				data-defer-heavy-features={deferHeavyFeatures ? "true" : "false"}
				data-chrome={chrome}
				data-placeholder={placeholder}
				data-additional-extensions={String(additionalExtensions?.length ?? 0)}
			>
				<textarea
					aria-label="Quick note editor"
					onChange={(event) => {
						setEditorText(event.target.value);
						onChange(event.target.value);
					}}
				/>
			</div>
		);
	},
}));

vi.mock("./QuickNoteTargetBreadcrumbs", () => ({
	QUICK_NOTE_TARGET_VALUE: "__quick-note-today__",
	QuickNoteTargetBreadcrumbs: () => null,
}));

vi.mock("../Icons", () => ({
	FileText: () => null,
	Save: () => null,
}));

describe("QuickNoteWindow", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.append(container);
		root = createRoot(container);
		setEditorText("");
		additionalExtensionsRef.current = null;
		(
			globalThis as typeof globalThis & {
				__quickNoteAdditionalExtensionsChanged?: boolean;
			}
		).__quickNoteAdditionalExtensionsChanged = false;
		emitMock.mockClear();
		invokeMock.mockReset();
		loadSettingsMock.mockClear();
		invokeMock.mockImplementation((command: string) => {
			if (command === "space_read_text") {
				return Promise.resolve({ text: "", mtime_ms: 0 });
			}
			if (command === "space_write_text") {
				return Promise.resolve();
			}
			return Promise.resolve();
		});
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
	});

	async function renderWindow() {
		await act(async () => {
			root.render(<QuickNoteWindow />);
		});
		await act(async () => {
			editorReadyCallbackRef.current?.(mockEditor, null);
		});
	}

	function getSaveButton() {
		return container.querySelector(
			".quickNoteSaveButton",
		) as HTMLButtonElement | null;
	}

	function typeInEditor(value: string) {
		act(() => {
			setEditorText(value);
		});
	}

	it("passes quick note editor options to NoteInlineEditor", async () => {
		await renderWindow();
		const editor = container.querySelector('[data-testid="quick-note-editor"]');
		expect(editor?.getAttribute("data-defer-heavy-features")).toBe("true");
		expect(editor?.getAttribute("data-chrome")).toBe("minimal");
		expect(editor?.getAttribute("data-additional-extensions")).toBe("1");
		expect(editor?.getAttribute("data-placeholder")).toBe(
			"Write a quick note or press / for commands",
		);
	});

	it("keeps editor extensions stable while typing", async () => {
		await renderWindow();
		const initialExtensions = additionalExtensionsRef.current;
		expect(initialExtensions).not.toBeNull();
		act(() => {
			setEditorText("first");
		});
		act(() => {
			setEditorText("first second");
		});
		await act(async () => {
			await Promise.resolve();
		});
		expect(additionalExtensionsRef.current).toBe(initialExtensions);
		expect(
			(
				globalThis as typeof globalThis & {
					__quickNoteAdditionalExtensionsChanged?: boolean;
				}
			).__quickNoteAdditionalExtensionsChanged,
		).not.toBe(true);
	});

	it("enables save from live editor text before draft state syncs", async () => {
		await renderWindow();
		const saveButton = getSaveButton();
		expect(saveButton?.disabled).toBe(true);
		act(() => {
			setEditorText("instant note");
		});
		await act(async () => {
			await Promise.resolve();
		});
		expect(getSaveButton()?.disabled).toBe(false);
	});

	it("saves from the save button and clears the editor", async () => {
		await renderWindow();
		typeInEditor("capture this");
		const saveButton = getSaveButton();
		expect(saveButton?.disabled).toBe(false);
		await act(async () => {
			saveButton?.click();
		});
		await vi.waitFor(() => {
			expect(invokeMock).toHaveBeenCalledWith(
				"space_write_text",
				expect.objectContaining({
					text: "capture this\n",
				}),
			);
		});
		expect(invokeMock).toHaveBeenCalledWith("space_read_text", {
			path: expect.stringContaining("Quick Note"),
		});
		expect(mockEditor.commands.setContent).toHaveBeenCalledWith("", {
			contentType: "markdown",
		});
		expect(emitMock).toHaveBeenCalledWith(
			"quick-note:open_note",
			expect.objectContaining({ path: expect.stringContaining("Quick Note") }),
		);
	});
});
