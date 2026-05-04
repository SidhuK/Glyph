// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FolioNotesListPane } from "./FolioNotesListPane";
import type { FolioScope } from "./folioScopes";

const { loadAllDocsMock, prefetchNoteMock, scopeRef } = vi.hoisted(() => ({
	loadAllDocsMock: vi.fn(),
	prefetchNoteMock: vi.fn(),
	scopeRef: { current: { kind: "all" } as FolioScope },
}));

vi.mock("../../contexts", () => ({
	useUILayoutContext: () => ({
		folioScope: scopeRef.current,
	}),
}));

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

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

const notes = [
	{
		note_path: "Projects/Roadmap.md",
		title: "Roadmap",
		preview: "# Roadmap\n\nLaunch   planning\nand milestones",
		updated: "2026-05-01T10:00:00.000Z",
		created: "2026-05-01T09:00:00.000Z",
		tags: ["planning"],
	},
	{
		note_path: "Ideas/Sketch.md",
		title: "Sketch",
		preview: "A fast idea",
		updated: "2026-05-02T10:00:00.000Z",
		created: "2026-05-02T09:00:00.000Z",
		tags: ["ideas"],
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

describe("FolioNotesListPane", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;
	let onOpenFile: (relPath: string) => Promise<void>;
	let onOpenFileInNewTab: (relPath: string) => Promise<void>;
	let onRenameFile: (
		relPath: string,
		nextName: string,
	) => Promise<string | null>;
	let onDeleteFile: (relPath: string) => Promise<boolean>;

	beforeEach(() => {
		vi.clearAllMocks();
		scopeRef.current = { kind: "all" };
		loadAllDocsMock.mockResolvedValue(notes);
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, gcTime: 0 } },
		});
		onOpenFile = vi.fn(async () => {});
		onOpenFileInNewTab = vi.fn(async () => {});
		onRenameFile = vi.fn(async () => null);
		onDeleteFile = vi.fn(async () => true);
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
	});

	function renderPane(activeTabPath: string | null = null) {
		root.render(
			<QueryClientProvider client={queryClient}>
				<FolioNotesListPane
					activeTabPath={activeTabPath}
					onOpenFile={onOpenFile}
					onOpenFileInNewTab={onOpenFileInNewTab}
					onRenameFile={onRenameFile}
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
});
