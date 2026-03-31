// @vitest-environment jsdom

import { act, useEffect } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addRecentFileMock = vi.fn();
const setActiveFilePathMock = vi.fn();
const setActivePreviewPathMock = vi.fn();
const setOpenMarkdownTabsMock = vi.fn();
const setActiveMarkdownTabPathMock = vi.fn();

vi.mock("../../contexts", () => ({
	useFileTreeContext: () => ({
		setActiveFilePath: setActiveFilePathMock,
	}),
	useUILayoutContext: () => ({
		setActivePreviewPath: setActivePreviewPathMock,
		setOpenMarkdownTabs: setOpenMarkdownTabsMock,
		setActiveMarkdownTabPath: setActiveMarkdownTabPathMock,
	}),
}));

vi.mock("../../hooks/useRecentFiles", () => ({
	useRecentFiles: () => ({
		addRecentFile: addRecentFileMock,
	}),
}));

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

type HookValue = typeof import("./useTabManager").useTabManager extends (
	...args: never[]
) => infer T
	? T
	: never;

function Harness({
	onReady,
}: {
	onReady: (value: HookValue) => void;
}) {
	const hookValue = useTabManager("/tmp/test-space");

	useEffect(() => {
		onReady(hookValue);
	}, [hookValue, onReady]);

	return null;
}

let useTabManager: typeof import("./useTabManager").useTabManager;

describe("useTabManager", () => {
	let container: HTMLDivElement;
	let root: Root;
	let latestValue: HookValue;

	beforeEach(async () => {
		vi.resetModules();
		vi.clearAllMocks();

		({ useTabManager } = await import("./useTabManager"));

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);

		await act(async () => {
			root.render(
				<Harness
					onReady={(value) => {
						latestValue = value;
					}}
				/>,
			);
		});
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
	});

	it("replaces the active file tab instead of appending a second content tab", () => {
		act(() => {
			latestValue.openFileTab("notes/first.md");
		});

		expect(latestValue.tabs).toHaveLength(1);
		expect(latestValue.activeTabPath).toBe("notes/first.md");

		act(() => {
			latestValue.openFileTab("notes/second.md");
		});

		expect(latestValue.tabs).toHaveLength(1);
		expect(latestValue.tabs[0]).toMatchObject({
			kind: "file",
			target: "notes/second.md",
		});
		expect(latestValue.activeTabPath).toBe("notes/second.md");
	});

	it("fills a blank tab with the chosen file instead of creating a third tab", () => {
		act(() => {
			latestValue.openFileTab("notes/first.md");
		});
		act(() => {
			latestValue.openBlankTab();
		});

		expect(latestValue.tabs).toHaveLength(2);
		expect(latestValue.tabs[1]).toMatchObject({ kind: "blank", target: null });

		act(() => {
			latestValue.openFileTab("notes/second.md");
		});

		expect(latestValue.tabs).toHaveLength(2);
		expect(latestValue.tabs[0]?.target).toBe("notes/first.md");
		expect(latestValue.tabs[1]).toMatchObject({
			kind: "file",
			target: "notes/second.md",
		});
		expect(latestValue.activeTabPath).toBe("notes/second.md");
	});

	it("jumps to an existing tab when the target is already open and leaves the blank tab untouched", () => {
		act(() => {
			latestValue.openFileTab("notes/first.md");
		});
		act(() => {
			latestValue.openBlankTab();
		});
		act(() => {
			latestValue.openFileTab("notes/second.md");
		});
		act(() => {
			latestValue.openBlankTab();
		});

		expect(latestValue.tabs).toHaveLength(3);
		expect(latestValue.tabs[2]).toMatchObject({ kind: "blank", target: null });

		act(() => {
			latestValue.openFileTab("notes/first.md");
		});

		expect(latestValue.tabs).toHaveLength(3);
		expect(
			latestValue.tabs.filter((tab) => tab.target === "notes/first.md"),
		).toHaveLength(1);
		expect(latestValue.tabs[2]).toMatchObject({ kind: "blank", target: null });
		expect(latestValue.activeTabPath).toBe("notes/first.md");
	});
});
