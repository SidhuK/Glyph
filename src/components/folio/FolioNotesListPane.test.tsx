// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolioNotesListPane } from "./FolioNotesListPane";
import type { FolioScope } from "./folioScopes";

const {
	loadAllDocsMock,
	prefetchNoteMock,
	invokeMock,
	scopeRef,
	taskSummariesRef,
	showTaskProgressIndicatorRef,
} = vi.hoisted(() => ({
	loadAllDocsMock: vi.fn(),
	prefetchNoteMock: vi.fn(),
	invokeMock: vi.fn(),
	scopeRef: { current: { kind: "all" } as FolioScope },
	taskSummariesRef: {
		current: {} as Record<
			string,
			{ total_count: number; completed_count: number; open_count: number }
		>,
	},
	showTaskProgressIndicatorRef: { current: true as boolean | null },
}));

vi.mock("../../contexts", () => ({
	useUILayoutContext: () => ({
		folioScope: scopeRef.current,
	}),
	useFileTreeContext: () => ({
		itemAppearance: {},
		setItemAppearance: vi.fn(),
	}),
}));

vi.mock("../../lib/tauri", async () => {
	const actual =
		await vi.importActual<typeof import("../../lib/tauri")>("../../lib/tauri");
	return {
		...actual,
		invoke: invokeMock,
	};
});

vi.mock("../../lib/navigationPrefetch", async () => {
	const actual = await vi.importActual<
		typeof import("../../lib/navigationPrefetch")
	>("../../lib/navigationPrefetch");
	return {
		...actual,
		loadAllDocs: loadAllDocsMock,
		prefetchNote: prefetchNoteMock,
	};
});

vi.mock("../../lib/tauriEvents", () => ({
	useTauriEvent: () => {},
}));

vi.mock("../../hooks/useTaskProgressIndicatorSetting", () => ({
	useTaskProgressIndicatorSetting: () => showTaskProgressIndicatorRef.current,
}));

vi.mock("../../hooks/useTaskSummariesForPaths", () => ({
	useTaskSummariesForPaths: () => taskSummariesRef.current,
}));

vi.mock("../ui/shadcn/context-menu", () => ({
	ContextMenu: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	ContextMenuContent: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	ContextMenuItem: ({
		children,
		onSelect,
	}: {
		children: React.ReactNode;
		onSelect?: () => void;
	}) => (
		<button type="button" onClick={onSelect}>
			{children}
		</button>
	),
	ContextMenuSeparator: () => <hr />,
}));

vi.mock("../filetree/FileTreeAppearanceMenu", () => ({
	FileTreeAppearanceMenu: () => null,
}));

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

const notes = [
	{
		note_path: "Ideas/Sketch.md",
		title: "Sketch",
		preview: "A fast idea",
		updated: "2026-05-02T10:00:00.000Z",
		created: "2026-04-30T09:00:00.000Z",
		tags: ["ideas"],
		people: ["mira"],
	},
	{
		note_path: "Projects/Roadmap.md",
		title: "Roadmap",
		preview: "# Roadmap\n\nLaunch   planning\nand milestones",
		updated: "2026-05-01T10:00:00.000Z",
		created: "2026-05-01T09:00:00.000Z",
		tags: ["planning"],
		people: ["alex"],
	},
];

async function waitFor(check: () => boolean) {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if (check()) return;
		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 0));
		});
	}
}

function renderedNotePaths(container: Element): string[] {
	return Array.from(container.querySelectorAll("[data-folio-note-path]")).map(
		(row) => row.getAttribute("data-folio-note-path") ?? "",
	);
}

describe("FolioNotesListPane", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	let onOpenFile: (relPath: string) => Promise<void>;
	let onOpenFileInNewTab: (relPath: string) => Promise<void>;
	let onDeleteFile: (relPath: string) => Promise<boolean>;
	let scrollIntoViewArgs: Array<boolean | ScrollIntoViewOptions | undefined>;
	let originalScrollIntoView: HTMLElement["scrollIntoView"];

	beforeEach(() => {
		vi.clearAllMocks();
		scopeRef.current = { kind: "all" };
		taskSummariesRef.current = {};
		showTaskProgressIndicatorRef.current = true;
		loadAllDocsMock.mockResolvedValue(notes);
		invokeMock.mockResolvedValue([]);
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, gcTime: 0 } },
		});
		onOpenFile = vi.fn(async () => {});
		onOpenFileInNewTab = vi.fn(async () => {});
		onDeleteFile = vi.fn(async () => true);
		originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
		scrollIntoViewArgs = [];
		HTMLElement.prototype.scrollIntoView = (
			arg?: boolean | ScrollIntoViewOptions,
		) => {
			scrollIntoViewArgs.push(arg);
		};
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		queryClient.clear();
		HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
		scrollIntoViewArgs = [];
	});

	function renderPane(activeTabPath: string | null = null) {
		root.render(
			<QueryClientProvider client={queryClient}>
				<FolioNotesListPane
					activeTabPath={activeTabPath}
					onOpenFile={onOpenFile}
					onOpenFileInNewTab={onOpenFileInNewTab}
					onDeleteFile={onDeleteFile}
				/>
			</QueryClientProvider>,
		);
	}

	it("renders dense note rows from all docs", async () => {
		await act(async () => renderPane("Projects/Roadmap.md"));
		await waitFor(() => container.textContent?.includes("Roadmap") ?? false);

		expect(container.textContent).toContain("All Notes");
		expect(container.textContent).toContain("Roadmap");
		expect(container.textContent).toContain("Launch planning and milestones");
		expect(container.textContent).toContain("Sketch");
		expect(loadAllDocsMock).toHaveBeenCalledWith(null);
		expect(renderedNotePaths(container)).toEqual([
			"Projects/Roadmap.md",
			"Ideas/Sketch.md",
		]);
		expect(
			container
				.querySelector('[data-folio-note-path="Projects/Roadmap.md"]')
				?.getAttribute("data-state"),
		).toBe("selected");
	});

	it("filters rows locally", async () => {
		await act(async () => renderPane());
		await waitFor(() => container.textContent?.includes("Sketch") ?? false);

		const input = container.querySelector(
			'input[aria-label="Filter notes"]',
		) as HTMLInputElement | null;
		expect(input).toBeTruthy();

		await act(async () => {
			if (!input) return;
			const valueSetter = Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)?.set;
			valueSetter?.call(input, "road");
			input.dispatchEvent(new Event("input", { bubbles: true }));
		});

		expect(container.textContent).toContain("Roadmap");
		expect(container.textContent).not.toContain("Sketch");
	});

	it("renders task progress rings on note cards", async () => {
		taskSummariesRef.current = {
			"Projects/Roadmap.md": {
				total_count: 4,
				completed_count: 3,
				open_count: 1,
			},
		};

		await act(async () => renderPane());
		await waitFor(() => container.textContent?.includes("Roadmap") ?? false);

		expect(
			container.querySelector(
				'[data-folio-note-path="Projects/Roadmap.md"] [aria-label="3 of 4 tasks completed"]',
			),
		).toBeTruthy();
		expect(
			container.querySelector(
				'[data-folio-note-path="Ideas/Sketch.md"] .folioNoteTaskProgress',
			),
		).toBeNull();
	});

	it("sorts by edited time when selected", async () => {
		await act(async () => renderPane());
		await waitFor(() => container.textContent?.includes("Sketch") ?? false);

		const select = container.querySelector(
			'select[aria-label="Sort notes"]',
		) as HTMLSelectElement | null;
		expect(select).toBeTruthy();
		expect(
			Array.from(select?.options ?? []).map((option) => option.textContent),
		).toEqual(["Alphabetically", "Edited", "Created"]);

		await act(async () => {
			if (!select) return;
			const valueSetter = Object.getOwnPropertyDescriptor(
				HTMLSelectElement.prototype,
				"value",
			)?.set;
			valueSetter?.call(select, "edited");
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});

		expect(renderedNotePaths(container)).toEqual([
			"Ideas/Sketch.md",
			"Projects/Roadmap.md",
		]);
	});

	it("sorts by created time when selected", async () => {
		await act(async () => renderPane());
		await waitFor(() => container.textContent?.includes("Sketch") ?? false);

		const select = container.querySelector(
			'select[aria-label="Sort notes"]',
		) as HTMLSelectElement | null;
		expect(select).toBeTruthy();

		await act(async () => {
			if (!select) return;
			const valueSetter = Object.getOwnPropertyDescriptor(
				HTMLSelectElement.prototype,
				"value",
			)?.set;
			valueSetter?.call(select, "created");
			select.dispatchEvent(new Event("change", { bubbles: true }));
		});

		expect(renderedNotePaths(container)).toEqual([
			"Projects/Roadmap.md",
			"Ideas/Sketch.md",
		]);
	});

	it("keeps sort control arrow keys inside the select", async () => {
		await act(async () => renderPane("Projects/Roadmap.md"));
		await waitFor(() => container.textContent?.includes("Sketch") ?? false);

		const select = container.querySelector(
			'select[aria-label="Sort notes"]',
		) as HTMLSelectElement | null;
		expect(select).toBeTruthy();

		const event = new KeyboardEvent("keydown", {
			key: "ArrowDown",
			bubbles: true,
			cancelable: true,
		});
		await act(async () => {
			select?.dispatchEvent(event);
		});

		expect(event.defaultPrevented).toBe(false);
		expect(vi.mocked(onOpenFile)).not.toHaveBeenCalled();
	});

	it("filters person scopes by indexed people metadata", async () => {
		scopeRef.current = { kind: "person", handle: "@mira" };
		await act(async () => renderPane());
		await waitFor(() => container.textContent?.includes("Sketch") ?? false);

		expect(container.textContent).toContain("@mira");
		expect(renderedNotePaths(container)).toEqual(["Ideas/Sketch.md"]);
		expect(container.textContent).not.toContain("Roadmap");
	});

	it("opens a note on row click", async () => {
		await act(async () => renderPane());
		await waitFor(
			() =>
				container.querySelector(
					'[data-folio-note-path="Projects/Roadmap.md"]',
				) !== null,
		);

		const row = container.querySelector(
			'[data-folio-note-path="Projects/Roadmap.md"]',
		);
		expect(row).toBeTruthy();

		await act(async () => {
			row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(vi.mocked(onOpenFile)).toHaveBeenCalledWith("Projects/Roadmap.md");
	});

	it("opens adjacent notes with arrow keys", async () => {
		await act(async () => renderPane("Projects/Roadmap.md"));
		await waitFor(
			() =>
				container.querySelector(
					'[data-folio-note-path="Projects/Roadmap.md"]',
				) !== null,
		);

		const row = container.querySelector(
			'[data-folio-note-path="Projects/Roadmap.md"]',
		) as HTMLButtonElement | null;
		expect(row).toBeTruthy();

		await act(async () => {
			row?.focus();
			row?.dispatchEvent(
				new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
			);
		});

		expect(vi.mocked(onOpenFile)).toHaveBeenCalledWith("Ideas/Sketch.md");
	});

	it("uses arrow keys for navigation instead of list scrolling", async () => {
		await act(async () => renderPane("Projects/Roadmap.md"));
		await waitFor(() => container.querySelector(".folioNotesList") !== null);

		const list = container.querySelector(".folioNotesList");
		expect(list).toBeTruthy();

		const event = new KeyboardEvent("keydown", {
			key: "ArrowDown",
			bubbles: true,
			cancelable: true,
		});
		await act(async () => {
			list?.dispatchEvent(event);
		});

		expect(event.defaultPrevented).toBe(true);
		expect(vi.mocked(onOpenFile)).toHaveBeenCalledWith("Ideas/Sketch.md");
	});

	it("scrolls the selected row into view during keyboard navigation", async () => {
		await act(async () => renderPane("Projects/Roadmap.md"));
		await waitFor(
			() =>
				container.querySelector(
					'[data-folio-note-path="Projects/Roadmap.md"]',
				) !== null,
		);
		scrollIntoViewArgs = [];

		const list = container.querySelector(".folioNotesList");
		await act(async () => {
			list?.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "ArrowDown",
					bubbles: true,
					cancelable: true,
				}),
			);
			await new Promise((resolve) => window.requestAnimationFrame(resolve));
		});

		expect(scrollIntoViewArgs).toContainEqual({ block: "nearest" });
		expect(vi.mocked(onOpenFile)).toHaveBeenCalledWith("Ideas/Sketch.md");
	});
});
