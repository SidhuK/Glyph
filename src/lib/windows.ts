import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export type SettingsTab = "general" | "appearance" | "ai" | "space";

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
		if (shown) return;
	}

	const url = tab ? `#/settings?tab=${encodeURIComponent(tab)}` : "#/settings";
	const win = new WebviewWindow("settings", {
		title: "Settings",
		url,
		width: 760,
		height: 640,
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
