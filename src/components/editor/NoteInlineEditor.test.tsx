// @vitest-environment jsdom

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoteInlineEditor } from "./NoteInlineEditor";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { defaultValue?: string }) =>
			options?.defaultValue ?? key,
	}),
}));

const {
	chainCommands,
	emitEditorEvent,
	getColorfulHeadings,
	mockEditor,
	setColorfulHeadings,
	setShowFrontmatterInEditor,
	getShowFrontmatterInEditor,
	setFrontmatter,
	getFrontmatter,
	useNoteEditorMock,
} = vi.hoisted(() => {
	const listeners = new Map<string, Set<() => void>>();
	let colorfulHeadings = false;
	let showFrontmatterInEditor = false;
	let frontmatter: string | null = null;
	const chainCommands = {
		addColumnAfter: vi.fn(() => chainCommands),
		addColumnBefore: vi.fn(() => chainCommands),
		addRowAfter: vi.fn(() => chainCommands),
		addRowBefore: vi.fn(() => chainCommands),
		deleteColumn: vi.fn(() => chainCommands),
		deleteRow: vi.fn(() => chainCommands),
		focus: vi.fn(() => chainCommands),
		run: vi.fn(() => true),
		updateAttributes: vi.fn(() => chainCommands),
	};
	const mockEditor = {
		isEditable: true,
		chain: vi.fn(() => chainCommands),
		can: vi.fn(() => ({
			deleteRow: () => true,
			deleteColumn: () => true,
		})),
		commands: {
			refreshMermaidPreviews: vi.fn(),
			setNoteSearch: vi.fn(),
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
		setColorfulHeadings(value: boolean) {
			colorfulHeadings = value;
		},
		setShowFrontmatterInEditor(value: boolean) {
			showFrontmatterInEditor = value;
		},
		getShowFrontmatterInEditor() {
			return showFrontmatterInEditor;
		},
		setFrontmatter(value: string | null) {
			frontmatter = value;
		},
		useNoteEditorMock: vi.fn(),
		getColorfulHeadings() {
			return colorfulHeadings;
		},
		getFrontmatter() {
			return frontmatter;
		},
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

vi.mock("./math/loadMathExtensions", () => ({
	loadMathExtensionFactory: vi.fn(async () => () => []),
}));

vi.mock("./hooks/useResetScrollOnChange", () => ({
	useResetScrollOnChange: () => {},
}));

vi.mock("./markdown/editorEvents", () => ({
	dispatchInternalAnchorClick: vi.fn(),
	dispatchMarkdownLinkClick: vi.fn(),
	dispatchWikiLinkClick: vi.fn(),
}));

vi.mock("./markdown/wikiLinkCodec", () => ({
	parseWikiLink: vi.fn(() => null),
}));

vi.mock("./extensions/codeBlockHighlighting", () => ({
	getCodeBlockLanguageOptions: () => [],
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

vi.mock("../ui/shadcn/dialog", () => ({
	Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DialogDescription: ({ children }: { children: React.ReactNode }) => (
		<p>{children}</p>
	),
	DialogFooter: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DialogHeader: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	DialogTitle: ({ children }: { children: React.ReactNode }) => (
		<h2>{children}</h2>
	),
}));

vi.mock("../ui/shadcn/input", () => ({
	Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
		<input {...props} />
	),
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

vi.mock("../ui/shadcn/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => (
		<div data-testid="dropdown-menu">{children}</div>
	),
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
		<div role="menu" data-slot="dropdown-menu-content">
			{children}
		</div>
	),
	DropdownMenuItem: ({
		children,
		onSelect,
		disabled,
	}: {
		children: React.ReactNode;
		onSelect?: () => void;
		disabled?: boolean;
	}) => (
		<button
			type="button"
			role="menuitem"
			data-slot="dropdown-menu-item"
			disabled={disabled}
			onClick={() => {
				if (!disabled) onSelect?.();
			}}
		>
			{children}
		</button>
	),
	DropdownMenuSeparator: () => <hr />,
}));

describe("NoteInlineEditor table controls", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.resetAllMocks();
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
		setColorfulHeadings(false);
		setShowFrontmatterInEditor(false);
		setFrontmatter(null);
		mockEditor.isEditable = true;
		chainCommands.run.mockReturnValue(true);
		useNoteEditorMock.mockImplementation(() => ({
			body: "",
			colorfulHeadings: getColorfulHeadings(),
			editor: mockEditor,
			frontmatter: getFrontmatter(),
			showFrontmatterInEditor: getShowFrontmatterInEditor(),
			frontmatterRef: { current: getFrontmatter() },
			lastAppliedBodyRef: { current: "" },
			lastEmittedMarkdownRef: { current: "" },
		}));

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
				<NoteInlineEditor
					markdown=""
					mode={mode}
					onChange={() => {}}
					relPath=""
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

	async function syncSelection(text: string) {
		await act(async () => {
			setSelectionInText(text);
			document.dispatchEvent(new Event("selectionchange"));
			emitEditorEvent("selectionUpdate");
		});
		await flushRaf();
	}

	it("shows icon-only row and column controls when selection is inside a table", async () => {
		render("rich");

		await syncSelection("Ada");

		expect(container.querySelector('[data-axis="row"]')).toBeInstanceOf(
			HTMLButtonElement,
		);
		expect(container.querySelector('[data-axis="column"]')).toBeInstanceOf(
			HTMLButtonElement,
		);
	});

	it("hides table controls when selection moves outside the table", async () => {
		render("rich");

		await syncSelection("Ada");
		expect(container.querySelector('[data-axis="row"]')).toBeTruthy();

		await syncSelection("Outside table");
		expect(container.querySelector('[data-axis="row"]')).toBeNull();
		expect(container.querySelector('[data-axis="column"]')).toBeNull();
	});

	it("hides table controls in preview mode", async () => {
		render("preview");
		await flushRaf();
		expect(container.querySelector('[data-axis="row"]')).toBeNull();
		expect(container.querySelector('[data-axis="column"]')).toBeNull();
	});

	it("adds the colorful heading attribute in rich mode when enabled", () => {
		setColorfulHeadings(true);

		render("rich");

		const host = container.querySelector(".tiptapHostInline");
		expect(host?.getAttribute("data-colorful-headings")).toBe("true");
	});

	it("keeps the colorful heading attribute off in preview mode", () => {
		setColorfulHeadings(true);

		render("preview");

		const host = container.querySelector(".tiptapHostInline");
		expect(host?.getAttribute("data-colorful-headings")).toBeNull();
	});

	it("runs the correct TipTap commands when the inline menu items are selected", async () => {
		render("rich");

		await syncSelection("Ada");

		const rowMenu = container
			.querySelector('[data-axis="row"]')
			?.closest('[data-testid="dropdown-menu"]');
		const addRowBelow = Array.from(
			rowMenu?.querySelectorAll('[data-slot="dropdown-menu-item"]') ?? [],
		).find((element) => element.textContent === "Add row below") as
			| HTMLButtonElement
			| undefined;
		expect(addRowBelow).toBeTruthy();

		await act(async () => {
			addRowBelow?.click();
		});
		expect(chainCommands.focus).toHaveBeenCalledWith(null, {
			scrollIntoView: false,
		});
		expect(chainCommands.addRowAfter).toHaveBeenCalled();
		expect(chainCommands.run).toHaveBeenCalled();

		chainCommands.focus.mockClear();
		chainCommands.run.mockClear();

		const columnMenu = container
			.querySelector('[data-axis="column"]')
			?.closest('[data-testid="dropdown-menu"]');
		const addColumnRight = Array.from(
			columnMenu?.querySelectorAll('[data-slot="dropdown-menu-item"]') ?? [],
		).find((element) => element.textContent === "Add column right") as
			| HTMLButtonElement
			| undefined;
		expect(addColumnRight).toBeTruthy();

		await act(async () => {
			addColumnRight?.click();
		});
		expect(chainCommands.focus).toHaveBeenCalledWith(null, {
			scrollIntoView: false,
		});
		expect(chainCommands.addColumnAfter).toHaveBeenCalled();
		expect(chainCommands.run).toHaveBeenCalled();
	});

	it("keeps frontmatter hidden by default for new notes", () => {
		setShowFrontmatterInEditor(false);
		setFrontmatter(null);

		render("rich");

		expect(container.querySelector(".frontmatterPreview")).toBeNull();
	});

	it("shows and hides existing frontmatter based on the toggle across rerender", () => {
		setFrontmatter("---\ntitle: Existing\n---\n");
		setShowFrontmatterInEditor(false);

		render("rich");
		expect(container.querySelector(".frontmatterPreview")).toBeNull();

		setShowFrontmatterInEditor(true);
		render("rich");
		expect(container.querySelector(".frontmatterPreview")).toBeInstanceOf(
			HTMLDivElement,
		);
	});

	it("applies persisted frontmatter visibility after restart remount", () => {
		setFrontmatter("---\ntitle: Persisted\n---\n");
		setShowFrontmatterInEditor(true);

		render("rich");
		expect(container.querySelector(".frontmatterPreview")).toBeInstanceOf(
			HTMLDivElement,
		);

		act(() => {
			root.unmount();
		});
		root = createRoot(container);

		render("rich");
		expect(container.querySelector(".frontmatterPreview")).toBeInstanceOf(
			HTMLDivElement,
		);
	});
});
