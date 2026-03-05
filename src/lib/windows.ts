import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "./tauri";

export type SettingsTab = "general" | "appearance" | "ai" | "space" | "about";

export async function openSettingsWindow(tab?: SettingsTab) {
	const existing = await WebviewWindow.getByLabel("settings");
	if (existing) {
		let shown = false;
		try {
			await existing.show();
			await existing.setFocus();
			shown = true;
		} catch {
			// If the handle is stale (e.g., window was closed/destroyed), fall through
			// and recreate it.
		}
		if (shown) {
			if (tab) {
				await existing.emit("settings:navigate", { tab });
			}
			return;
		}
	}

	const url = tab ? `#/settings?tab=${encodeURIComponent(tab)}` : "#/settings";
	const savedBounds = await invoke("window_saved_bounds_get", {
		label: "settings",
	}).catch(() => null);
	const win = new WebviewWindow("settings", {
		title: "Settings",
		url,
		width: savedBounds?.width ?? 760,
		height: savedBounds?.height ?? 640,
		x: savedBounds?.x,
		y: savedBounds?.y,
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
