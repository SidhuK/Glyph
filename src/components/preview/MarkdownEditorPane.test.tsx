// @vitest-environment jsdom

import { type ButtonHTMLAttributes, act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORCE_NOTE_EDIT_MODE_EVENT } from "../../lib/appEvents";
import { MarkdownEditorPane } from "./MarkdownEditorPane";

const {
	noteInlineEditorMock,
	localNoteGraphDialogMock,
	invokeMock,
	mockZenModeState,
} = vi.hoisted(() => ({
	noteInlineEditorMock: vi.fn(),
	localNoteGraphDialogMock: vi.fn(),
	invokeMock: vi.fn(),
	mockZenModeState: { active: false },
}));

// React 19 expects tests to opt into act-aware scheduling.
(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../contexts", () => ({
	useAISidebarContext: () => ({ aiEnabled: false, aiPanelOpen: false }),
	useEditorRegistration: () => {},
	useSpace: () => ({ spacePath: "/spaces/test" }),
	useUILayoutContext: () => ({
		showToc: false,
		zenModeActive: mockZenModeState.active,
	}),
}));

vi.mock("../../lib/tauri", () => ({
	invoke: invokeMock,
}));

vi.mock("../../lib/tauriEvents", () => ({
	useTauriEvent: () => {},
}));

vi.mock("motion/react", () => ({
	AnimatePresence: ({ children }: { children: unknown }) => children,
	m: {
		div: ({
			initial: _initial,
			animate: _animate,
			exit: _exit,
			transition: _transition,
			...props
		}: React.HTMLAttributes<HTMLDivElement> & {
			initial?: unknown;
			animate?: unknown;
			exit?: unknown;
			transition?: unknown;
		}) => <div {...props} />,
	},
	useReducedMotion: () => true,
}));

vi.mock("../editor/NoteInlineEditor", () => ({
	NoteInlineEditor: ({
		onChange,
		mode,
		pasteMarkdownBehavior,
		zenModeActive,
	}: {
		onChange: (nextText: string) => void;
		mode: "plain" | "rich" | "preview";
		pasteMarkdownBehavior?: "plain-text" | "smart-markdown";
		zenModeActive?: boolean;
	}) => (
		<button
			type="button"
			onClick={() => onChange("latest typed text")}
			data-paste-markdown-behavior={pasteMarkdownBehavior}
			data-mode={mode}
			data-zen-mode={zenModeActive ? "true" : "false"}
			ref={() => {
				noteInlineEditorMock({
					mode,
					pasteMarkdownBehavior,
					zenModeActive,
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

vi.mock("../graph/LocalNoteGraphDialog", () => ({
	LocalNoteGraphDialog: ({
		open,
		noteId,
		graphRefreshKey,
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		noteId: string;
		graphRefreshKey?: number;
	}) => {
		localNoteGraphDialogMock({ open, noteId, graphRefreshKey });
		return open ? <div data-testid="local-note-graph">Local graph</div> : null;
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

vi.mock("../ui/shadcn/button", () => ({
	Button: ({
		children,
		type,
		...props
	}: ButtonHTMLAttributes<HTMLButtonElement> & {
		variant?: string;
		size?: string;
		asChild?: boolean;
	}) => (
		<button type={type ?? "button"} {...props}>
			{children}
		</button>
	),
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
			| [
					command: "note_frontmatter_parse_properties",
					params: { frontmatter?: string | null },
			  ]
			| [command: "databases_preview_context", params: { note_path: string }]
			| [command: "task_summary", params: { markdown: string }]
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
		if (command === "task_summary") {
			return Promise.resolve({
				total_count: 0,
				completed_count: 0,
				open_count: 0,
			});
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
		if (command === "note_frontmatter_parse_properties") {
			return Promise.resolve([]);
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
		mockZenModeState.active = false;
		globalThis.ResizeObserver = class {
			disconnect() {}
			observe() {}
			unobserve() {}
		} as typeof ResizeObserver;
		invokeMock.mockReset();
		invokeMock.mockImplementation(mockInvoke);
		noteInlineEditorMock.mockReset();
		localNoteGraphDialogMock.mockReset();

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
			zenModeActive: false,
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
			if (command === "task_summary") {
				return Promise.resolve({
					total_count: 0,
					completed_count: 0,
					open_count: 0,
				});
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
			if (command === "note_frontmatter_parse_properties") {
				return Promise.resolve([]);
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

		const actionsButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.getAttribute("aria-label")?.includes("editor actions"),
		);
		expect(actionsButton).not.toBeNull();
		await act(async () => {
			actionsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		const infoButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.trim() === "Info",
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

	it("hides note chrome while zen mode is active", async () => {
		mockZenModeState.active = true;

		await act(async () => {
			root.render(
				<MarkdownEditorPane
					relPath="notes/zen.md"
					initialDoc={makeDoc("notes/zen.md", "seed text")}
				/>,
			);
		});

		expect(
			container
				.querySelector(".markdownEditorFloatActions")
				?.classList.contains("is-zen-hidden"),
		).toBe(true);
		expect(container.querySelector(".markdownEditorPaneZen")).toBeTruthy();
		expect(noteInlineEditorMock).toHaveBeenCalledWith({
			mode: "rich",
			pasteMarkdownBehavior: "smart-markdown",
			zenModeActive: true,
		});
	});

	it("switches the active note back to rich mode when zen mode requests edit mode", async () => {
		await act(async () => {
			root.render(
				<MarkdownEditorPane
					relPath="notes/raw.md"
					initialDoc={makeDoc("notes/raw.md", "seed text")}
				/>,
			);
		});

		const actionsButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.getAttribute("aria-label")?.includes("editor actions"),
		);
		expect(actionsButton).not.toBeNull();

		await act(async () => {
			actionsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		const rawModeButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("Raw"),
		);
		expect(rawModeButton).not.toBeNull();

		await act(async () => {
			rawModeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		const editorButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("Type latest text"),
		);
		expect(editorButton?.getAttribute("data-mode")).toBe("plain");

		await act(async () => {
			window.dispatchEvent(
				new CustomEvent(FORCE_NOTE_EDIT_MODE_EVENT, {
					detail: { path: "notes/raw.md" },
				}),
			);
		});

		expect(editorButton?.getAttribute("data-mode")).toBe("rich");
	});

	it("opens the local graph from the actions menu", async () => {
		await act(async () => {
			root.render(
				<MarkdownEditorPane
					relPath="notes/graph.md"
					initialDoc={makeDoc("notes/graph.md", "seed text", 7)}
				/>,
			);
		});

		const actionsButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.getAttribute("aria-label")?.includes("editor actions"),
		);
		expect(actionsButton).not.toBeNull();

		await act(async () => {
			actionsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		const graphButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("Local graph"),
		);
		expect(graphButton).not.toBeNull();

		await act(async () => {
			graphButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(
			container.querySelector('[data-testid="local-note-graph"]'),
		).toBeTruthy();
		expect(localNoteGraphDialogMock).toHaveBeenLastCalledWith(
			expect.objectContaining({
				open: true,
				noteId: "notes/graph.md",
				graphRefreshKey: 7,
			}),
		);
	});
});
