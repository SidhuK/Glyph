// @vitest-environment jsdom

import { act } from "react";
import type React from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTreeFileItem } from "./FileTreeFileItem";

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

vi.mock("../ui/shadcn/context-menu", () => ({
	ContextMenu: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
	),
	ContextMenuTrigger: ({ children }: { children: React.ReactNode }) => (
		<div>{children}</div>
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

vi.mock("./FileTreeAppearanceMenu", () => ({
	FileTreeAppearanceMenu: () => null,
}));

vi.mock("../database/DatabaseColumnIcon", () => ({
	DatabaseColumnIcon: () => <span>icon</span>,
}));

vi.mock("../editor/textColors", () => ({
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
					onNewDatabaseInDir={vi.fn()}
					onNewFolderInDir={vi.fn()}
					onDuplicateFile={vi.fn()}
					onStartRename={vi.fn()}
					onCommitRename={vi.fn()}
					onCancelRename={vi.fn()}
					parentDirPath="notes"
					onDeletePath={vi.fn()}
					appearance={null}
					onChangeAppearance={vi.fn()}
					isPinned={false}
					onTogglePinned={vi.fn()}
					{...overrides}
				/>,
			);
		});
	};

	it("shows the star action when a file is not pinned", async () => {
		await renderFileTreeFileItem({ isPinned: false });

		expect(container.textContent).toContain("Star file");
		expect(container.textContent).not.toContain("Unstar file");
	});

	it("shows the unstar action when a file is pinned", async () => {
		await renderFileTreeFileItem({ isPinned: true });

		expect(container.textContent).toContain("Unstar file");
		expect(container.textContent).not.toContain("Star file");
	});
});
