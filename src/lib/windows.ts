import { emitTo } from "@tauri-apps/api/event";
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

async function showSettingsWindow(window: WebviewWindow) {
	await window.show();
	try {
		await window.unminimize();
	} catch {
		// Some platforms reject this when the window was never minimized.
	}
	try {
		await window.setFocus();
	} catch {
		// Keep the reopened window visible even if focus cannot be stolen.
	}
}

async function navigateSettingsWindow(tab: SettingsTab | undefined) {
	if (!tab) return;
	await emitTo("settings", "settings:navigate", { tab });
}

async function resizeSettingsWindowIfNeeded(window: WebviewWindow) {
	try {
		if (await window.isVisible()) return;

		const [currentSize, scaleFactor] = await Promise.all([
			window.innerSize(),
			window.scaleFactor(),
		]);
		const logicalSize = currentSize.toLogical(scaleFactor);
		const isDefaultSize =
			Math.round(logicalSize.width) === SETTINGS_MIN_WIDTH &&
			Math.round(logicalSize.height) === SETTINGS_MIN_HEIGHT;

		if (!isDefaultSize) return;

		const preferredSize = await getPreferredSettingsWindowSize();
		if (
			preferredSize.width === Math.round(logicalSize.width) &&
			preferredSize.height === Math.round(logicalSize.height)
		) {
			return;
		}

		await window.setSize(
			new LogicalSize(preferredSize.width, preferredSize.height),
		);
	} catch {
		// Preserve the current window size if we cannot safely inspect or resize it.
	}
}

export async function openSettingsWindow(tab?: SettingsTab) {
	const existing = await WebviewWindow.getByLabel("settings");
	if (existing) {
		let didShow = false;

		try {
			await resizeSettingsWindowIfNeeded(existing);
			await showSettingsWindow(existing);
			didShow = true;
		} catch {
			// If the existing handle cannot be shown, fall through and recreate it.
		}

		if (didShow) {
			try {
				await navigateSettingsWindow(tab);
			} catch {
				// If the window has not finished loading yet, keep the window open anyway.
			}

			return;
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
		void (async () => {
			try {
				await showSettingsWindow(win);
				await navigateSettingsWindow(tab);
			} catch (error) {
				console.error("failed to initialize settings window", error);
			}
		})();
	});
	win.once("tauri://error", (event) => {
		console.error("failed to create settings window", event);
	});
}
