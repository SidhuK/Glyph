// @vitest-environment jsdom

import { act, useEffect } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
	listen: vi.fn().mockResolvedValue(vi.fn()),
}));

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () => ({
		label: "main",
	}),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
	relaunch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
	Update: class {
		version: string;
		download = vi.fn().mockResolvedValue(undefined);
		install = vi.fn().mockResolvedValue(undefined);

		constructor(metadata: { version: string }) {
			this.version = metadata.version;
		}
	},
}));

const setAutoUpdateLastCheckedAtMock = vi.fn();
const loadSettingsMock = vi.fn();
vi.mock("../lib/settings", () => ({
	loadSettings: loadSettingsMock,
	setAutoUpdateLastCheckedAt: setAutoUpdateLastCheckedAtMock,
}));

const invokeMock = vi.fn();
vi.mock("../lib/tauri", () => ({
	invoke: invokeMock,
}));

(
	globalThis as typeof globalThis & {
		IS_REACT_ACT_ENVIRONMENT?: boolean;
	}
).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({
	enabled,
	onReady,
}: {
	enabled: boolean;
	onReady: (ready: boolean) => void;
}) {
	const { updateReady } = useAutoUpdater(enabled);

	useEffect(() => {
		onReady(updateReady);
	}, [onReady, updateReady]);

	return null;
}

let useAutoUpdater: typeof import("./useAutoUpdater").useAutoUpdater;

describe("useAutoUpdater", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(async () => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.stubEnv("DEV", false);

		setAutoUpdateLastCheckedAtMock.mockResolvedValue(undefined);
		loadSettingsMock.mockResolvedValue({
			ui: {
				releaseChannel: "stable",
			},
		});
		invokeMock.mockResolvedValue(null);

		({ useAutoUpdater } = await import("./useAutoUpdater"));

		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
		vi.unstubAllEnvs();
	});

	it("does not call the updater when disabled", async () => {
		await act(async () => {
			root.render(<Harness enabled={false} onReady={() => {}} />);
		});

		await act(async () => {
			await Promise.resolve();
		});

		expect(invokeMock).not.toHaveBeenCalled();
	});

	it("checks for updates when enabled", async () => {
		const states: boolean[] = [];

		await act(async () => {
			root.render(
				<Harness
					enabled
					onReady={(ready) => {
						states.push(ready);
					}}
				/>,
			);
		});

		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 0));
			await new Promise((resolve) => window.setTimeout(resolve, 0));
		});

		expect(invokeMock).toHaveBeenCalledTimes(1);
		expect(invokeMock).toHaveBeenCalledWith("updater_check_release_channel", {
			channel: "stable",
		});
		expect(states).toContain(false);
	});

	it("reports updateReady when an update is available", async () => {
		const states: boolean[] = [];
		invokeMock.mockResolvedValue({ version: "1.2.3" });

		await act(async () => {
			root.render(
				<Harness
					enabled
					onReady={(ready) => {
						states.push(ready);
					}}
				/>,
			);
		});

		await act(async () => {
			await new Promise((resolve) => window.setTimeout(resolve, 0));
			await new Promise((resolve) => window.setTimeout(resolve, 0));
		});

		expect(states).toContain(true);
	});
});
