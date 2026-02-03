import { getCurrentWebview } from "@tauri-apps/api/webview";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export type SettingsTab = "general" | "vault" | "ai";

export async function openSettingsWindow(tab: SettingsTab = "general") {
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
			try {
				await getCurrentWebview().emitTo("settings", "settings:navigate", {
					tab,
				});
			} catch {
				// ignore
			}
			return;
		}
	}

	const url = `#/settings?tab=${encodeURIComponent(tab)}`;
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
