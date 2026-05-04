// @vitest-environment jsdom

import { act, useEffect } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	UIProvider,
	useAISidebarContext,
	useUILayoutContext,
} from "./UIContext";

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () => ({
		onFocusChanged: () => Promise.resolve(() => {}),
	}),
}));

vi.mock("../lib/settings", () => ({
	loadSettings: vi.fn(async () => ({
		ui: {
			aiEnabled: true,
			aiAssistantMode: "create",
			showToc: true,
			folioMode: false,
		},
		dailyNotes: { folder: null },
		templates: { folder: null, dailyNoteTemplate: null },
	})),
	reloadFromDisk: vi.fn(async () => {}),
	setAiAssistantMode: vi.fn(),
	setFolioMode: vi.fn(),
	setShowToc: vi.fn(),
}));

vi.mock("../lib/tauriEvents", () => ({
	useTauriEvent: () => {},
}));

vi.mock("./SpaceContext", () => ({
	useSpace: () => ({ spacePath: "/spaces/test" }),
}));

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

interface CapturedContext {
	sidebarCollapsed: boolean;
	zenModeActive: boolean;
	aiPanelOpen: boolean;
	folioMode: boolean;
	setSidebarCollapsed: (collapsed: boolean) => void;
	setZenModeActive: (active: boolean) => void;
	setAiPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
}

function Harness({
	onCapture,
}: {
	onCapture: (value: CapturedContext) => void;
}) {
	const layout = useUILayoutContext();
	const ai = useAISidebarContext();

	useEffect(() => {
		onCapture({
			sidebarCollapsed: layout.sidebarCollapsed,
			zenModeActive: layout.zenModeActive,
			aiPanelOpen: ai.aiPanelOpen,
			folioMode: layout.folioMode,
			setSidebarCollapsed: layout.setSidebarCollapsed,
			setZenModeActive: layout.setZenModeActive,
			setAiPanelOpen: ai.setAiPanelOpen,
		});
	}, [ai, layout, onCapture]);

	return null;
}

describe("UIContext zen mode", () => {
	let container: HTMLDivElement;
	let root: Root;
	let captured: CapturedContext | null;

	beforeEach(() => {
		captured = null;
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

	it("forces sidebar and AI closed on entry, then restores their prior state on exit", async () => {
		await act(async () => {
			root.render(
				<UIProvider>
					<Harness
						onCapture={(value) => {
							captured = value;
						}}
					/>
				</UIProvider>,
			);
		});

		if (!captured) throw new Error("Expected UI context");

		act(() => {
			captured?.setSidebarCollapsed(false);
			captured?.setAiPanelOpen(true);
		});

		expect(captured?.sidebarCollapsed).toBe(false);
		expect(captured?.aiPanelOpen).toBe(true);

		act(() => {
			captured?.setZenModeActive(true);
		});

		expect(captured?.zenModeActive).toBe(true);
		expect(captured?.sidebarCollapsed).toBe(true);
		expect(captured?.aiPanelOpen).toBe(false);

		act(() => {
			captured?.setZenModeActive(false);
		});

		expect(captured?.zenModeActive).toBe(false);
		expect(captured?.sidebarCollapsed).toBe(false);
		expect(captured?.aiPanelOpen).toBe(true);
	});
});
