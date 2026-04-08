// @vitest-environment jsdom

import { act } from "react";
import type React from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GeneralSettingsPane } from "./GeneralSettingsPane";

const { useLicenseStatusMock } =
	vi.hoisted(() => ({
		useLicenseStatusMock: vi.fn(),
	}));

vi.mock("../../lib/settings", async () => {
	const actual =
		await vi.importActual<typeof import("../../lib/settings")>(
			"../../lib/settings",
		);
	return {
		...actual,
	};
});

vi.mock("../../lib/license", () => ({
	useLicenseStatus: useLicenseStatusMock,
}));

vi.mock("../../lib/tauri", () => ({
	invoke: vi.fn(),
}));

vi.mock("./TemplatesSettingsPane", () => ({
	TemplateSettingsSections: () => <div>Templates Stub</div>,
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

	it("hides the updates section for community builds", async () => {
		useLicenseStatusMock.mockReturnValue({
			status: { mode: "community_build", can_auto_update: false },
			loading: false,
			error: "",
			reload: vi.fn(),
		} as never);

		await act(async () => {
			root.render(<GeneralSettingsPane />);
		});

		expect(container.textContent).not.toContain("Automatic update checks");
		expect(container.textContent).toContain("License Card Stub");
	});

	it("shows the updates section for official builds", async () => {
		useLicenseStatusMock.mockReturnValue({
			status: { mode: "licensed", can_auto_update: true },
			loading: false,
			error: "",
			reload: vi.fn(),
		} as never);

		await act(async () => {
			root.render(<GeneralSettingsPane />);
		});

		expect(container.textContent).toContain("Automatic update checks");
		expect(container.textContent).toContain(
			"Glyph checks for updates when the app opens and again every 3 hours while it stays open.",
		);
	});

	it("keeps the updates section visible while license status is loading", async () => {
		useLicenseStatusMock.mockReturnValue({
			status: undefined,
			loading: true,
			error: "",
			reload: vi.fn(),
		} as never);

		await act(async () => {
			root.render(<GeneralSettingsPane />);
		});

		expect(container.textContent).toContain("Automatic update checks");
	});
});
