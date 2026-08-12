// @vitest-environment jsdom

import { act } from "react";
import type React from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeneralSettingsPane } from "./GeneralSettingsPane";

const { useLicenseStatusMock, useTauriEventMock } = vi.hoisted(() => ({
	useLicenseStatusMock: vi.fn(),
	useTauriEventMock: vi.fn(),
}));

vi.mock("../../lib/settings", () => ({
	isFocusMode: (value: unknown) =>
		value === "off" || value === "paragraph" || value === "sentence",
	DATE_DISPLAY_FORMAT_OPTIONS: [
		{ value: "us", label: "US — 08/23/2026" },
		{ value: "european", label: "European — 23/08/2026" },
		{ value: "friendly", label: "Friendly — August 23, 2026" },
		{ value: "iso", label: "ISO — 2026-08-23" },
	],
	DEFAULT_DATE_DISPLAY_FORMAT: "friendly",
	isDateDisplayFormat: (value: unknown) =>
		value === "us" ||
		value === "european" ||
		value === "friendly" ||
		value === "iso",
	loadSettings: vi.fn(() =>
		Promise.resolve({
			ui: {
				language: "en",
				dateDisplayFormat: "friendly",
				resumeLastSession: false,
				keepRunningOnLastWindowClose: false,
				showToc: true,
				showFileTreeFolderCounts: false,
				showNonMarkdownFiles: true,
			},
			editor: {
				showFrontmatterInEditor: false,
				showHeadingPrefixes: true,
				colorfulHeadings: false,
				headingPaletteId: "classy",
				showCollapsibleHeadings: false,
				showCollapsibleLists: false,
				spellCheck: true,
				showExternalLinkPreviews: false,
				rawMarkdownVimMode: false,
				defaultEditorMode: "rich",
			},
		}),
	),
	setLanguage: vi.fn(() => Promise.resolve()),
	setDateDisplayFormat: vi.fn(() => Promise.resolve()),
	setResumeLastSession: vi.fn(() => Promise.resolve()),
	setKeepRunningOnLastWindowClose: vi.fn(() => Promise.resolve()),
	setShowToc: vi.fn(() => Promise.resolve()),
	setEditorShowFrontmatterInEditor: vi.fn(() => Promise.resolve()),
	setEditorShowHeadingPrefixes: vi.fn(() => Promise.resolve()),
	setEditorColorfulHeadings: vi.fn(() => Promise.resolve()),
	setEditorHeadingPaletteId: vi.fn(() => Promise.resolve()),
	setEditorShowCollapsibleHeadings: vi.fn(() => Promise.resolve()),
	setEditorShowCollapsibleLists: vi.fn(() => Promise.resolve()),
	setEditorSpellCheck: vi.fn(() => Promise.resolve()),
	setEditorShowExternalLinkPreviews: vi.fn(() => Promise.resolve()),
	setEditorRawMarkdownVimMode: vi.fn(() => Promise.resolve()),
	setEditorDefaultEditorMode: vi.fn(() => Promise.resolve()),
	setEditorFocusMode: vi.fn(() => Promise.resolve()),
	setShowFileTreeFolderCounts: vi.fn(() => Promise.resolve()),
	setShowNonMarkdownFiles: vi.fn(() => Promise.resolve()),
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { language: "en" },
	}),
	Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

vi.mock("../../lib/tauriEvents", () => ({
	useTauriEvent: useTauriEventMock,
}));

vi.mock("../../lib/license", () => ({
	useLicenseStatus: useLicenseStatusMock,
}));

vi.mock("../../lib/tauri", () => ({
	invoke: vi.fn(),
}));

vi.mock("./FileTreeSettingsSection", () => ({
	FileTreeSettingsSection: () => <div>File Tree Stub</div>,
}));

vi.mock("../licensing/LicenseSettingsCard", () => ({
	LicenseSettingsCard: () => <div>License Card Stub</div>,
}));

vi.mock("../ui/shadcn/button", () => ({
	Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
		<button {...props} />
	),
}));

vi.mock("./SettingsScaffold", () => ({
	SettingsInfoHint: ({ children }: { children: React.ReactNode }) => (
		<span>{children}</span>
	),
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
		label?: string;
		description?: string;
	}) => (
		<div>
			{label ? <div>{label}</div> : null}
			{description ? <div>{description}</div> : null}
			{children}
		</div>
	),
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

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

describe("GeneralSettingsPane", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		vi.clearAllMocks();

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

	it("shows license settings without automatic update check copy", async () => {
		useLicenseStatusMock.mockReturnValue({
			status: undefined,
			loading: true,
			error: "",
			reload: vi.fn(),
		} as never);

		await act(async () => {
			root.render(<GeneralSettingsPane />);
		});

		expect(container.textContent).not.toContain("Automatic update checks");
		expect(container.textContent).not.toContain(
			"Automatic updates are always on.",
		);
		expect(container.textContent).toContain("License Card Stub");
	});

	it("syncs resume last session from settings update events", async () => {
		useLicenseStatusMock.mockReturnValue({
			status: undefined,
			loading: true,
			error: "",
			reload: vi.fn(),
		} as never);

		await act(async () => {
			root.render(<GeneralSettingsPane />);
		});

		const toggle = container.querySelector(
			'input[aria-label="startup.openPreviousTabs.ariaLabel"]',
		) as HTMLInputElement | null;
		expect(toggle?.checked).toBe(false);

		const handler = useTauriEventMock.mock.calls.find(
			([eventName]) => eventName === "settings:updated",
		)?.[1] as (payload: { ui?: { resumeLastSession?: boolean } }) => void;

		act(() => {
			handler({ ui: {} });
		});
		expect(toggle?.checked).toBe(false);

		act(() => {
			handler({ ui: { resumeLastSession: true } });
		});
		expect(toggle?.checked).toBe(true);
	});
});
