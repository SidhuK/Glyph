// @vitest-environment jsdom

import { act } from "react";
import type React from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTreeFileItem } from "./FileTreeFileItem";

const showNativeContextMenuMock = vi.hoisted(() => vi.fn());

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { defaultValue?: string }) => {
			const labels: Record<string, string> = {
				"fileTree.open": "Open",
				"fileTree.openInNewWindow": "Open in New Window",
				"fileTree.showInFinder": "Show in Finder",
				"fileTree.rename": "Rename",
				"fileTree.duplicateFile": "Duplicate file",
				"fileTree.pinFile": "Pin file",
				"fileTree.unpinFile": "Unpin file",
				"fileTree.addFile": "Add file",
				"fileTree.createFromTemplate": "Create from template",
				"fileTree.addFolder": "Add folder",
				"fileTree.deleteFile": "Delete file",
				"fileTree.iconAndColor": "Icon & Color...",
			};
			return labels[key] ?? options?.defaultValue ?? key;
		},
	}),
}));

vi.mock("../../lib/nativeContextMenu", () => ({
	showNativeContextMenu: showNativeContextMenuMock,
}));

const openMarkdownInExternalWindowMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/externalMarkdown", () => ({
	openMarkdownInExternalWindow: openMarkdownInExternalWindowMock,
}));

vi.mock("../../contexts", () => ({
	useSpace: () => ({ spacePath: "/space" }),
	useEditorContext: () => ({
		getEditorState: () => null,
		saveCurrentEditor: vi.fn().mockResolvedValue(false),
	}),
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
	return { m: motion };
});

vi.mock("../database/DatabaseColumnIcon", () => ({
	DatabaseColumnIcon: () => <span>icon</span>,
}));

vi.mock("../editor/textColors", () => ({
	EDITOR_TEXT_COLORS: [],
	isEditorTextColor: () => false,
}));

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

describe("FileTreeFileItem", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		showNativeContextMenuMock.mockResolvedValue(false);
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		showNativeContextMenuMock.mockReset();
		openMarkdownInExternalWindowMock.mockReset();
	});

	const renderFileTreeFileItem = async (
		overrides: Partial<React.ComponentProps<typeof FileTreeFileItem>> = {},
	) => {
		await act(async () => {
			root.render(
				<FileTreeFileItem
					entry={{
						name: "alpha.md",
						rel_path: "notes/alpha.md",
						kind: "file",
						is_markdown: true,
					}}
					depth={0}
					isActive={false}
					isRenaming={false}
					onOpenFile={vi.fn()}
					onNewFileInDir={vi.fn()}
					onCreateFromTemplateInDir={vi.fn()}
					onRequestCreateFolder={vi.fn()}
					onDuplicateFile={vi.fn()}
					onStartRename={vi.fn()}
					onCommitRename={vi.fn()}
					onCancelRename={vi.fn()}
					parentDirPath="notes"
					onDeletePath={vi.fn()}
					appearance={null}
					isPinned={false}
					onTogglePinned={vi.fn()}
					{...overrides}
				/>,
			);
		});
	};

	it("shows the pin action when a file is not pinned", async () => {
		await renderFileTreeFileItem({ isPinned: false });

		const button = container.querySelector(
			".fileTreeRow",
		) as HTMLButtonElement | null;
		expect(button).not.toBeNull();

		await act(async () => {
			button?.dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
			);
		});

		const menuItems = showNativeContextMenuMock.mock.calls[0]?.[1] as
			| Array<{ label?: string }>
			| undefined;
		expect(menuItems?.map((item) => item.label)).toContain("Pin file");
		expect(menuItems?.map((item) => item.label)).not.toContain("Unpin file");
	});

	it("shows the unpin action when a file is pinned", async () => {
		await renderFileTreeFileItem({ isPinned: true });

		const button = container.querySelector(
			".fileTreeRow",
		) as HTMLButtonElement | null;
		expect(button).not.toBeNull();

		await act(async () => {
			button?.dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
			);
		});

		const menuItems = showNativeContextMenuMock.mock.calls[0]?.[1] as
			| Array<{ label?: string }>
			| undefined;
		expect(menuItems?.map((item) => item.label)).toContain("Unpin file");
		expect(menuItems?.map((item) => item.label)).not.toContain("Pin file");
	});

	it("shows Open in New Window for markdown files", async () => {
		await renderFileTreeFileItem();

		const button = container.querySelector(
			".fileTreeRow",
		) as HTMLButtonElement | null;
		expect(button).not.toBeNull();

		await act(async () => {
			button?.dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
			);
		});

		const menuItems = showNativeContextMenuMock.mock.calls[0]?.[1] as
			| Array<{ label?: string; action?: () => void }>
			| undefined;
		expect(menuItems?.map((item) => item.label)).toContain(
			"Open in New Window",
		);

		const openInNewWindow = menuItems?.find(
			(item) => item.label === "Open in New Window",
		);
		openInNewWindow?.action?.();
		expect(openMarkdownInExternalWindowMock).toHaveBeenCalledWith(
			"notes/alpha.md",
		);
	});

	it("hides Open in New Window for non-markdown files", async () => {
		await renderFileTreeFileItem({
			entry: {
				name: "alpha.txt",
				rel_path: "notes/alpha.txt",
				kind: "file",
				is_markdown: false,
			},
		});

		const button = container.querySelector(
			".fileTreeRow",
		) as HTMLButtonElement | null;
		expect(button).not.toBeNull();

		await act(async () => {
			button?.dispatchEvent(
				new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
			);
		});

		const menuItems = showNativeContextMenuMock.mock.calls[0]?.[1] as
			| Array<{ label?: string }>
			| undefined;
		expect(menuItems?.map((item) => item.label)).not.toContain(
			"Open in New Window",
		);
	});

	it("calls arrow navigation when pressing the up or down keys", async () => {
		const onArrowNavigate = vi.fn();
		await renderFileTreeFileItem({ onArrowNavigate });

		const button = container.querySelector(
			".fileTreeRow",
		) as HTMLButtonElement | null;
		expect(button).not.toBeNull();

		await act(async () => {
			button?.dispatchEvent(
				new KeyboardEvent("keydown", {
					bubbles: true,
					key: "ArrowDown",
				}),
			);
		});

		expect(onArrowNavigate).toHaveBeenCalledTimes(1);
		expect(onArrowNavigate).toHaveBeenCalledWith(
			"notes/alpha.md",
			1,
			expect.any(HTMLButtonElement),
		);
	});
});
