// @vitest-environment jsdom

import { act } from "react";
import type React from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdvancedSettingsPane } from "./AdvancedSettingsPane";

const {
	loadSettingsMock,
	setAiAssistantModeMock,
	setDatabaseShowColumnColorMock,
	setEditorBeautifulTagsMock,
	setEditorColorfulHeadingsMock,
	setEditorEnablePeopleMentionsAsTagsMock,
	setEditorShowFrontmatterInEditorMock,
	setEditorShowCollapsibleHeadingsMock,
	setEditorWidthModeMock,
	setEditorVimKeybindingsMock,
	setFolioModeMock,
	setShowFileTreeFolderCountsMock,
	setShowTocMock,
} = vi.hoisted(() => ({
	loadSettingsMock: vi.fn(),
	setAiAssistantModeMock: vi.fn(() => Promise.resolve()),
	setDatabaseShowColumnColorMock: vi.fn(() => Promise.resolve()),
	setEditorBeautifulTagsMock: vi.fn(() => Promise.resolve()),
	setEditorColorfulHeadingsMock: vi.fn(() => Promise.resolve()),
	setEditorEnablePeopleMentionsAsTagsMock: vi.fn(() => Promise.resolve()),
	setEditorShowFrontmatterInEditorMock: vi.fn(() => Promise.resolve()),
	setEditorShowCollapsibleHeadingsMock: vi.fn(() => Promise.resolve()),
	setEditorWidthModeMock: vi.fn(() => Promise.resolve()),
	setEditorVimKeybindingsMock: vi.fn(() => Promise.resolve()),
	setFolioModeMock: vi.fn(() => Promise.resolve()),
	setShowFileTreeFolderCountsMock: vi.fn(() => Promise.resolve()),
	setShowTocMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../contexts", () => ({
	useSpace: () => ({
		spacePath: null,
		startIndexRebuild: vi.fn(() => Promise.resolve()),
	}),
}));

vi.mock("../../lib/settings", () => ({
	loadSettings: loadSettingsMock,
	setAiAssistantMode: setAiAssistantModeMock,
	setDatabaseShowColumnColor: setDatabaseShowColumnColorMock,
	setEditorBeautifulTags: setEditorBeautifulTagsMock,
	setEditorColorfulHeadings: setEditorColorfulHeadingsMock,
	setEditorEnablePeopleMentionsAsTags: setEditorEnablePeopleMentionsAsTagsMock,
	setEditorShowFrontmatterInEditor: setEditorShowFrontmatterInEditorMock,
	setEditorShowCollapsibleHeadings: setEditorShowCollapsibleHeadingsMock,
	setEditorWidthMode: setEditorWidthModeMock,
	setEditorVimKeybindings: setEditorVimKeybindingsMock,
	setFolioMode: setFolioModeMock,
	setShowFileTreeFolderCounts: setShowFileTreeFolderCountsMock,
	setShowToc: setShowTocMock,
}));

vi.mock("../../lib/tauri", () => ({
	invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../lib/tauriEvents", () => ({
	useTauriEvent: () => {},
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
		label,
		description,
		children,
	}: {
		children: React.ReactNode;
		description?: string;
		label?: string;
	}) => (
		<div>
			{label ? <div>{label}</div> : null}
			{description ? <div>{description}</div> : null}
			{children}
		</div>
	),
	SettingsToggle: ({
		checked,
		onCheckedChange,
		ariaLabel,
		disabled,
	}: {
		ariaLabel: string;
		checked: boolean;
		disabled?: boolean;
		onCheckedChange: (checked: boolean) => void;
	}) => (
		<input
			type="checkbox"
			aria-label={ariaLabel}
			checked={checked}
			disabled={disabled}
			onChange={(event) => onCheckedChange(event.currentTarget.checked)}
		/>
	),
}));

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

function makeSettings(colorfulHeadings: boolean, vimKeybindings = false) {
	return {
		editor: {
			beautifulTags: false,
			colorfulHeadings,
			editorWidthMode: "compact" as const,
			enablePeopleMentionsAsTags: false,
			showCollapsibleHeadings: false,
			showFrontmatterInEditor: false,
			vimKeybindings,
		},
		ui: {
			aiAssistantMode: "create" as const,
			folioMode: false,
			showFileTreeFolderCounts: false,
			showToc: true,
		},
		database: {
			showColumnColor: true,
		},
	};
}

describe("AdvancedSettingsPane", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.clearAllMocks();
		loadSettingsMock.mockResolvedValue(makeSettings(false));
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

	it("shows colorful headings off by default", async () => {
		await act(async () => {
			root.render(<AdvancedSettingsPane />);
		});

		const toggle = container.querySelector(
			'input[aria-label="Colorful headings"]',
		) as HTMLInputElement | null;

		expect(container.textContent).toContain("Colorful headings");
		expect(toggle?.checked).toBe(false);
	});

	it("reflects stored colorful heading state", async () => {
		loadSettingsMock.mockResolvedValue(makeSettings(true));

		await act(async () => {
			root.render(<AdvancedSettingsPane />);
		});

		const toggle = container.querySelector(
			'input[aria-label="Colorful headings"]',
		) as HTMLInputElement | null;

		expect(toggle?.checked).toBe(true);
	});

	it("saves colorful heading changes", async () => {
		await act(async () => {
			root.render(<AdvancedSettingsPane />);
		});

		const toggle = container.querySelector(
			'input[aria-label="Colorful headings"]',
		) as HTMLInputElement | null;
		expect(toggle).toBeTruthy();

		await act(async () => {
			toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(setEditorColorfulHeadingsMock).toHaveBeenCalledWith(true);
	});

	it("saves show frontmatter in editor changes", async () => {
		await act(async () => {
			root.render(<AdvancedSettingsPane />);
		});

		const toggle = container.querySelector(
			'input[aria-label="Show frontmatter in editor"]',
		) as HTMLInputElement | null;
		expect(toggle).toBeTruthy();

		await act(async () => {
			toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(setEditorShowFrontmatterInEditorMock).toHaveBeenCalledWith(true);
	});

	it("saves editor width mode changes", async () => {
		await act(async () => {
			root.render(<AdvancedSettingsPane />);
		});

		const segmented = container.querySelector(
			'select[aria-label="Editor width"]',
		) as HTMLSelectElement | null;
		expect(segmented).toBeTruthy();
		if (!segmented) return;

		await act(async () => {
			segmented.value = "wide";
			segmented.dispatchEvent(new Event("change", { bubbles: true }));
		});

		expect(setEditorWidthModeMock).toHaveBeenCalledWith("wide");
	});

	it("shows Vim Mode off by default", async () => {
		await act(async () => {
			root.render(<AdvancedSettingsPane />);
		});

		const toggle = container.querySelector(
			'input[aria-label="Vim Mode"]',
		) as HTMLInputElement | null;

		expect(container.textContent).toContain("Vim Mode");
		expect(toggle?.checked).toBe(false);
	});

	it("reflects stored Vim keybinding state", async () => {
		loadSettingsMock.mockResolvedValue(makeSettings(false, true));

		await act(async () => {
			root.render(<AdvancedSettingsPane />);
		});

		const toggle = container.querySelector(
			'input[aria-label="Vim Mode"]',
		) as HTMLInputElement | null;

		expect(toggle?.checked).toBe(true);
	});

	it("saves Vim keybinding changes", async () => {
		await act(async () => {
			root.render(<AdvancedSettingsPane />);
		});

		const toggle = container.querySelector(
			'input[aria-label="Vim Mode"]',
		) as HTMLInputElement | null;
		expect(toggle).toBeTruthy();

		await act(async () => {
			toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(setEditorVimKeybindingsMock).toHaveBeenCalledWith(true);
	});

	it("saves Folio Mode changes", async () => {
		await act(async () => {
			root.render(<AdvancedSettingsPane />);
		});

		const toggle = container.querySelector(
			'input[aria-label="Folio Mode"]',
		) as HTMLInputElement | null;
		expect(toggle).toBeTruthy();

		await act(async () => {
			toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(setFolioModeMock).toHaveBeenCalledWith(true);
	});
});
