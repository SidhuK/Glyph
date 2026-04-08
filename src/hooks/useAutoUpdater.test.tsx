// @vitest-environment jsdom

import { act, useEffect } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/window", () => ({
	getCurrentWindow: () => ({
		label: "main",
	}),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
	relaunch: vi.fn(),
}));

const checkMock = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({
	check: checkMock,
}));

const setAutoUpdateLastCheckedAtMock = vi.fn();
vi.mock("../lib/settings", () => ({
	setAutoUpdateLastCheckedAt: setAutoUpdateLastCheckedAtMock,
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
		checkMock.mockResolvedValue(null);

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

		expect(checkMock).not.toHaveBeenCalled();
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

		expect(checkMock).toHaveBeenCalledTimes(1);
		expect(states).toContain(false);
	});
});
