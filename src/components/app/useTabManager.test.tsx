// @vitest-environment jsdom

import { act, useEffect } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addRecentFileMock = vi.fn();
const setActiveFilePathMock = vi.fn();
const setOpenMarkdownTabsMock = vi.fn();
const setActiveMarkdownTabPathMock = vi.fn();

vi.mock("../../contexts", () => ({
	useFileTreeContext: () => ({
		setActiveFilePath: setActiveFilePathMock,
	}),
	useUILayoutContext: () => ({
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

	it("pushes note history when opening markdown notes in the same tab", () => {
		act(() => {
			latestValue.openFileTab("notes/a.md");
		});
		act(() => {
			latestValue.openFileTab("notes/b.md");
		});

		expect(latestValue.canGoBack).toBe(true);
		expect(latestValue.canGoForward).toBe(false);

		act(() => {
			latestValue.goBack();
		});

		expect(latestValue.activeTabPath).toBe("notes/a.md");
		expect(latestValue.canGoBack).toBe(false);
		expect(latestValue.canGoForward).toBe(true);
	});

	it("supports repeated back presses before React re-renders", () => {
		act(() => {
			latestValue.openFileTab("notes/a.md");
		});
		act(() => {
			latestValue.openFileTab("notes/b.md");
		});
		act(() => {
			latestValue.openFileTab("notes/c.md");
		});

		act(() => {
			latestValue.goBack();
			latestValue.goBack();
		});

		expect(latestValue.activeTabPath).toBe("notes/a.md");
		expect(latestValue.canGoBack).toBe(false);
		expect(latestValue.canGoForward).toBe(true);
	});

	it("does not push consecutive duplicate entries", () => {
		act(() => {
			latestValue.openFileTab("notes/a.md");
		});
		act(() => {
			latestValue.openFileTab("notes/b.md");
		});
		act(() => {
			latestValue.openFileTab("notes/b.md");
		});

		expect(latestValue.canGoBack).toBe(true);
		expect(latestValue.canGoForward).toBe(false);

		act(() => {
			latestValue.goBack();
		});

		expect(latestValue.activeTabPath).toBe("notes/a.md");
	});

	it("truncates forward history after a new note is opened from a back state", () => {
		act(() => {
			latestValue.openFileTab("notes/a.md");
		});
		act(() => {
			latestValue.openFileTab("notes/b.md");
		});
		act(() => {
			latestValue.openFileTab("notes/c.md");
		});
		act(() => {
			latestValue.goBack();
		});
		act(() => {
			latestValue.goBack();
		});

		expect(latestValue.activeTabPath).toBe("notes/a.md");
		expect(latestValue.canGoForward).toBe(true);

		act(() => {
			latestValue.openFileTab("notes/d.md");
		});

		expect(latestValue.activeTabPath).toBe("notes/d.md");
		expect(latestValue.canGoForward).toBe(false);

		act(() => {
			latestValue.goBack();
		});

		expect(latestValue.activeTabPath).toBe("notes/a.md");
	});

	it("keeps history isolated per tab", () => {
		act(() => {
			latestValue.openFileTab("notes/a.md");
		});
		act(() => {
			latestValue.openBlankTab();
		});
		act(() => {
			latestValue.openFileTab("notes/b.md");
		});

		// Switch to first tab
		act(() => {
			latestValue.setActiveTabId(latestValue.tabs[0]?.id ?? null);
		});

		expect(latestValue.activeTabPath).toBe("notes/a.md");
		expect(latestValue.canGoBack).toBe(false);
		expect(latestValue.canGoForward).toBe(false);

		// Switch back to second tab
		act(() => {
			latestValue.setActiveTabId(latestValue.tabs[1]?.id ?? null);
		});

		expect(latestValue.activeTabPath).toBe("notes/b.md");
		expect(latestValue.canGoBack).toBe(false);
	});

	it("preserves current behavior when target note is already open in another tab", () => {
		act(() => {
			latestValue.openFileTab("notes/a.md");
		});
		act(() => {
			latestValue.openBlankTab();
		});
		act(() => {
			latestValue.openFileTab("notes/b.md");
		});

		const secondTabId = latestValue.activeTabId;

		// Jump to existing tab a.md
		act(() => {
			latestValue.openFileTab("notes/a.md");
		});

		expect(latestValue.activeTabPath).toBe("notes/a.md");

		// Switch back to second tab — it should still have its own history
		act(() => {
			latestValue.setActiveTabId(secondTabId);
		});

		expect(latestValue.activeTabPath).toBe("notes/b.md");
		expect(latestValue.canGoBack).toBe(false);
	});

	it("ignores special-tab opens for history creation", () => {
		act(() => {
			latestValue.openFileTab("notes/a.md");
		});
		act(() => {
			latestValue.openFileTab("notes/b.md");
		});
		act(() => {
			latestValue.openSpecialTab("all-docs");
		});

		expect(latestValue.activeTabPath).toBe("all-docs");
		expect(latestValue.canGoBack).toBe(true);

		act(() => {
			latestValue.goBack();
		});

		expect(latestValue.activeTabPath).toBe("notes/a.md");
	});

	it("removes tab history on close", () => {
		act(() => {
			latestValue.openFileTab("notes/a.md");
		});
		act(() => {
			latestValue.openFileTab("notes/b.md");
		});

		const tabId = latestValue.activeTabId;

		act(() => {
			latestValue.closeTab(tabId ?? "");
		});

		expect(latestValue.canGoBack).toBe(false);
		expect(latestValue.canGoForward).toBe(false);
	});

	it("rewrites history entries on rename", () => {
		act(() => {
			latestValue.openFileTab("notes/a.md");
		});
		act(() => {
			latestValue.openFileTab("notes/b.md");
		});

		act(() => {
			latestValue.goBack();
		});

		act(() => {
			latestValue.renameTabsForPath("notes/a.md", "notes/renamed.md");
		});

		act(() => {
			latestValue.goForward();
		});

		expect(latestValue.activeTabPath).toBe("notes/b.md");

		act(() => {
			latestValue.goBack();
		});

		expect(latestValue.activeTabPath).toBe("notes/renamed.md");
	});

	it("prunes history entries on delete / recursive delete", () => {
		act(() => {
			latestValue.openFileTab("notes/a.md");
		});
		act(() => {
			latestValue.openFileTab("notes/b.md");
		});
		act(() => {
			latestValue.openFileTab("notes/c.md");
		});

		act(() => {
			latestValue.closeTabsForPathRemoval("notes/b.md");
		});

		expect(latestValue.canGoForward).toBe(false);

		act(() => {
			latestValue.goBack();
		});

		expect(latestValue.activeTabPath).toBe("notes/a.md");
	});

	it("clears history when replacing a blank tab", () => {
		act(() => {
			latestValue.openFileTab("notes/a.md");
		});
		act(() => {
			latestValue.openBlankTab();
		});
		act(() => {
			latestValue.openFileTab("notes/b.md");
		});

		expect(latestValue.canGoBack).toBe(false);
		expect(latestValue.canGoForward).toBe(false);
	});
});
