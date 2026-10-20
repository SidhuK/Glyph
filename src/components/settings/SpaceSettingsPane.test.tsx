// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import type React from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ATTACHMENT_LOCATION_OPTIONS } from "../../lib/attachmentStorage";
import type { AttachmentStorageMode } from "../../lib/settings";
import { SpaceSettingsPane } from "./SpaceSettingsPane";

const { invokeMock, loadSettingsMock, writeSpaceSettingMock } = vi.hoisted(() => ({
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
				enablePeopleMentionsAsTags: false,
			},
			quickNotes: {
				folder: "Quick Notes",
			},
		}),
	),
	writeSpaceSettingMock: vi.fn(
		(_definition: { field: string }, _value: unknown, _scope: { spacePath?: string | null }) =>
			Promise.resolve(),
	),
}));

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../contexts", () => ({
	useSpace: () => ({
		spacePath: "/spaces/test",
		startIndexRebuild: vi.fn(() => Promise.resolve()),
	}),
	useUILayoutContext: () => ({
		archiveEnabled: false,
		settingsSpacePath: "/spaces/test",
		periodNotesEnabled: { week: false, month: false, quarter: false },
	}),
}));

vi.mock("../../lib/settings", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../lib/settings")>();
	return {
		...actual,
		loadSettings: loadSettingsMock,
		writeSpaceSetting: writeSpaceSettingMock,
	};
});

vi.mock("../../lib/settings/definitions", () => ({
	DURABLE_SETTINGS: {
		editorEnablePeopleMentionsAsTags: {
			write: vi.fn(() => Promise.resolve()),
		},
	},
	SPACE_SETTINGS: {
		archiveEnabled: { field: "archiveEnabled" },
		dailyNotesFolder: { field: "dailyNotesFolder" },
		quickNotesFolder: { field: "quickNotesFolder" },
		attachmentStorageMode: { field: "attachmentStorageMode" },
		attachmentFolder: { field: "attachmentFolder" },
	},
	isAttachmentStorageMode: (value: unknown) =>
		value === "space-root" ||
		value === "specific-folder" ||
		value === "note-folder" ||
		value === "note-subfolder",
}));

vi.mock("../../lib/tauri", () => ({
	invoke: invokeMock,
}));

vi.mock("../../lib/tauriEvents", () => ({
	useTauriEvent: vi.fn(),
}));

vi.mock("./TemplatesSettingsPane", () => ({
	TemplateSettingsSections: () => null,
}));

vi.mock("../ui/shadcn/button", () => ({
	Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
}));

// jsdom lacks the Web Animations API, so drive the unanimated Base UI select with the same parts.
vi.mock("@animate-ui/react/primitives/base-ui/select", async () => ({
	Select: (await import("@base-ui/react/select")).Select,
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
	SettingsSection: ({ children, title }: { children: React.ReactNode; title: string }) => (
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
	SettingsValueCard: ({ value }: { icon: React.ReactNode; value: string }) => <div>{value}</div>,
	SettingsToggle: ({
		checked,
		ariaLabel,
		onCheckedChange,
	}: {
		checked: boolean;
		ariaLabel: string;
		onCheckedChange: (checked: boolean) => void;
	}) => (
		<input
			aria-label={ariaLabel}
			checked={checked}
			onChange={(event) => onCheckedChange(event.currentTarget.checked)}
			type="checkbox"
		/>
	),
}));

describe("SpaceSettingsPane", () => {
	let container: HTMLDivElement;
	let root: Root;
	let queryClient: QueryClient;

	function spaceSettingCalls(field: string) {
		return writeSpaceSettingMock.mock.calls.filter((call) => call[0].field === field);
	}

	function expectSpaceSetting(field: string, value: unknown, spacePath = "/spaces/test") {
		expect(writeSpaceSettingMock).toHaveBeenCalledWith({ field }, value, {
			spacePath,
		});
	}

	async function chooseAttachmentLocation(mode: AttachmentStorageMode) {
		const trigger = container.querySelector('[aria-label="Attachment location"]');
		if (!(trigger instanceof HTMLElement)) throw new Error("Attachment location select not found");
		await act(async () => {
			trigger.click();
			await Promise.resolve();
		});
		const label = ATTACHMENT_LOCATION_OPTIONS.find((option) => option.value === mode)?.label;
		const option = Array.from(document.querySelectorAll('[role="option"]')).find(
			(node) => node.textContent === label,
		);
		if (!(option instanceof HTMLElement)) throw new Error(`Option for ${mode} not found`);
		await act(async () => {
			option.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
			option.click();
			await Promise.resolve();
		});
	}

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
		queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
		});
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
		queryClient.clear();
	});

	it("shows the subfolder text input for note-subfolder mode", async () => {
		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<SpaceSettingsPane />
				</QueryClientProvider>,
			);
			await Promise.resolve();
		});

		await chooseAttachmentLocation("note-subfolder");

		expectSpaceSetting("attachmentStorageMode", "note-subfolder");
		expect(container.querySelector('input[aria-label="Attachment subfolder name"]')).not.toBeNull();
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
				enablePeopleMentionsAsTags: false,
			},
			quickNotes: { folder: "Quick Notes" },
		});

		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<SpaceSettingsPane />
				</QueryClientProvider>,
			);
			await Promise.resolve();
		});

		await chooseAttachmentLocation("note-subfolder");

		expectSpaceSetting("attachmentFolder", "assets");
	});

	it("preserves the attachment folder when switching back to specific-folder", async () => {
		loadSettingsMock.mockResolvedValueOnce({
			currentSpacePath: "/spaces/test",
			dailyNotes: { folder: null },
			editor: {
				attachmentStorageMode: "specific-folder",
				attachmentFolder: "Projects/Media",
				enablePeopleMentionsAsTags: false,
			},
			quickNotes: { folder: "Quick Notes" },
		});

		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<SpaceSettingsPane />
				</QueryClientProvider>,
			);
			await Promise.resolve();
		});

		await chooseAttachmentLocation("note-folder");

		writeSpaceSettingMock.mockClear();

		await chooseAttachmentLocation("specific-folder");

		expect(spaceSettingCalls("attachmentFolder")).toHaveLength(0);
		expect(getAttachmentsSection().textContent).toContain("Projects/Media");
	});

	it("does not reset the attachment folder when entering note-subfolder from note-folder", async () => {
		loadSettingsMock.mockResolvedValueOnce({
			currentSpacePath: "/spaces/test",
			dailyNotes: { folder: null },
			editor: {
				attachmentStorageMode: "note-folder",
				attachmentFolder: "Projects/Media",
				enablePeopleMentionsAsTags: false,
			},
			quickNotes: { folder: "Quick Notes" },
		});

		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<SpaceSettingsPane />
				</QueryClientProvider>,
			);
			await Promise.resolve();
		});

		await chooseAttachmentLocation("note-subfolder");

		expect(spaceSettingCalls("attachmentFolder")).toHaveLength(0);
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
				enablePeopleMentionsAsTags: false,
			},
			quickNotes: { folder: "Quick Notes" },
		});

		await act(async () => {
			root.render(
				<QueryClientProvider client={queryClient}>
					<SpaceSettingsPane />
				</QueryClientProvider>,
			);
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

		expect(spaceSettingCalls("attachmentFolder")).toHaveLength(0);
		expect(container.querySelector("#attachmentSubfolderError")?.textContent).toContain(
			"Folder path cannot contain '..'.",
		);
		expect(input.getAttribute("aria-invalid")).toBe("true");
	});
});
