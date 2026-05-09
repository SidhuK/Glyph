// @vitest-environment jsdom

import { act } from "react";
import type React from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpaceSettingsPane } from "./SpaceSettingsPane";

const {
	getDailyNotesFolderMock,
	invokeMock,
	loadSettingsMock,
	setDailyNotesFolderMock,
	setEditorAttachmentFolderMock,
	setEditorAttachmentStorageModeMock,
	setQuickNotesFolderMock,
} = vi.hoisted(() => ({
	getDailyNotesFolderMock: vi.fn(() => Promise.resolve(null)),
	invokeMock: vi.fn(),
	loadSettingsMock: vi.fn(() =>
		Promise.resolve({
			currentSpacePath: "/spaces/test",
			editor: {
				attachmentStorageMode: "note-folder",
				attachmentFolder: "assets",
			},
			quickNotes: {
				folder: "Quick Notes",
			},
		}),
	),
	setDailyNotesFolderMock: vi.fn(() => Promise.resolve()),
	setEditorAttachmentFolderMock: vi.fn(() => Promise.resolve()),
	setEditorAttachmentStorageModeMock: vi.fn(() => Promise.resolve()),
	setQuickNotesFolderMock: vi.fn(() => Promise.resolve()),
}));

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../lib/settings", () => ({
	DEFAULT_QUICK_NOTES_FOLDER: "Quick Notes",
	getDailyNotesFolder: getDailyNotesFolderMock,
	loadSettings: loadSettingsMock,
	setDailyNotesFolder: setDailyNotesFolderMock,
	setEditorAttachmentFolder: setEditorAttachmentFolderMock,
	setEditorAttachmentStorageMode: setEditorAttachmentStorageModeMock,
	setQuickNotesFolder: setQuickNotesFolderMock,
}));

vi.mock("../../lib/tauri", () => ({
	invoke: invokeMock,
}));

vi.mock("./TemplatesSettingsPane", () => ({
	TemplateSettingsSections: () => null,
}));

vi.mock("../ui/shadcn/button", () => ({
	Button: ({
		children,
		...props
	}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
}));

vi.mock("@hugeicons/react", () => ({
	HugeiconsIcon: () => null,
}));

vi.mock("../Icons", () => ({
	Trash2: () => null,
}));

vi.mock("../Icons/NavigationIcons", () => ({
	FolderOpen: () => null,
}));

vi.mock("./SettingsScaffold", () => ({
	SettingsSection: ({
		children,
		title,
	}: {
		children: React.ReactNode;
		title: string;
	}) => (
		<section>
			<h2>{title}</h2>
			{children}
		</section>
	),
	SettingsRow: ({
		children,
		label,
		description,
	}: {
		children: React.ReactNode;
		label: React.ReactNode;
		description?: React.ReactNode;
	}) => (
		<div>
			<div>{label}</div>
			{description ? <div>{description}</div> : null}
			{children}
		</div>
	),
	SettingsValueCard: ({
		value,
	}: {
		icon: React.ReactNode;
		value: string;
	}) => <div>{value}</div>,
}));

describe("SpaceSettingsPane", () => {
	let container: HTMLDivElement;
	let root: Root;

	function getAttachmentsSection(): HTMLElement {
		const heading = Array.from(container.querySelectorAll("h2")).find(
			(node) => node.textContent === "Attachments",
		);
		if (!(heading instanceof HTMLElement) || !heading.parentElement) {
			throw new Error("Attachments section not found");
		}
		return heading.parentElement;
	}

	beforeEach(() => {
		vi.clearAllMocks();
		invokeMock.mockResolvedValue("/spaces/test");

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

	it("renders the attachment location dropdown with all three options", async () => {
		await act(async () => {
			root.render(<SpaceSettingsPane />);
			await Promise.resolve();
		});

		const select = container.querySelector(
			'select[aria-label="Attachment location"]',
		) as HTMLSelectElement | null;
		expect(select).not.toBeNull();
		const options = Array.from(select?.options ?? []).map((option) => ({
			label: option.textContent,
			value: option.value,
		}));
		expect(options).toEqual([
			{ label: "Main space folder", value: "space-root" },
			{ label: "Specific folder", value: "specific-folder" },
			{ label: "Same folder as note", value: "note-folder" },
		]);
		expect(getAttachmentsSection().textContent).not.toContain("Browse");
	});

	it("shows the folder picker only for specific-folder mode", async () => {
		await act(async () => {
			root.render(<SpaceSettingsPane />);
			await Promise.resolve();
		});

		const select = container.querySelector(
			'select[aria-label="Attachment location"]',
		) as HTMLSelectElement;

		await act(async () => {
			select.value = "specific-folder";
			select.dispatchEvent(new Event("change", { bubbles: true }));
			await Promise.resolve();
		});

		expect(setEditorAttachmentStorageModeMock).toHaveBeenCalledWith(
			"specific-folder",
		);
		expect(getAttachmentsSection().textContent).toContain("Browse");
		expect(getAttachmentsSection().textContent).toContain("assets");

		await act(async () => {
			select.value = "space-root";
			select.dispatchEvent(new Event("change", { bubbles: true }));
			await Promise.resolve();
		});

		expect(setEditorAttachmentStorageModeMock).toHaveBeenCalledWith(
			"space-root",
		);
		expect(getAttachmentsSection().textContent).not.toContain("Browse");
	});
});
