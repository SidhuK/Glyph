// @vitest-environment jsdom

import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTreeProvider, useFileTreeContext } from "./FileTreeContext";

const { invokeMock, useSpaceMock, useTauriEventMock } = vi.hoisted(() => ({
	invokeMock: vi.fn(),
	useSpaceMock: vi.fn(),
	useTauriEventMock: vi.fn(),
}));

vi.mock("../lib/tauri", () => ({
	invoke: invokeMock,
}));

vi.mock("./SpaceContext", () => ({
	useSpace: useSpaceMock,
}));

vi.mock("../lib/tauriEvents", () => ({
	useTauriEvent: useTauriEventMock,
}));

vi.mock("../lib/settings", () => ({
	loadSettings: () =>
		Promise.resolve({
			editor: {
				beautifulTags: false,
				enablePeopleMentionsAsTags: false,
			},
		}),
}));

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

function Consumer() {
	const { pinnedFiles, togglePinnedFile, refreshPinnedFiles } =
		useFileTreeContext();

	return (
		<div>
			<div data-testid="pinned-files">{pinnedFiles.join(",")}</div>
			<button
				type="button"
				onClick={() => void togglePinnedFile("notes/toggled.md")}
			>
				Toggle
			</button>
			<button type="button" onClick={() => void refreshPinnedFiles()}>
				Refresh
			</button>
		</div>
	);
}

describe("FileTreeProvider pinned files", () => {
	let container: HTMLDivElement;
	let root: Root;
	let currentSpacePath: string | null;

	beforeEach(() => {
		vi.clearAllMocks();
		currentSpacePath = "/space-a";
		const startIndexSync = vi.fn(() => Promise.resolve());
		useSpaceMock.mockImplementation(() => ({
			spacePath: currentSpacePath,
			startIndexSync,
		}));
		useTauriEventMock.mockImplementation(() => {});
		invokeMock.mockImplementation((command: string) => {
			if (command === "space_list_dir") return Promise.resolve([]);
			if (command === "file_tree_appearance_list") return Promise.resolve({});
			if (command === "tag_appearance_list") return Promise.resolve({});
			if (command === "tags_list") return Promise.resolve([]);
			if (command === "people_list") return Promise.resolve([]);
			if (command === "pinned_files_toggle") {
				return Promise.resolve(["notes/toggled.md"]);
			}
			if (command === "pinned_files_list") {
				return Promise.resolve(
					currentSpacePath === "/space-a"
						? ["notes/alpha.md"]
						: ["docs/beta.md"],
				);
			}
			return Promise.resolve(null);
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

	it("loads pinned files per space and updates after toggling", async () => {
		await act(async () => {
			root.render(
				<FileTreeProvider>
					<Consumer />
				</FileTreeProvider>,
			);
		});

		expect(container.textContent).toContain("notes/alpha.md");

		const toggleButton = Array.from(container.querySelectorAll("button")).find(
			(node) => node.textContent === "Toggle",
		);
		await act(async () => {
			(toggleButton as HTMLButtonElement | undefined)?.click();
		});
		expect(container.textContent).toContain("notes/toggled.md");

		currentSpacePath = "/space-b";
		await act(async () => {
			root.render(
				<FileTreeProvider>
					<Consumer />
				</FileTreeProvider>,
			);
		});

		expect(container.textContent).toContain("docs/beta.md");
		expect(container.textContent).not.toContain("notes/alpha.md");
	});
});
