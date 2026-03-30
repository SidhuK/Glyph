// @vitest-environment jsdom

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasNoteInlineEditor } from "./CanvasNoteInlineEditor";

const { chainCommands, emitEditorEvent, mockEditor, useNoteEditorMock } =
	vi.hoisted(() => {
		const listeners = new Map<string, Set<() => void>>();
		const chainCommands = {
			addColumnAfter: vi.fn(() => chainCommands),
			addRowAfter: vi.fn(() => chainCommands),
			focus: vi.fn(() => chainCommands),
			run: vi.fn(() => true),
			updateAttributes: vi.fn(() => chainCommands),
		};
		const mockEditor = {
			isEditable: true,
			chain: vi.fn(() => chainCommands),
			commands: {
				refreshMermaidPreviews: vi.fn(),
				setActiveMermaidPreview: vi.fn(),
				setRichMermaidPreviewHeight: vi.fn(),
			},
			off: vi.fn((event: string, callback: () => void) => {
				listeners.get(event)?.delete(callback);
			}),
			on: vi.fn((event: string, callback: () => void) => {
				if (!listeners.has(event)) {
					listeners.set(event, new Set());
				}
				listeners.get(event)?.add(callback);
			}),
		};

		return {
			chainCommands,
			emitEditorEvent(event: string) {
				for (const callback of listeners.get(event) ?? []) {
					callback();
				}
			},
			mockEditor,
			useNoteEditorMock: vi.fn(),
		};
	});

// React 19 expects tests to opt into act-aware scheduling.
(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@hugeicons/react", () => ({
	HugeiconsIcon: () => <span data-icon="hugeicons" />,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: vi.fn(),
}));

vi.mock("@tiptap/react", () => ({
	EditorContent: () => (
		<div className="ProseMirror" contentEditable suppressContentEditableWarning>
			<table>
				<tbody>
					<tr>
						<th>
							<p>Name</p>
						</th>
						<th>
							<p>Role</p>
						</th>
					</tr>
					<tr>
						<td>
							<p>Ada</p>
						</td>
						<td>
							<p>Engineer</p>
						</td>
					</tr>
				</tbody>
			</table>
			<p>Outside table</p>
		</div>
	),
}));

vi.mock("motion/react", () => ({
	AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../../lib/tauri", () => ({
	invoke: vi.fn(),
}));

vi.mock("./EditorRibbon", () => ({
	EditorRibbon: () => null,
}));

vi.mock("./NotePropertiesPanel", () => ({
	NotePropertiesPanel: () => null,
}));

vi.mock("./hooks/useNoteEditor", () => ({
	useNoteEditor: useNoteEditorMock,
}));

vi.mock("./hooks/useResetScrollOnChange", () => ({
	useResetScrollOnChange: () => {},
}));

vi.mock("./markdown/editorEvents", () => ({
	dispatchMarkdownLinkClick: vi.fn(),
	dispatchWikiLinkClick: vi.fn(),
}));

vi.mock("./markdown/wikiLinkCodec", () => ({
	parseWikiLink: vi.fn(() => null),
}));

vi.mock("./extensions/codeBlockHighlighting", () => ({
	CODE_BLOCK_LANGUAGE_OPTIONS: [],
	getCodeBlockLanguageLabel: () => "Plain text",
	normalizeCodeBlockLanguage: () => "plaintext",
}));

vi.mock("../ui/shadcn/button", () => ({
	Button: ({
		children,
		type = "button",
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button type={type} {...props}>
			{children}
		</button>
	),
}));

vi.mock("../ui/shadcn/calendar", () => ({
	Calendar: () => null,
}));

vi.mock("../ui/shadcn/popover", () => ({
	Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	PopoverContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
}));

describe("CanvasNoteInlineEditor table controls", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.useFakeTimers();
		let nextAnimationFrameId = 0;
		const rafTimeouts = new Map<number, number>();
		vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
			const id = ++nextAnimationFrameId;
			const timeoutId = window.setTimeout(() => {
				rafTimeouts.delete(id);
				callback(performance.now());
			}, 16);
			rafTimeouts.set(id, timeoutId);
			return id;
		});
		vi.stubGlobal("cancelAnimationFrame", (id: number) => {
			const timeoutId = rafTimeouts.get(id);
			if (timeoutId === undefined) return;
			window.clearTimeout(timeoutId);
			rafTimeouts.delete(id);
		});
		globalThis.ResizeObserver = class {
			disconnect() {}
			observe() {}
			unobserve() {}
		} as typeof ResizeObserver;
		mockEditor.isEditable = true;
		mockEditor.chain.mockClear();
		mockEditor.on.mockClear();
		mockEditor.off.mockClear();
		mockEditor.commands.refreshMermaidPreviews.mockReset();
		mockEditor.commands.setActiveMermaidPreview.mockReset();
		mockEditor.commands.setRichMermaidPreviewHeight.mockReset();
		chainCommands.focus.mockClear();
		chainCommands.addRowAfter.mockClear();
		chainCommands.addColumnAfter.mockClear();
		chainCommands.run.mockReset();
		chainCommands.run.mockReturnValue(true);
		useNoteEditorMock.mockReturnValue({
			body: "",
			editor: mockEditor,
			frontmatter: null,
			frontmatterRef: { current: null },
			lastAppliedBodyRef: { current: "" },
			lastEmittedMarkdownRef: { current: "" },
		});

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		window.getSelection()?.removeAllRanges();
		vi.clearAllTimers();
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	function render(mode: "plain" | "rich" | "preview" = "rich") {
		act(() => {
			root.render(
				<CanvasNoteInlineEditor
					markdown=""
					mode={mode}
					onChange={() => {}}
					onModeChange={() => {}}
					relPath=""
					showBacklinks={false}
				/>,
			);
		});
	}

	function setSelectionInText(text: string) {
		const target = Array.from(container.querySelectorAll("p")).find(
			(node) => node.textContent === text,
		)?.firstChild;
		expect(target).toBeTruthy();
		const selection = window.getSelection();
		const range = document.createRange();
		range.setStart(target as Node, 0);
		range.collapse(true);
		selection?.removeAllRanges();
		selection?.addRange(range);
	}

	async function flushRaf() {
		await act(async () => {
			await vi.advanceTimersByTimeAsync(16);
		});
	}

	it("shows icon-only row and column controls when selection is inside a table", async () => {
		render("rich");

		await act(async () => {
			setSelectionInText("Ada");
			document.dispatchEvent(new Event("selectionchange"));
			emitEditorEvent("selectionUpdate");
		});
		await flushRaf();

		expect(container.querySelector('[data-axis="row"]')).toBeInstanceOf(
			HTMLButtonElement,
		);
		expect(container.querySelector('[data-axis="column"]')).toBeInstanceOf(
			HTMLButtonElement,
		);
	});

	it("hides table controls when selection moves outside the table or rich mode is off", async () => {
		render("rich");

		await act(async () => {
			setSelectionInText("Ada");
			document.dispatchEvent(new Event("selectionchange"));
		});
		await flushRaf();
		expect(container.querySelector('[data-axis="row"]')).toBeTruthy();

		await act(async () => {
			setSelectionInText("Outside table");
			document.dispatchEvent(new Event("selectionchange"));
		});
		await flushRaf();
		expect(container.querySelector('[data-axis="row"]')).toBeNull();
		expect(container.querySelector('[data-axis="column"]')).toBeNull();

		render("preview");
		await act(async () => {
			setSelectionInText("Ada");
			document.dispatchEvent(new Event("selectionchange"));
		});
		await flushRaf();
		expect(container.querySelector('[data-axis="row"]')).toBeNull();
		expect(container.querySelector('[data-axis="column"]')).toBeNull();
	});

	it("runs the correct TipTap commands when the inline icons are clicked", async () => {
		render("rich");

		await act(async () => {
			setSelectionInText("Ada");
			document.dispatchEvent(new Event("selectionchange"));
		});
		await flushRaf();

		const rowButton = container.querySelector(
			'[data-axis="row"]',
		) as HTMLButtonElement | null;
		const columnButton = container.querySelector(
			'[data-axis="column"]',
		) as HTMLButtonElement | null;
		expect(rowButton).toBeTruthy();
		expect(columnButton).toBeTruthy();

		await act(async () => {
			rowButton?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
			rowButton?.click();
		});
		expect(chainCommands.focus).toHaveBeenCalledWith(undefined, {
			scrollIntoView: false,
		});
		expect(chainCommands.addRowAfter).toHaveBeenCalled();
		expect(chainCommands.run).toHaveBeenCalled();

		chainCommands.focus.mockClear();
		chainCommands.run.mockClear();

		await act(async () => {
			columnButton?.dispatchEvent(
				new MouseEvent("mousedown", { bubbles: true }),
			);
			columnButton?.click();
		});
		expect(chainCommands.focus).toHaveBeenCalledWith(undefined, {
			scrollIntoView: false,
		});
		expect(chainCommands.addColumnAfter).toHaveBeenCalled();
		expect(chainCommands.run).toHaveBeenCalled();
	});
});
