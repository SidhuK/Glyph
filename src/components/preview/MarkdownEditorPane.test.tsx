// @vitest-environment jsdom

import { type ButtonHTMLAttributes, act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditorPane } from "./MarkdownEditorPane";

const { invokeMock } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
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
	useUILayoutContext: () => ({ showToc: false }),
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

vi.mock("../editor/CanvasNoteInlineEditor", () => ({
	CanvasNoteInlineEditor: ({
		onChange,
	}: {
		onChange: (nextText: string) => void;
	}) => (
		<button type="button" onClick={() => onChange("latest typed text")}>
			Type latest text
		</button>
	),
}));

vi.mock("../editor/FloatingTOC", () => ({
	FloatingTOC: () => null,
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

	it("renders the bottom save indicator through dirty, saving, and saved states", async () => {
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

		let saveState = container.querySelector(
			'[data-metric="save-state"]',
		) as HTMLElement | null;
		expect(saveState).not.toBeNull();
		expect(saveState?.dataset.saveState).toBe("saved");
		expect(saveState?.textContent?.trim()).toBe("");
		expect(
			saveState?.parentElement?.lastElementChild?.getAttribute("data-metric"),
		).toBe("save-state");

		const changeButton = Array.from(container.querySelectorAll("button")).find(
			(button) => button.textContent?.includes("Type latest text"),
		);
		expect(changeButton).not.toBeNull();

		await act(async () => {
			changeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		saveState = container.querySelector(
			'[data-metric="save-state"]',
		) as HTMLElement | null;
		expect(saveState?.dataset.saveState).toBe("dirty");
		expect(saveState?.textContent?.trim()).toBe("");

		await act(async () => {
			vi.advanceTimersByTime(900);
		});

		saveState = container.querySelector(
			'[data-metric="save-state"]',
		) as HTMLElement | null;
		expect(saveState?.dataset.saveState).toBe("saving");
		expect(saveState?.textContent?.trim()).toBe("");

		await act(async () => {
			resolveWrite?.({ etag: "notes/status.md-saved", mtime_ms: 2 });
			await Promise.resolve();
		});

		saveState = container.querySelector(
			'[data-metric="save-state"]',
		) as HTMLElement | null;
		expect(saveState?.dataset.saveState).toBe("saved-fresh");
		expect(saveState?.textContent?.trim()).toBe("");
	});
});
