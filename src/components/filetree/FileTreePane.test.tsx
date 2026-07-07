// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type React from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTreePane } from "./FileTreePane";

vi.mock("@tanstack/react-virtual", () => ({
	useVirtualizer: ({
		count,
		estimateSize,
		getItemKey,
	}: {
		count: number;
		estimateSize: (index: number) => number;
		getItemKey: (index: number) => string | number;
	}) => {
		const starts = Array.from({ length: count }, (_, index) =>
			Array.from({ length: index }, (__, previousIndex) =>
				estimateSize(previousIndex),
			).reduce((total, size) => total + size, 0),
		);
		return {
			getVirtualItems: () =>
				starts.map((start, index) => ({
					index,
					key: getItemKey(index),
					start,
				})),
			getTotalSize: () =>
				Array.from({ length: count }, (_, index) => estimateSize(index)).reduce(
					(total, size) => total + size,
					0,
				),
			measureElement: () => {},
			scrollToIndex: () => {},
			options: { scrollMargin: 0 },
		};
	},
}));

const {
	invokeMock,
	loadSettingsMock,
	useFileTreeContextMock,
	useSpaceMock,
	useTauriEventMock,
} = vi.hoisted(() => ({
	invokeMock: vi.fn(() => Promise.resolve([])),
	loadSettingsMock: vi.fn(),
	useFileTreeContextMock: vi.fn(),
	useSpaceMock: vi.fn(),
	useTauriEventMock: vi.fn(),
}));

vi.mock("motion/react", async () => {
	const React = await vi.importActual<typeof import("react")>("react");
	const stripMotionProps = (
		props: Record<string, unknown> & { children?: React.ReactNode },
	) => {
		const {
			animate: _animate,
			exit: _exit,
			initial: _initial,
			transition: _transition,
			variants: _variants,
			whileHover: _whileHover,
			whileTap: _whileTap,
			children,
			...rest
		} = props;
		return { children, rest };
	};
	const motion = new Proxy(
		{},
		{
			get: (_, tag: string) =>
				React.forwardRef<
					HTMLElement,
					React.HTMLAttributes<HTMLElement> &
						Record<string, unknown> & { children?: React.ReactNode }
				>((props, ref) => {
					const { children, rest } = stripMotionProps(props);
					return React.createElement(tag, { ...rest, ref }, children);
				}),
		},
	);
	return {
		m: motion,
		AnimatePresence: ({ children }: { children: React.ReactNode }) => (
			<>{children}</>
		),
	};
});

vi.mock("../../contexts", () => ({
	useFileTreeContext: useFileTreeContextMock,
	useSpace: useSpaceMock,
}));

vi.mock("../../lib/settings", async () => {
	const actual =
		await vi.importActual<typeof import("../../lib/settings")>(
			"../../lib/settings",
		);
	return {
		...actual,
		loadSettings: loadSettingsMock,
	};
});

vi.mock("../../lib/tauriEvents", () => ({
	useTauriEvent: useTauriEventMock,
}));

vi.mock("../../lib/tauri", () => ({
	invoke: invokeMock,
}));

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

describe("FileTreePane", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	beforeEach(() => {
		vi.clearAllMocks();
		loadSettingsMock.mockResolvedValue({
			ui: {
				showFileTreeFolderCounts: false,
				showNonMarkdownFiles: true,
				fileTreeSortMode: "name-asc",
			},
		});
		useFileTreeContextMock.mockReturnValue({
			itemAppearance: {},
			setItemAppearance: vi.fn(),
			fileTreeSortMode: "name-asc",
			isSavingFileTreeSortMode: false,
			setFileTreeSortMode: vi.fn(() => Promise.resolve()),
		});
		useSpaceMock.mockReturnValue({
			spacePath: "/space",
			setError: vi.fn(),
		});
		useTauriEventMock.mockImplementation(() => {});
		queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false,
				},
			},
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
	});

	it("renders pinned files in the tree without duplicating a pinned section", async () => {
		const onOpenFile = vi.fn();

		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<FileTreePane
						rootEntries={[
							{
								name: "alpha.md",
								rel_path: "notes/alpha.md",
								kind: "file",
								is_markdown: true,
							},
							{
								name: "beta.md",
								rel_path: "docs/beta.md",
								kind: "file",
								is_markdown: true,
							},
						]}
						childrenByDir={{}}
						expandedDirs={new Set()}
						activeFilePath="notes/alpha.md"
						activeDirPath={null}
						onToggleDir={vi.fn()}
						onSelectDir={vi.fn()}
						onOpenFile={onOpenFile}
						onNewFileInDir={vi.fn()}
						onCreateFromTemplateInDir={vi.fn()}
						onRequestCreateFolder={vi.fn()}
						onDuplicateFile={vi.fn()}
						onDeletePath={vi.fn()}
						renamingPath={null}
						onStartRename={vi.fn()}
						onCancelRename={vi.fn()}
						onCommitFileRename={vi.fn()}
						onCommitDirRename={vi.fn()}
						onMovePath={vi.fn()}
						pinnedFiles={["notes/alpha.md", "docs/beta.md"]}
						onTogglePinnedFile={vi.fn()}
					/>
				</QueryClientProvider>,
			);
		});

		expect(container.textContent).toContain("alpha");
		expect(container.textContent).toContain("beta");

		expect(container.querySelector(".fileTreePinnedSection")).toBeNull();

		const activeItem = container.querySelector(".fileTreeItem.active");
		expect(activeItem?.textContent).toContain("alpha");

		const alphaButton = Array.from(
			container.querySelectorAll("[data-file-tree-file='true']"),
		).find((node) => node.textContent?.includes("alpha"));
		await act(async () => {
			(alphaButton as HTMLButtonElement | undefined)?.click();
		});
		expect(onOpenFile).toHaveBeenCalledWith("notes/alpha.md");
	});

	it("hides the pinned rows when no files are pinned", async () => {
		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<FileTreePane
						rootEntries={[]}
						childrenByDir={{}}
						expandedDirs={new Set()}
						activeFilePath={null}
						activeDirPath={null}
						onToggleDir={vi.fn()}
						onSelectDir={vi.fn()}
						onOpenFile={vi.fn()}
						onNewFileInDir={vi.fn()}
						onCreateFromTemplateInDir={vi.fn()}
						onRequestCreateFolder={vi.fn()}
						onDuplicateFile={vi.fn()}
						onDeletePath={vi.fn()}
						renamingPath={null}
						onStartRename={vi.fn()}
						onCancelRename={vi.fn()}
						onCommitFileRename={vi.fn()}
						onCommitDirRename={vi.fn()}
						onMovePath={vi.fn()}
						pinnedFiles={[]}
						onTogglePinnedFile={vi.fn()}
					/>
				</QueryClientProvider>,
			);
		});

		expect(container.querySelector(".fileTreePinnedSection")).toBeNull();
	});

	it("hides non-markdown files when the setting is off", async () => {
		loadSettingsMock.mockResolvedValue({
			ui: {
				showFileTreeFolderCounts: false,
				showNonMarkdownFiles: false,
				fileTreeSortMode: "name-asc",
			},
		});

		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<FileTreePane
						rootEntries={[
							{
								name: "note.md",
								rel_path: "note.md",
								kind: "file",
								is_markdown: true,
							},
							{
								name: "image.png",
								rel_path: "image.png",
								kind: "file",
								is_markdown: false,
							},
						]}
						childrenByDir={{}}
						expandedDirs={new Set()}
						activeFilePath={null}
						activeDirPath={null}
						onToggleDir={vi.fn()}
						onSelectDir={vi.fn()}
						onOpenFile={vi.fn()}
						onNewFileInDir={vi.fn()}
						onCreateFromTemplateInDir={vi.fn()}
						onRequestCreateFolder={vi.fn()}
						onDuplicateFile={vi.fn()}
						onDeletePath={vi.fn()}
						renamingPath={null}
						onStartRename={vi.fn()}
						onCancelRename={vi.fn()}
						onCommitFileRename={vi.fn()}
						onCommitDirRename={vi.fn()}
						onMovePath={vi.fn()}
						pinnedFiles={[]}
						onTogglePinnedFile={vi.fn()}
					/>
				</QueryClientProvider>,
			);
		});

		expect(container.textContent).toContain("note");
		expect(container.textContent).not.toContain("image");
	});
});
