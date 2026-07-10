// @vitest-environment jsdom

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditorPane } from "./MarkdownEditorPane";

const { noteInlineEditorMock, localNoteConnectionsDialogMock, invokeMock } =
	vi.hoisted(() => ({
		noteInlineEditorMock: vi.fn(),
		localNoteConnectionsDialogMock: vi.fn(),
		invokeMock: vi.fn(),
	}));

// React 19 expects tests to opt into act-aware scheduling.
(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { defaultValue?: string }) => {
			const labels: Record<string, string> = {
				"mode.label": "Editor mode",
				"mode.raw": "Raw",
				"mode.rich": "Rich",
				"mode.preview": "Preview",
			};
			return labels[key] ?? options?.defaultValue ?? key;
		},
	}),
}));

vi.mock("../../contexts", () => ({
	useAISidebarContext: () => ({
		aiEnabled: false,
		aiPanelOpen: false,
		setAiPanelOpen: vi.fn(),
	}),
	useEditorRegistration: () => {},
	useGitSyncContext: () => ({ status: null }),
	useSpace: () => ({ spacePath: "/spaces/test" }),
	useUILayoutContext: () => ({
		showToc: false,
	}),
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
		mode,
		pasteMarkdownBehavior,
	}: {
		onChange: (nextText: string) => void;
		mode: "plain" | "rich" | "preview";
		pasteMarkdownBehavior?: "plain-text" | "smart-markdown";
	}) => (
		<button
			type="button"
			onClick={() => onChange("latest typed text")}
			data-paste-markdown-behavior={pasteMarkdownBehavior}
			data-mode={mode}
			ref={() => {
				noteInlineEditorMock({
					mode,
					pasteMarkdownBehavior,
				});
			}}
		>
			Type latest text
		</button>
	),
}));

vi.mock("../editor/FloatingTOC", () => ({
	FloatingTOC: () => null,
}));

vi.mock("../connections/LocalNoteConnectionsDialog", () => ({
	LocalNoteConnectionsDialog: ({
		open,
		noteId,
		connectionsRefreshKey,
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		noteId: string;
		connectionsRefreshKey?: number;
	}) => {
		localNoteConnectionsDialogMock({ open, noteId, connectionsRefreshKey });
		return open ? (
			<div data-testid="local-note-connections">Local connections</div>
		) : null;
	},
}));

vi.mock("./NotesInfoSidebar", () => ({
	NotesInfoSidebar: ({
		open,
		saveLabel,
	}: {
		open: boolean;
		saveLabel: string;
	}) =>
		open ? (
			<div data-testid="notes-info-sidebar">Save status {saveLabel}</div>
		) : null,
}));

vi.mock("@hugeicons/react", () => ({
	HugeiconsIcon: () => null,
}));

describe("MarkdownEditorPane", () => {
	let container: HTMLDivElement;
	let root: Root;

	type ReadTextArgs = { path: string };
	type WriteTextArgs = {
		path: string;
		text: string;
		base_mtime_ms?: number | null;
	};

	function mockInvoke(
		...args:
			| [command: "space_read_text", params: ReadTextArgs]
			| [command: "space_write_text", params: WriteTextArgs]
			| [command: "backlinks", params: { note_id: string }]
			| [command: "note_relationships", params: { note_id: string }]
			| [
					command: "note_frontmatter_parse_properties",
					params: { frontmatter?: string | null },
			  ]
			| [command: "task_summary", params: { markdown: string }]
			| [command: "databases_preview_context", params: { note_path: string }]
	) {
		const [command, params] = args;
		if (command === "space_write_text") {
			return Promise.resolve({
				etag: `${params.path}-saved`,
				mtime_ms: 2,
			});
		}
		if (command === "space_read_text") {
			return Promise.resolve(makeDoc(params.path, "", 1));
		}
		if (command === "databases_preview_context") {
			return Promise.resolve({
				note_path: params.note_path,
				title: "Note",
				markdown: "",
				created: "2026-04-23T10:00:00.000Z",
				updated: "2026-04-23T10:00:00.000Z",
				word_count: 0,
				character_count: 0,
				line_count: 1,
				reading_time_minutes: 1,
				backlinks: [],
			});
		}
		if (command === "backlinks") {
			return Promise.resolve([]);
		}
		if (command === "note_relationships") {
			return Promise.resolve([]);
		}
		if (command === "note_frontmatter_parse_properties") {
			return Promise.resolve([]);
		}
		if (command === "task_summary") {
			return Promise.resolve({ total: 0, completed: 0 });
		}
		throw new Error(`Unexpected command: ${command satisfies never}`);
	}

	const makeDoc = (relPath: string, text: string, mtimeMs = 1) => ({
		rel_path: relPath,
		text,
		etag: `${relPath}-etag-${mtimeMs}`,
		mtime_ms: mtimeMs,
	});

	beforeEach(() => {
		vi.useFakeTimers();
		globalThis.ResizeObserver = class {
			disconnect() {}
			observe() {}
			unobserve() {}
		} as typeof ResizeObserver;
		invokeMock.mockReset();
		invokeMock.mockImplementation(mockInvoke);
		noteInlineEditorMock.mockReset();
		localNoteConnectionsDialogMock.mockReset();

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		vi.useRealTimers();
	});

	it("flushes the latest note snapshot when switching away quickly", async () => {
		await act(async () => {
			root.render(
				<MarkdownEditorPane
					relPath="notes/first.md"
					initialDoc={makeDoc("notes/first.md", "initial text")}
				/>,
			);
		});

		const changeButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("Type latest text"),
		);
		expect(changeButton).not.toBeNull();

		await act(async () => {
			changeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		await act(async () => {
			root.render(
				<MarkdownEditorPane
					relPath="notes/second.md"
					initialDoc={makeDoc("notes/second.md", "other note")}
				/>,
			);
		});

		expect(invokeMock).toHaveBeenCalledWith("space_write_text", {
			path: "notes/first.md",
			text: "latest typed text",
			base_mtime_ms: 1,
		});
	});

	it("opts the main note editor into smart Markdown paste", async () => {
		await act(async () => {
			root.render(
				<MarkdownEditorPane
					relPath="notes/default.md"
					initialDoc={makeDoc("notes/default.md", "seed text")}
				/>,
			);
		});

		expect(noteInlineEditorMock).toHaveBeenCalledWith({
			mode: "rich",
			pasteMarkdownBehavior: "smart-markdown",
		});
	});

	it("switches editor mode from the top toggle", async () => {
		await act(async () => {
			root.render(
				<MarkdownEditorPane
					relPath="notes/mode.md"
					initialDoc={makeDoc("notes/mode.md", "seed text")}
				/>,
			);
		});

		const rawButton = container.querySelector('button[aria-label="Raw"]');
		expect(rawButton).not.toBeNull();

		await act(async () => {
			rawButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(noteInlineEditorMock).toHaveBeenLastCalledWith({
			mode: "plain",
			pasteMarkdownBehavior: "smart-markdown",
		});
	});

	it("renders save status in info sidebar through dirty, saving, and saved states", async () => {
		let resolveWrite:
			| ((value: { etag: string; mtime_ms: number }) => void)
			| null = null;
		invokeMock.mockImplementation((...args: Parameters<typeof mockInvoke>) => {
			const [command, params] = args;
			if (command === "space_write_text") {
				return new Promise((resolve) => {
					resolveWrite = resolve;
				});
			}
			if (command === "space_read_text") {
				return Promise.resolve(makeDoc(params.path, "", 1));
			}
			if (command === "databases_preview_context") {
				return Promise.resolve({
					note_path: params.note_path,
					title: "Note",
					markdown: "",
					created: "2026-04-23T10:00:00.000Z",
					updated: "2026-04-23T10:00:00.000Z",
					word_count: 0,
					character_count: 0,
					line_count: 1,
					reading_time_minutes: 1,
					backlinks: [],
				});
			}
			if (command === "backlinks") {
				return Promise.resolve([]);
			}
			if (command === "note_relationships") {
				return Promise.resolve([]);
			}
			if (command === "note_frontmatter_parse_properties") {
				return Promise.resolve([]);
			}
			if (command === "task_summary") {
				return Promise.resolve({ total: 0, completed: 0 });
			}
			throw new Error(`Unexpected command: ${command}`);
		});

		await act(async () => {
			root.render(
				<MarkdownEditorPane
					relPath="notes/status.md"
					initialDoc={makeDoc("notes/status.md", "seed text")}
				/>,
			);
		});

		const infoButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.getAttribute("aria-label") === "Open info",
		);
		expect(infoButton).not.toBeNull();
		await act(async () => {
			infoButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(container.textContent).toContain("Save status");
		expect(container.textContent).toContain("Saved");

		const changeButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("Type latest text"),
		);
		expect(changeButton).not.toBeNull();

		await act(async () => {
			changeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(container.textContent).toContain("Edited");

		await act(async () => {
			vi.advanceTimersByTime(900);
		});

		expect(container.textContent).toContain("Saving");

		await act(async () => {
			resolveWrite?.({ etag: "notes/status.md-saved", mtime_ms: 2 });
			await Promise.resolve();
		});

		expect(container.textContent).toContain("Saved");
	});
});
