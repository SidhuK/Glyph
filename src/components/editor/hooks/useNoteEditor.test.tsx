// @vitest-environment jsdom

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNoteEditor } from "./useNoteEditor";

const { mockEditor, setEditorOptions, getEditorOptions, openUrlMock } =
	vi.hoisted(() => {
		let editorOptions: Record<string, unknown> | null = null;
		const mockEditor = {
			isEditable: true,
			setEditable: vi.fn(),
			getMarkdown: vi.fn(),
			commands: {
				setContent: vi.fn(),
				setHeadingCollapseEnabled: vi.fn(),
			},
		};

		return {
			mockEditor,
			setEditorOptions: (options: Record<string, unknown>) => {
				editorOptions = options;
			},
			getEditorOptions: () => editorOptions,
			openUrlMock: vi.fn(),
		};
	});

// React 19 expects tests to opt into act-aware scheduling.
(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tauri-apps/plugin-opener", () => ({
	openUrl: openUrlMock,
}));

vi.mock("@tiptap/react", () => ({
	useEditor: (options: Record<string, unknown>) => {
		setEditorOptions(options);
		return mockEditor;
	},
}));

vi.mock("../extensions", () => ({
	createEditorExtensions: () => [],
}));

vi.mock("../../../lib/settings", () => ({
	loadSettings: () =>
		Promise.resolve({
			editor: { showCollapsibleHeadings: false },
		}),
}));

vi.mock("../../../lib/tauriEvents", () => ({
	useTauriEvent: () => {},
}));

vi.mock("./useHydrateInlineImages", () => ({
	useHydrateInlineImages: () => {},
}));

function Harness({ onChange }: { onChange: (nextMarkdown: string) => void }) {
	useNoteEditor({
		markdown: "keep this line\nremove this line",
		mode: "rich",
		onChange,
	});
	return null;
}

describe("useNoteEditor", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		mockEditor.isEditable = true;
		mockEditor.setEditable.mockReset();
		mockEditor.getMarkdown.mockReset();
		mockEditor.commands.setContent.mockReset();
		mockEditor.commands.setHeadingCollapseEnabled.mockReset();
		openUrlMock.mockReset();

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
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

		expect(onChange).toHaveBeenCalledWith("keep this line");
	});
});
