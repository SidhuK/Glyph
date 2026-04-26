// @vitest-environment jsdom

import { act } from "react";
import type React from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTreePane } from "./FileTreePane";

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

	beforeEach(() => {
		vi.clearAllMocks();
		loadSettingsMock.mockResolvedValue({
			ui: {
				showFileTreeFolderCounts: false,
				showTaskProgressIndicator: true,
			},
		});
		useFileTreeContextMock.mockReturnValue({
			itemAppearance: {},
			setItemAppearance: vi.fn(),
		});
		useSpaceMock.mockReturnValue({
			spacePath: "/space",
			setError: vi.fn(),
		});
		useTauriEventMock.mockImplementation(() => {});

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

	it("renders pinned files above the tree and toggles the section", async () => {
		const onOpenFile = vi.fn();

		await act(async () => {
			root.render(
				<FileTreePane
					rootEntries={[]}
					childrenByDir={{}}
					expandedDirs={new Set()}
					activeFilePath="notes/alpha.md"
					activeDirPath={null}
					onToggleDir={vi.fn()}
					onSelectDir={vi.fn()}
					onOpenFile={onOpenFile}
					onNewFileInDir={vi.fn()}
					onCreateFromTemplateInDir={vi.fn()}
					onNewDatabaseInDir={vi.fn()}
					onNewFolderInDir={vi.fn()}
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
				/>,
			);
		});

		expect(container.textContent).toContain("alpha");
		expect(container.textContent).toContain("beta");

		const activeItem = container.querySelector(
			".fileTreePinnedList .fileTreeItem.active",
		);
		expect(activeItem?.textContent).toContain("alpha");

		const pinnedButton = Array.from(
			container.querySelectorAll(".fileTreePinnedRow"),
		).find((node) => node.textContent?.includes("alpha"));
		await act(async () => {
			(pinnedButton as HTMLButtonElement | undefined)?.click();
		});
		expect(onOpenFile).toHaveBeenCalledWith("notes/alpha.md");
	});

	it("hides the pinned rows when no files are pinned", async () => {
		await act(async () => {
			root.render(
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
					onNewDatabaseInDir={vi.fn()}
					onNewFolderInDir={vi.fn()}
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
				/>,
			);
		});

		expect(container.querySelector(".fileTreePinnedSection")).toBeNull();
	});
});
