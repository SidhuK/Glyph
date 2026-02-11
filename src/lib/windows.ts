import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export type SettingsTab = "vault" | "ai";

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

	const url = tab
		? `#/settings?tab=${encodeURIComponent(tab)}`
		: "#/settings";
	const win = new WebviewWindow("settings", {
		title: "Settings",
		url,
		width: 760,
		height: 640,
		resizable: true,
		decorations: true,
		transparent: true,
	});

	win.once("tauri://created", () => {
		// no-op
	});
	win.once("tauri://error", () => {
		// no-op
	});
}
