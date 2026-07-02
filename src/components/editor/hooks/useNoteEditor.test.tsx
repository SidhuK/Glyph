// @vitest-environment jsdom

import { Extension, type Extensions } from "@tiptap/core";
import { act, useEffect } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AttachmentStorageMode } from "../../../lib/settings";
import { useNoteEditor } from "./useNoteEditor";

const {
	canCommands,
	chainCommands,
	emitSettingsUpdated,
	getActiveEditor,
	getEditorOptions,
	invokeMock,
	loadSettingsMock,
	mockEditor,
	openUrlMock,
	parseMock,
	setActiveEditor,
	setEditorOptions,
	setSettingsUpdatedHandler,
} = vi.hoisted(() => {
	let editorOptions: Record<string, unknown> | null = null;
	let settingsUpdatedHandler:
		| ((payload: {
				editor?: {
					attachmentFolder?: string | null;
					attachmentStorageMode?: AttachmentStorageMode;
					colorfulHeadings?: boolean;
					enablePeopleMentionsAsTags?: boolean;
					showFrontmatterInEditor?: boolean;
					showCollapsibleHeadings?: boolean;
				};
		  }) => void)
		| null = null;
	const chainCommands = {
		focus: vi.fn(() => chainCommands),
		insertContentAt: vi.fn(() => chainCommands),
		run: vi.fn(() => true),
	};
	const canCommands = {
		insertContentAt: vi.fn(() => true),
	};
	const mockEditor = {
		isEditable: true,
		isActive: vi.fn(() => false),
		setEditable: vi.fn(),
		getMarkdown: vi.fn(),
		chain: vi.fn(() => chainCommands),
		can: vi.fn(() => canCommands),
		commands: {
			setContent: vi.fn(),
			setHeadingCollapseEnabled: vi.fn(),
			setTextSelection: vi.fn(() => true),
		},
		state: {
			selection: {
				from: 2,
				to: 4,
			},
			tr: {
				delete: vi.fn(),
				insertText: vi.fn(function insertText() {
					return mockEditor.state.tr;
				}),
				replaceWith: vi.fn(),
				scrollIntoView: vi.fn(function scrollIntoView() {
					return mockEditor.state.tr;
				}),
				setSelection: vi.fn(function setSelection() {
					return mockEditor.state.tr;
				}),
				setNodeMarkup: vi.fn(),
			},
			doc: {
				content: {
					size: 42,
				},
				descendants: vi.fn(),
				resolve: vi.fn((pos: number) => ({ pos })),
			},
			schema: {
				nodes: {
					paragraph: {
						create: vi.fn(() => ({})),
					},
				},
				text: vi.fn(() => ({})),
			},
		},
		view: {
			dispatch: vi.fn(),
			focus: vi.fn(),
			hasFocus: vi.fn(() => false),
			posAtDOM: vi.fn(),
			state: undefined as unknown,
		},
	};
	mockEditor.view.state = mockEditor.state;
	let activeEditor = mockEditor;
	const parseMock = vi.fn(() => ({
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "text",
						text: "bold",
						marks: [{ type: "bold" }],
					},
				],
			},
		],
	}));

	return {
		canCommands,
		chainCommands,
		emitSettingsUpdated: (payload: {
			editor?: {
				attachmentFolder?: string | null;
				attachmentStorageMode?: AttachmentStorageMode;
				colorfulHeadings?: boolean;
				enablePeopleMentionsAsTags?: boolean;
				showFrontmatterInEditor?: boolean;
				showCollapsibleHeadings?: boolean;
			};
		}) => settingsUpdatedHandler?.(payload),
		getEditorOptions: () => editorOptions,
		invokeMock: vi.fn(),
		loadSettingsMock: vi.fn(() =>
			Promise.resolve({
				editor: {
					attachmentFolder: "assets",
					attachmentStorageMode: "specific-folder",
					colorfulHeadings: false,
					showCollapsibleHeadings: false,
					showFrontmatterInEditor: false,
					enablePeopleMentionsAsTags: false,
				},
			}),
		),
		mockEditor,
		openUrlMock: vi.fn(),
		parseMock,
		setActiveEditor: (editor: typeof mockEditor) => {
			activeEditor = editor;
		},
		setEditorOptions: (options: Record<string, unknown>) => {
			editorOptions = options;
		},
		getActiveEditor: () => activeEditor,
		setSettingsUpdatedHandler: (handler: typeof settingsUpdatedHandler) => {
			settingsUpdatedHandler = handler;
		},
	};
});

const MARKDOWN_SYNC_DEBOUNCE_MS = 300;

// React 19 expects tests to opt into act-aware scheduling.
(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: openUrlMock,
}));

vi.mock("@tiptap/markdown", () => ({
	MarkdownManager: class {
		parse = parseMock;
	},
}));

vi.mock("@tiptap/react", () => ({
	useEditor: (options: Record<string, unknown>) => {
		setEditorOptions(options);
		return getActiveEditor();
	},
}));

vi.mock("../extensions", () => ({
	createEditorExtensions: () => [],
}));

vi.mock("../../../lib/settings", () => ({
	loadSettings: loadSettingsMock,
}));

vi.mock("../../../lib/tauri", () => ({
	invoke: invokeMock,
}));

vi.mock("../../../lib/tauriEvents", () => ({
	useTauriEvent: (
		event: string,
		handler: (payload: {
			editor?: {
				attachmentFolder?: string | null;
				attachmentStorageMode?: AttachmentStorageMode;
				colorfulHeadings?: boolean;
				enablePeopleMentionsAsTags?: boolean;
				showFrontmatterInEditor?: boolean;
				showCollapsibleHeadings?: boolean;
			};
		}) => void,
	) => {
		if (event === "settings:updated") {
			setSettingsUpdatedHandler(handler);
		}
	},
}));

vi.mock("./useHydrateInlineImages", () => ({
	useHydrateInlineImages: () => {},
}));

function Harness({
	additionalExtensions = [],
	markdown = "keep this line\nremove this line",
	onChange,
	onState,
	pasteMarkdownBehavior = "plain-text",
	relPath = "notes/test.md",
}: {
	additionalExtensions?: Extensions;
	markdown?: string;
	onChange: (nextMarkdown: string) => void;
	onState?: (state: {
		colorfulHeadings: boolean;
		showFrontmatterInEditor: boolean;
	}) => void;
	pasteMarkdownBehavior?: "plain-text" | "smart-markdown";
	relPath?: string;
}) {
	const state = useNoteEditor({
		additionalExtensions,
		markdown,
		mode: "rich",
		relPath,
		pasteMarkdownBehavior,
		onChange,
	});
	useEffect(() => {
		onState?.({
			colorfulHeadings: state.colorfulHeadings,
			showFrontmatterInEditor: state.showFrontmatterInEditor,
		});
	}, [onState, state.colorfulHeadings, state.showFrontmatterInEditor]);
	return null;
}

function createClipboardEvent({
	html = "",
	items = [],
	text = "",
}: {
	html?: string;
	items?: Array<{
		getAsFile: () => File | null;
		type: string;
	}>;
	text?: string;
}) {
	const event = new Event("paste", {
		bubbles: true,
		cancelable: true,
	}) as ClipboardEvent;
	Object.defineProperty(event, "clipboardData", {
		value: {
			getData: (kind: string) => {
				if (kind === "text/plain") return text;
				if (kind === "text/html") return html;
				return "";
			},
			items,
		},
	});
	return event;
}

async function flushImageUploadWork() {
	await Promise.resolve();
	await Promise.resolve();
	await Promise.resolve();
}

async function flushMarkdownSyncWork() {
	await new Promise((resolve) =>
		setTimeout(resolve, MARKDOWN_SYNC_DEBOUNCE_MS + 20),
	);
	await new Promise((resolve) => requestAnimationFrame(resolve));
}

type EditorOptionsWithPaste = {
	editorProps?: {
		handleDOMEvents?: {
			click?: (view: typeof mockEditor.view, event: MouseEvent) => boolean;
			paste?: (view: unknown, event: ClipboardEvent) => boolean;
		};
	};
} | null;

describe("useNoteEditor", () => {
	let container: HTMLDivElement;
	let root: Root;
	let originalClipboardEvent: typeof ClipboardEvent | undefined;
	let originalCreateObjectUrl: typeof URL.createObjectURL;
	let originalRevokeObjectUrl: typeof URL.revokeObjectURL;
	let originalFileReader: typeof FileReader | undefined;

	beforeEach(() => {
		setSettingsUpdatedHandler(null);
		setActiveEditor(mockEditor);
		mockEditor.isEditable = true;
		mockEditor.isActive.mockReset();
		mockEditor.isActive.mockReturnValue(false);
		mockEditor.setEditable.mockReset();
		mockEditor.getMarkdown.mockReset();
		mockEditor.chain.mockClear();
		mockEditor.can.mockClear();
		mockEditor.commands.setContent.mockReset();
		mockEditor.commands.setHeadingCollapseEnabled.mockReset();
		mockEditor.commands.setTextSelection.mockReset();
		mockEditor.commands.setTextSelection.mockReturnValue(true);
		mockEditor.state.doc.content.size = 42;
		mockEditor.state.selection.from = 2;
		mockEditor.state.selection.to = 4;
		mockEditor.state.doc.descendants.mockReset();
		mockEditor.state.doc.descendants.mockImplementation(() => {});
		mockEditor.state.doc.resolve.mockReset();
		mockEditor.state.doc.resolve.mockImplementation((pos: number) => ({ pos }));
		mockEditor.state.tr.insertText.mockReset();
		mockEditor.state.tr.insertText.mockImplementation(function insertText() {
			return mockEditor.state.tr;
		});
		mockEditor.state.tr.scrollIntoView.mockReset();
		mockEditor.state.tr.scrollIntoView.mockImplementation(
			function scrollIntoView() {
				return mockEditor.state.tr;
			},
		);
		mockEditor.state.tr.setSelection.mockReset();
		mockEditor.state.tr.setSelection.mockImplementation(
			function setSelection() {
				return mockEditor.state.tr;
			},
		);
		mockEditor.state.tr.setNodeMarkup.mockReset();
		mockEditor.view.dispatch.mockReset();
		mockEditor.view.focus.mockReset();
		mockEditor.view.hasFocus.mockReset();
		mockEditor.view.hasFocus.mockReturnValue(false);
		mockEditor.view.posAtDOM.mockReset();
		mockEditor.view.posAtDOM.mockImplementation(
			(_node: Node, offset: number) => (offset === 0 ? 5 : 14),
		);
		chainCommands.focus.mockClear();
		chainCommands.insertContentAt.mockClear();
		chainCommands.run.mockReset();
		chainCommands.run.mockReturnValue(true);
		canCommands.insertContentAt.mockReset();
		canCommands.insertContentAt.mockReturnValue(true);
		openUrlMock.mockReset();
		invokeMock.mockReset();
		invokeMock.mockResolvedValue({
			asset_rel_path: "assets/image.png",
			href: "../assets/image.png",
		});
		loadSettingsMock.mockReset();
		loadSettingsMock.mockResolvedValue({
			editor: {
				attachmentFolder: "assets",
				attachmentStorageMode: "specific-folder",
				colorfulHeadings: false,
				showCollapsibleHeadings: false,
				showFrontmatterInEditor: false,
				enablePeopleMentionsAsTags: false,
			},
		});
		parseMock.mockReset();
		parseMock.mockReturnValue({
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "bold",
							marks: [{ type: "bold" }],
						},
					],
				},
			],
		});

		originalClipboardEvent = globalThis.ClipboardEvent;
		globalThis.ClipboardEvent = Event as unknown as typeof ClipboardEvent;

		originalCreateObjectUrl = URL.createObjectURL;
		originalRevokeObjectUrl = URL.revokeObjectURL;
		URL.createObjectURL = vi.fn(() => "blob:preview");
		URL.revokeObjectURL = vi.fn();

		originalFileReader = globalThis.FileReader;
		globalThis.FileReader = class {
			error: Error | null = null;
			onerror: (() => void) | null = null;
			onload: (() => void) | null = null;
			result: string | ArrayBuffer | null = null;

			readAsDataURL(_file: Blob) {
				this.result = "data:image/png;base64,abc";
				this.onload?.();
			}
		} as typeof FileReader;

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		if (originalClipboardEvent) {
			globalThis.ClipboardEvent = originalClipboardEvent;
		} else {
			Reflect.deleteProperty(globalThis, "ClipboardEvent");
		}
		URL.createObjectURL = originalCreateObjectUrl;
		URL.revokeObjectURL = originalRevokeObjectUrl;
		if (originalFileReader) {
			globalThis.FileReader = originalFileReader;
		} else {
			Reflect.deleteProperty(globalThis, "FileReader");
		}
	});

	it("emits the first doc change so single-step deletions are not dropped", async () => {
		const onChange = vi.fn();
		mockEditor.getMarkdown.mockReturnValue("keep this line");

		await act(async () => {
			root.render(<Harness onChange={onChange} />);
		});

		const options = getEditorOptions() as {
			onTransaction?: (payload: {
				editor: typeof mockEditor;
				transaction: { docChanged: boolean };
			}) => void;
		} | null;

		expect(options?.onTransaction).toBeTypeOf("function");

		await act(async () => {
			options?.onTransaction?.({
				editor: mockEditor,
				transaction: { docChanged: true },
			});
		});

		expect(mockEditor.getMarkdown).not.toHaveBeenCalled();

		await act(async () => {
			await flushMarkdownSyncWork();
		});

		expect(onChange).toHaveBeenCalledWith("keep this line");
	});

	it("flushes pending edits with the previous note context when the path changes", async () => {
		const oldOnChange = vi.fn();
		const newOnChange = vi.fn();
		mockEditor.getMarkdown.mockReturnValue("typed old body");

		await act(async () => {
			root.render(
				<Harness
					markdown={"---\ntitle: Old\n---\nold body"}
					relPath="notes/old.md"
					onChange={oldOnChange}
				/>,
			);
		});

		const options = getEditorOptions() as {
			onTransaction?: (payload: {
				editor: typeof mockEditor;
				transaction: { docChanged: boolean };
			}) => void;
		} | null;

		await act(async () => {
			options?.onTransaction?.({
				editor: mockEditor,
				transaction: { docChanged: true },
			});
		});

		await act(async () => {
			root.render(
				<Harness
					markdown={"---\ntitle: New\n---\nnew body"}
					relPath="notes/new.md"
					onChange={newOnChange}
				/>,
			);
		});

		expect(oldOnChange).toHaveBeenCalledWith(
			"---\ntitle: Old\n---\ntyped old body",
		);
		expect(newOnChange).not.toHaveBeenCalled();

		await act(async () => {
			await flushMarkdownSyncWork();
		});

		expect(newOnChange).not.toHaveBeenCalled();
	});

	it("seeds a recreated editor from the pending same-note document", async () => {
		const onChange = vi.fn();
		const firstExtension = Extension.create({ name: "first-extension" });
		const secondExtension = Extension.create({ name: "second-extension" });
		mockEditor.getMarkdown.mockReturnValue("latest pending body");

		await act(async () => {
			root.render(
				<Harness additionalExtensions={[firstExtension]} onChange={onChange} />,
			);
		});

		const initialOptions = getEditorOptions() as {
			onTransaction?: (payload: {
				editor: typeof mockEditor;
				transaction: { docChanged: boolean };
			}) => void;
		} | null;

		await act(async () => {
			initialOptions?.onTransaction?.({
				editor: mockEditor,
				transaction: { docChanged: true },
			});
		});

		await act(async () => {
			root.render(
				<Harness
					additionalExtensions={[secondExtension]}
					onChange={onChange}
				/>,
			);
		});

		const recreatedOptions = getEditorOptions() as { content?: string } | null;
		expect(recreatedOptions?.content).toBe("latest pending body");
		expect(onChange).toHaveBeenCalledWith("latest pending body");
	});

	it("restores the focused selection after recreating the editor", async () => {
		const onChange = vi.fn();
		const firstExtension = Extension.create({ name: "first-extension" });
		const secondExtension = Extension.create({ name: "second-extension" });
		const nextEditor = {
			...mockEditor,
			commands: {
				...mockEditor.commands,
				setTextSelection: vi.fn(() => true),
			},
			state: {
				...mockEditor.state,
				doc: {
					...mockEditor.state.doc,
					content: { size: 5 },
				},
			},
			view: {
				...mockEditor.view,
				focus: vi.fn(),
				hasFocus: vi.fn(() => false),
			},
		};
		nextEditor.view.state = nextEditor.state;

		await act(async () => {
			root.render(
				<Harness additionalExtensions={[firstExtension]} onChange={onChange} />,
			);
		});

		mockEditor.state.selection.from = 12;
		mockEditor.state.selection.to = 12;
		mockEditor.view.hasFocus.mockReturnValue(true);
		setActiveEditor(nextEditor as typeof mockEditor);

		await act(async () => {
			root.render(
				<Harness
					additionalExtensions={[secondExtension]}
					onChange={onChange}
				/>,
			);
		});

		expect(nextEditor.commands.setTextSelection).toHaveBeenCalledWith({
			from: 5,
			to: 5,
		});
		expect(nextEditor.view.focus).toHaveBeenCalled();
	});

	it("restores the focused selection after replacing editor content", async () => {
		const onChange = vi.fn();

		await act(async () => {
			root.render(<Harness markdown="first body" onChange={onChange} />);
		});

		mockEditor.state.doc.content.size = 8;
		mockEditor.state.selection.from = 3;
		mockEditor.state.selection.to = 3;
		mockEditor.view.hasFocus.mockReturnValue(true);

		await act(async () => {
			root.render(<Harness markdown="changed body" onChange={onChange} />);
		});

		expect(mockEditor.commands.setContent).toHaveBeenCalledWith(
			"changed body",
			{
				contentType: "markdown",
			},
		);
		expect(mockEditor.commands.setTextSelection).toHaveBeenCalledWith({
			from: 3,
			to: 3,
		});
		expect(mockEditor.view.focus).toHaveBeenCalled();
	});

	it("does not crash when the editor view is unavailable during content replacement", async () => {
		const onChange = vi.fn();
		const editorWithoutMountedView = { ...mockEditor };
		Object.defineProperty(editorWithoutMountedView, "view", {
			get: () => {
				throw new Error("view unavailable");
			},
		});
		setActiveEditor(editorWithoutMountedView as typeof mockEditor);

		await act(async () => {
			root.render(<Harness markdown="first body" onChange={onChange} />);
		});

		await act(async () => {
			root.render(<Harness markdown="changed body" onChange={onChange} />);
		});

		expect(mockEditor.commands.setContent).toHaveBeenCalledWith(
			"changed body",
			{
				contentType: "markdown",
			},
		);
	});

	it("does not crash when the editor view is unavailable during cleanup", async () => {
		const onChange = vi.fn();
		const firstExtension = Extension.create({ name: "first-extension" });
		const secondExtension = Extension.create({ name: "second-extension" });
		const editorWithoutMountedView = { ...mockEditor };
		Object.defineProperty(editorWithoutMountedView, "view", {
			get: () => {
				throw new Error("view unavailable");
			},
		});
		setActiveEditor(editorWithoutMountedView as typeof mockEditor);

		await act(async () => {
			root.render(
				<Harness additionalExtensions={[firstExtension]} onChange={onChange} />,
			);
		});

		await act(async () => {
			root.render(
				<Harness
					additionalExtensions={[secondExtension]}
					onChange={onChange}
				/>,
			);
		});
	});

	it("tracks colorful headings from settings and live updates", async () => {
		const onChange = vi.fn();
		const onState = vi.fn();

		await act(async () => {
			root.render(<Harness onChange={onChange} onState={onState} />);
		});

		expect(onState).toHaveBeenLastCalledWith({
			colorfulHeadings: false,
			showFrontmatterInEditor: false,
		});

		await act(async () => {
			emitSettingsUpdated({
				editor: { colorfulHeadings: true },
			});
		});

		expect(onState).toHaveBeenLastCalledWith({
			colorfulHeadings: true,
			showFrontmatterInEditor: false,
		});
	});

	it("tracks frontmatter visibility from settings and live updates", async () => {
		const onChange = vi.fn();
		const onState = vi.fn();

		await act(async () => {
			root.render(<Harness onChange={onChange} onState={onState} />);
		});

		expect(onState).toHaveBeenLastCalledWith({
			colorfulHeadings: false,
			showFrontmatterInEditor: false,
		});

		await act(async () => {
			emitSettingsUpdated({
				editor: { showFrontmatterInEditor: true },
			});
		});

		expect(onState).toHaveBeenLastCalledWith({
			colorfulHeadings: false,
			showFrontmatterInEditor: true,
		});
	});

	it("hydrates frontmatter visibility from persisted settings on mount", async () => {
		const onChange = vi.fn();
		const onState = vi.fn();
		loadSettingsMock.mockResolvedValue({
			editor: {
				attachmentFolder: "assets",
				attachmentStorageMode: "specific-folder",
				colorfulHeadings: false,
				showCollapsibleHeadings: false,
				showFrontmatterInEditor: true,
				enablePeopleMentionsAsTags: false,
			},
		});

		await act(async () => {
			root.render(<Harness onChange={onChange} onState={onState} />);
		});

		expect(onState).toHaveBeenLastCalledWith({
			colorfulHeadings: false,
			showFrontmatterInEditor: true,
		});
	});

	it("intercepts Markdown text paste when smart paste is enabled", async () => {
		const onChange = vi.fn();

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const event = createClipboardEvent({ text: "**bold**" });

		expect(paste?.({}, event)).toBe(true);
		expect(parseMock).toHaveBeenCalledWith("**bold**");
		expect(canCommands.insertContentAt).toHaveBeenCalledWith(
			{ from: 2, to: 4 },
			[
				{
					type: "text",
					text: "bold",
					marks: [{ type: "bold" }],
				},
			],
		);
		expect(chainCommands.insertContentAt).toHaveBeenCalledWith(
			{ from: 2, to: 4 },
			[
				{
					type: "text",
					text: "bold",
					marks: [{ type: "bold" }],
				},
			],
		);
		expect(event.defaultPrevented).toBe(true);
	});

	it("expands internal markdown links into editable markdown text on click", async () => {
		const onChange = vi.fn();

		await act(async () => {
			root.render(<Harness onChange={onChange} />);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const click = options?.editorProps?.handleDOMEvents?.click;
		const link = document.createElement("a");
		link.setAttribute("href", "notes/next.md");
		link.textContent = "Next note";
		const event = new MouseEvent("click", { bubbles: true, cancelable: true });
		Object.defineProperty(event, "target", {
			value: link,
			configurable: true,
		});

		expect(click?.(mockEditor.view, event)).toBe(true);
		expect(event.defaultPrevented).toBe(true);
		expect(mockEditor.view.dispatch).toHaveBeenCalledTimes(1);
		const transaction = mockEditor.view.dispatch.mock.calls[0]?.[0];
		expect(transaction.insertText).toHaveBeenCalledWith(
			"[Next note](notes/next.md)",
			5,
			14,
		);
		expect(mockEditor.view.focus).toHaveBeenCalledTimes(1);
	});

	it("expands external urls into editable markdown text on click", async () => {
		const onChange = vi.fn();

		await act(async () => {
			root.render(<Harness onChange={onChange} />);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const click = options?.editorProps?.handleDOMEvents?.click;
		const link = document.createElement("a");
		link.setAttribute("href", "https://example.com");
		link.textContent = "https://example.com";
		const event = new MouseEvent("click", { bubbles: true, cancelable: true });
		Object.defineProperty(event, "target", {
			value: link,
			configurable: true,
		});

		expect(click?.(mockEditor.view, event)).toBe(true);
		expect(event.defaultPrevented).toBe(true);
		expect(mockEditor.view.dispatch).toHaveBeenCalledTimes(1);
		const transaction = mockEditor.view.dispatch.mock.calls[0]?.[0];
		expect(transaction.insertText).toHaveBeenCalledWith(
			"[https://example.com](https://example.com)",
			5,
			14,
		);
		expect(openUrlMock).not.toHaveBeenCalled();
	});

	it("leaves Markdown text alone when smart paste is not enabled", async () => {
		const onChange = vi.fn();

		await act(async () => {
			root.render(<Harness onChange={onChange} />);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const event = createClipboardEvent({ text: "**bold**" });

		expect(paste?.({}, event)).toBe(false);
		expect(parseMock).not.toHaveBeenCalled();
		expect(chainCommands.insertContentAt).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});

	it("keeps HTML clipboard pastes on the default rich-text path", async () => {
		const onChange = vi.fn();

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const event = createClipboardEvent({
			html: "<p><strong>bold</strong></p>",
			text: "**bold**",
		});

		expect(paste?.({}, event)).toBe(false);
		expect(parseMock).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});

	it("intercepts markdown text when clipboard html mirrors the raw markdown", async () => {
		const onChange = vi.fn();

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const text = "# Smart Markdown Paste\n\n- item";
		const event = createClipboardEvent({
			html: "<pre># Smart Markdown Paste\n\n- item</pre>",
			text,
		});

		expect(paste?.({}, event)).toBe(true);
		expect(parseMock).toHaveBeenCalledWith(text);
		expect(chainCommands.insertContentAt).toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(true);
	});

	it("does not convert Markdown when the selection is inside a code block", async () => {
		const onChange = vi.fn();
		mockEditor.isActive.mockReturnValue(true);

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const event = createClipboardEvent({ text: "**bold**" });

		expect(paste?.({}, event)).toBe(false);
		expect(parseMock).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});

	it("lets the default paste behavior continue when parsed Markdown cannot be inserted", async () => {
		const onChange = vi.fn();
		canCommands.insertContentAt.mockReturnValue(false);

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const event = createClipboardEvent({ text: "**bold**" });

		expect(paste?.({}, event)).toBe(false);
		expect(parseMock).toHaveBeenCalled();
		expect(chainCommands.insertContentAt).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});

	it("lets the default paste behavior continue when smart Markdown insertion fails to run", async () => {
		const onChange = vi.fn();
		chainCommands.run.mockReturnValue(false);

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const event = createClipboardEvent({ text: "**bold**" });

		expect(paste?.({}, event)).toBe(false);
		expect(chainCommands.insertContentAt).toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});

	it("keeps image paste handling ahead of smart Markdown conversion", async () => {
		const onChange = vi.fn();

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const file = new File(["image-bytes"], "paste.png", { type: "image/png" });
		const event = createClipboardEvent({
			text: "**bold**",
			items: [
				{
					type: "image/png",
					getAsFile: () => file,
				},
			],
		});

		expect(paste?.({}, event)).toBe(true);
		expect(parseMock).not.toHaveBeenCalled();
		expect(chainCommands.insertContentAt).toHaveBeenCalledWith(
			{ from: 2, to: 4 },
			[
				{
					type: "image",
					attrs: {
						src: "blob:preview",
						alt: "paste.png",
						title: "",
						originSrc: "",
						uploadId: expect.stringContaining("paste-"),
					},
				},
			],
		);
	});

	it("saves pasted images to the configured specific folder", async () => {
		const onChange = vi.fn();
		loadSettingsMock.mockResolvedValue({
			editor: {
				attachmentFolder: "assets/uploads",
				attachmentStorageMode: "specific-folder",
				colorfulHeadings: false,
				showCollapsibleHeadings: false,
				showFrontmatterInEditor: false,
				enablePeopleMentionsAsTags: false,
			},
		});

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const file = new File(["image-bytes"], "paste.png", { type: "image/png" });
		const event = createClipboardEvent({
			items: [{ type: "image/png", getAsFile: () => file }],
		});
		mockEditor.state.doc.descendants.mockImplementation(
			(
				visit: (
					node: { type: { name: string }; attrs: Record<string, unknown> },
					pos: number,
				) => void,
			) => {
				const insertContentAtCalls = chainCommands.insertContentAt.mock
					.calls as unknown as Array<[unknown, unknown]>;
				const lastInsertCall =
					insertContentAtCalls[insertContentAtCalls.length - 1];
				const insertedNodes = lastInsertCall?.[1] as
					| Array<{ attrs?: { uploadId?: string } }>
					| undefined;
				const uploadId = insertedNodes?.[0]?.attrs?.uploadId;
				if (!uploadId) return;
				visit(
					{
						type: { name: "image" },
						attrs: {
							src: "blob:preview",
							alt: "paste.png",
							title: "",
							originSrc: "",
							uploadId,
						},
					},
					6,
				);
			},
		);

		await act(async () => {
			expect(paste?.({}, event)).toBe(true);
			await flushImageUploadWork();
		});

		expect(invokeMock).toHaveBeenCalledWith("space_save_pasted_image", {
			source_path: "notes/test.md",
			target_dir: "assets/uploads",
			data_url: "data:image/png;base64,abc",
			original_filename: "paste.png",
		});
		expect(mockEditor.state.tr.setNodeMarkup).toHaveBeenCalledWith(
			6,
			undefined,
			expect.objectContaining({
				src: "data:image/png;base64,abc",
				alt: "paste.png",
				title: "",
				originSrc: "../assets/image.png",
				uploadId: null,
			}),
		);
	});

	it("saves pasted images to the space root when that mode is selected", async () => {
		const onChange = vi.fn();
		loadSettingsMock.mockResolvedValue({
			editor: {
				attachmentFolder: "assets",
				attachmentStorageMode: "space-root",
				colorfulHeadings: false,
				showCollapsibleHeadings: false,
				showFrontmatterInEditor: false,
				enablePeopleMentionsAsTags: false,
			},
		});

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const file = new File(["image-bytes"], "paste.png", { type: "image/png" });
		const event = createClipboardEvent({
			items: [{ type: "image/png", getAsFile: () => file }],
		});

		await act(async () => {
			expect(paste?.({}, event)).toBe(true);
			await flushImageUploadWork();
		});

		expect(invokeMock).toHaveBeenCalledWith("space_save_pasted_image", {
			source_path: "notes/test.md",
			target_dir: "",
			data_url: "data:image/png;base64,abc",
			original_filename: "paste.png",
		});
	});

	it("saves pasted images beside the current note in note-folder mode", async () => {
		const onChange = vi.fn();
		loadSettingsMock.mockResolvedValue({
			editor: {
				attachmentFolder: "assets",
				attachmentStorageMode: "note-folder",
				colorfulHeadings: false,
				showCollapsibleHeadings: false,
				showFrontmatterInEditor: false,
				enablePeopleMentionsAsTags: false,
			},
		});

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const file = new File(["image-bytes"], "paste.png", { type: "image/png" });
		const event = createClipboardEvent({
			items: [{ type: "image/png", getAsFile: () => file }],
		});

		await act(async () => {
			expect(paste?.({}, event)).toBe(true);
			await flushImageUploadWork();
		});

		expect(invokeMock).toHaveBeenCalledWith("space_save_pasted_image", {
			source_path: "notes/test.md",
			target_dir: "notes",
			data_url: "data:image/png;base64,abc",
			original_filename: "paste.png",
		});
	});

	it("saves pasted images in a subfolder under the note folder in note-subfolder mode", async () => {
		const onChange = vi.fn();
		loadSettingsMock.mockResolvedValue({
			editor: {
				attachmentFolder: "attachments",
				attachmentStorageMode: "note-subfolder",
				colorfulHeadings: false,
				showCollapsibleHeadings: false,
				showFrontmatterInEditor: false,
				enablePeopleMentionsAsTags: false,
			},
		});

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const file = new File(["image-bytes"], "paste.png", { type: "image/png" });
		const event = createClipboardEvent({
			items: [{ type: "image/png", getAsFile: () => file }],
		});

		await act(async () => {
			expect(paste?.({}, event)).toBe(true);
			await flushImageUploadWork();
		});

		expect(invokeMock).toHaveBeenCalledWith("space_save_pasted_image", {
			source_path: "notes/test.md",
			target_dir: "notes/attachments",
			data_url: "data:image/png;base64,abc",
			original_filename: "paste.png",
		});
	});

	it("does not start image uploads when image placeholders cannot be inserted", async () => {
		const onChange = vi.fn();
		canCommands.insertContentAt.mockReturnValue(false);

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const file = new File(["image-bytes"], "paste.png", { type: "image/png" });
		const event = createClipboardEvent({
			items: [
				{
					type: "image/png",
					getAsFile: () => file,
				},
			],
		});

		expect(paste?.({}, event)).toBe(false);
		expect(chainCommands.insertContentAt).not.toHaveBeenCalled();
		expect(invokeMock).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});

	it("does not start image uploads when placeholder insertion fails to run", async () => {
		const onChange = vi.fn();
		chainCommands.run.mockReturnValue(false);

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const file = new File(["image-bytes"], "paste.png", { type: "image/png" });
		const event = createClipboardEvent({
			items: [
				{
					type: "image/png",
					getAsFile: () => file,
				},
			],
		});

		expect(paste?.({}, event)).toBe(false);
		expect(chainCommands.insertContentAt).toHaveBeenCalled();
		expect(invokeMock).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});

	it("continues processing later pasted images when one upload fails", async () => {
		const onChange = vi.fn();
		invokeMock
			.mockRejectedValueOnce(new Error("first upload failed"))
			.mockResolvedValueOnce({
				asset_rel_path: "assets/image-2.png",
				href: "../assets/image-2.png",
			});

		await act(async () => {
			root.render(
				<Harness onChange={onChange} pasteMarkdownBehavior="smart-markdown" />,
			);
		});

		const options = getEditorOptions() as EditorOptionsWithPaste;
		const paste = options?.editorProps?.handleDOMEvents?.paste;
		const first = new File(["first"], "first.png", { type: "image/png" });
		const second = new File(["second"], "second.png", { type: "image/png" });
		const event = createClipboardEvent({
			items: [
				{
					type: "image/png",
					getAsFile: () => first,
				},
				{
					type: "image/png",
					getAsFile: () => second,
				},
			],
		});

		await act(async () => {
			expect(paste?.({}, event)).toBe(true);
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(invokeMock).toHaveBeenCalledTimes(2);
		expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
	});
});
