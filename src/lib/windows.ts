import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/window";

export type SettingsTab = "general" | "appearance" | "ai" | "space" | "about";

const SETTINGS_WINDOW_RATIO = 0.7;
const SETTINGS_MIN_WIDTH = 980;
const SETTINGS_MIN_HEIGHT = 760;

async function getPreferredSettingsWindowSize() {
	const mainWindow = await WebviewWindow.getByLabel("main");
	if (!mainWindow) {
		return {
			width: SETTINGS_MIN_WIDTH,
			height: SETTINGS_MIN_HEIGHT,
		};
	}

	try {
		const [mainSize, scaleFactor] = await Promise.all([
			mainWindow.innerSize(),
			mainWindow.scaleFactor(),
		]);
		const logicalSize = mainSize.toLogical(scaleFactor);

		return {
			width: Math.max(
				SETTINGS_MIN_WIDTH,
				Math.round(logicalSize.width * SETTINGS_WINDOW_RATIO),
			),
			height: Math.max(
				SETTINGS_MIN_HEIGHT,
				Math.round(logicalSize.height * SETTINGS_WINDOW_RATIO),
			),
		};
	} catch {
		return {
			width: SETTINGS_MIN_WIDTH,
			height: SETTINGS_MIN_HEIGHT,
		};
	}
}

export async function openSettingsWindow(tab?: SettingsTab) {
	const existing = await WebviewWindow.getByLabel("settings");
	if (existing) {
		try {
			await existing.show();
			await existing.setFocus();
		} catch {
			// If the handle is stale (e.g., window was closed/destroyed), fall through
			// and recreate it.
		}
		try {
			const size = await getPreferredSettingsWindowSize();
			await existing.setSize(new LogicalSize(size.width, size.height));
		} catch {
			// Best-effort resize only. Showing the existing settings window matters more.
		}
		try {
			if (tab) {
				await existing.emit("settings:navigate", { tab });
			}
			return;
		} catch {
			// If the existing handle is stale, fall through and recreate it.
		}
	}

	const size = await getPreferredSettingsWindowSize();
	const url = tab ? `#/settings?tab=${encodeURIComponent(tab)}` : "#/settings";
	const win = new WebviewWindow("settings", {
		title: "Settings",
		url,
		width: size.width,
		height: size.height,
		resizable: true,
		decorations: false,
		transparent: true,
	});

	win.once("tauri://created", () => {
		console.debug("settings window created");
	});
	win.once("tauri://error", (event) => {
		console.error("failed to create settings window", event);
	});
}
