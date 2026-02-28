import { getCurrentWindow } from "@tauri-apps/api/window";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useState } from "react";

let didAttemptAutoUpdate = false;
let cachedUpdate: Update | null = null;

async function downloadUpdate(): Promise<Update | null> {
	if (didAttemptAutoUpdate || import.meta.env.DEV) return null;
	didAttemptAutoUpdate = true;

	let windowLabel = "";
	try {
		windowLabel = getCurrentWindow().label;
	} catch {
		return null;
	}
	if (windowLabel !== "main") return null;

	try {
		const update = await check();
		if (!update) return null;

		await update.download();
		cachedUpdate = update;
		return update;
	} catch (error) {
		console.warn("Auto-update check/download failed", error);
		return null;
	}
}

export interface AutoUpdaterState {
	updateReady: boolean;
	updateVersion: string | null;
	installAndRelaunch: () => void;
}

export function useAutoUpdater(): AutoUpdaterState {
	const [update, setUpdate] = useState<Update | null>(cachedUpdate);

	useEffect(() => {
		if (cachedUpdate) {
			setUpdate(cachedUpdate);
			return;
		}
		void downloadUpdate().then((u) => {
			if (u) setUpdate(u);
		});
	}, []);

	const installAndRelaunch = useCallback(() => {
		if (!update) return;
		void (async () => {
			try {
				await update.install();
				await relaunch();
			} catch (error) {
				console.error("Failed to install update", error);
			}
		})();
	}, [update]);

	return {
		updateReady: update !== null,
		updateVersion: update?.version ?? null,
		installAndRelaunch,
	};
}
