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
			dailyNotes: {
				folder: null,
			},
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

vi.mock("../../lib/settings", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../lib/settings")>();
	return {
		...actual,
		getDailyNotesFolder: getDailyNotesFolderMock,
		loadSettings: loadSettingsMock,
		setDailyNotesFolder: setDailyNotesFolderMock,
		setEditorAttachmentFolder: setEditorAttachmentFolderMock,
		setEditorAttachmentStorageMode: setEditorAttachmentStorageModeMock,
		setQuickNotesFolder: setQuickNotesFolderMock,
	};
});

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
	ChevronDown: () => null,
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

	it("renders the attachment location dropdown with all four options", async () => {
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
			{ label: "At the top of your space", value: "space-root" },
			{ label: "One folder for all attachments", value: "specific-folder" },
			{ label: "Next to each note", value: "note-folder" },
			{
				label: "In a subfolder with the note",
				value: "note-subfolder",
			},
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
			{ spacePath: "/spaces/test" },
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
			{ spacePath: "/spaces/test" },
		);
		expect(getAttachmentsSection().textContent).not.toContain("Browse");
	});

	it("shows the subfolder text input for note-subfolder mode", async () => {
		await act(async () => {
			root.render(<SpaceSettingsPane />);
			await Promise.resolve();
		});

		const select = container.querySelector(
			'select[aria-label="Attachment location"]',
		) as HTMLSelectElement;

		await act(async () => {
			select.value = "note-subfolder";
			select.dispatchEvent(new Event("change", { bubbles: true }));
			await Promise.resolve();
		});

		expect(setEditorAttachmentStorageModeMock).toHaveBeenCalledWith(
			"note-subfolder",
			{ spacePath: "/spaces/test" },
		);
		expect(
			container.querySelector('input[aria-label="Attachment subfolder name"]'),
		).not.toBeNull();
		expect(getAttachmentsSection().textContent).not.toContain("Browse");
		expect(getAttachmentsSection().textContent).toContain(
			"Attachments go in this subfolder inside the note's folder.",
		);
	});

	it("resets the attachment folder when switching between folder modes", async () => {
		loadSettingsMock.mockResolvedValueOnce({
			currentSpacePath: "/spaces/test",
			dailyNotes: { folder: null },
			editor: {
				attachmentStorageMode: "specific-folder",
				attachmentFolder: "Projects/Media",
			},
			quickNotes: { folder: "Quick Notes" },
		});

		await act(async () => {
			root.render(<SpaceSettingsPane />);
			await Promise.resolve();
		});

		const select = container.querySelector(
			'select[aria-label="Attachment location"]',
		) as HTMLSelectElement;

		await act(async () => {
			select.value = "note-subfolder";
			select.dispatchEvent(new Event("change", { bubbles: true }));
			await Promise.resolve();
		});

		expect(setEditorAttachmentFolderMock).toHaveBeenCalledWith("assets", {
			spacePath: "/spaces/test",
		});
	});

	it("preserves the attachment folder when switching back to specific-folder", async () => {
		loadSettingsMock.mockResolvedValueOnce({
			currentSpacePath: "/spaces/test",
			dailyNotes: { folder: null },
			editor: {
				attachmentStorageMode: "specific-folder",
				attachmentFolder: "Projects/Media",
			},
			quickNotes: { folder: "Quick Notes" },
		});

		await act(async () => {
			root.render(<SpaceSettingsPane />);
			await Promise.resolve();
		});

		const select = container.querySelector(
			'select[aria-label="Attachment location"]',
		) as HTMLSelectElement;

		await act(async () => {
			select.value = "note-folder";
			select.dispatchEvent(new Event("change", { bubbles: true }));
			await Promise.resolve();
		});

		setEditorAttachmentFolderMock.mockClear();

		await act(async () => {
			select.value = "specific-folder";
			select.dispatchEvent(new Event("change", { bubbles: true }));
			await Promise.resolve();
		});

		expect(setEditorAttachmentFolderMock).not.toHaveBeenCalled();
		expect(getAttachmentsSection().textContent).toContain("Projects/Media");
	});

	it("does not reset the attachment folder when entering note-subfolder from note-folder", async () => {
		loadSettingsMock.mockResolvedValueOnce({
			currentSpacePath: "/spaces/test",
			dailyNotes: { folder: null },
			editor: {
				attachmentStorageMode: "note-folder",
				attachmentFolder: "Projects/Media",
			},
			quickNotes: { folder: "Quick Notes" },
		});

		await act(async () => {
			root.render(<SpaceSettingsPane />);
			await Promise.resolve();
		});

		const select = container.querySelector(
			'select[aria-label="Attachment location"]',
		) as HTMLSelectElement;

		await act(async () => {
			select.value = "note-subfolder";
			select.dispatchEvent(new Event("change", { bubbles: true }));
			await Promise.resolve();
		});

		expect(setEditorAttachmentFolderMock).not.toHaveBeenCalled();
		const input = container.querySelector(
			'input[aria-label="Attachment subfolder name"]',
		) as HTMLInputElement | null;
		expect(input?.value).toBe("Projects/Media");
	});

	it("shows validation errors for invalid subfolder paths on blur", async () => {
		loadSettingsMock.mockResolvedValueOnce({
			currentSpacePath: "/spaces/test",
			dailyNotes: { folder: null },
			editor: {
				attachmentStorageMode: "note-subfolder",
				attachmentFolder: "../secret",
			},
			quickNotes: { folder: "Quick Notes" },
		});

		await act(async () => {
			root.render(<SpaceSettingsPane />);
			await Promise.resolve();
		});

		const input = container.querySelector(
			'input[aria-label="Attachment subfolder name"]',
		) as HTMLInputElement;

		await act(async () => {
			input.focus();
		});

		await act(async () => {
			input.blur();
			await Promise.resolve();
		});

		expect(setEditorAttachmentFolderMock).not.toHaveBeenCalled();
		expect(
			container.querySelector("#attachmentSubfolderError")?.textContent,
		).toContain("Folder path cannot contain '..'.");
		expect(input.getAttribute("aria-invalid")).toBe("true");
	});
});
