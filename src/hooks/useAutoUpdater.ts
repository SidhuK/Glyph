import { getCurrentWindow } from "@tauri-apps/api/window";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect } from "react";
import { toast } from "sonner";

let didAttemptAutoUpdate = false;

async function runAutoUpdaterOnce(): Promise<void> {
	if (didAttemptAutoUpdate || import.meta.env.DEV) return;
	didAttemptAutoUpdate = true;

	let windowLabel = "";
	try {
		windowLabel = getCurrentWindow().label;
	} catch {
		return;
	}
	if (windowLabel !== "main") return;

	try {
		const update = await check();
		if (!update) return;

		toast.info(`Glyph ${update.version} is available`, {
			description: "Downloading and installing update...",
		});
		await update.downloadAndInstall();
		toast.success("Update installed", {
			description: "Restarting Glyph to finish update...",
		});
		await relaunch();
	} catch (error) {
		console.warn("Auto-update check/install failed", error);
	}
}

export function useAutoUpdater(): void {
	useEffect(() => {
		void runAutoUpdaterOnce();
	}, []);
}
