import { getCurrentWindow } from "@tauri-apps/api/window";
import { relaunch } from "@tauri-apps/plugin-process";
import { type Update, check } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useState } from "react";
import { setAutoUpdateLastCheckedAt } from "../lib/settings";

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
let cachedUpdate: Update | null = null;
let inFlightUpdateCheck: Promise<Update | null> | null = null;
let launchCheckStarted = false;

async function isMainWindow(): Promise<boolean> {
	let windowLabel = "";
	try {
		windowLabel = getCurrentWindow().label;
	} catch {
		return false;
	}
	return windowLabel === "main";
}

async function downloadUpdate(): Promise<Update | null> {
	if (import.meta.env.DEV || cachedUpdate) return cachedUpdate;
	if (!(await isMainWindow())) return null;
	if (inFlightUpdateCheck) return inFlightUpdateCheck;

	inFlightUpdateCheck = (async () => {
		try {
			const update = await check();
			await setAutoUpdateLastCheckedAt(Date.now());
			if (!update) return null;

			await update.download();
			cachedUpdate = update;
			return update;
		} catch (error) {
			console.warn("Auto-update check/download failed", error);
			return null;
		} finally {
			inFlightUpdateCheck = null;
		}
	})();

	return inFlightUpdateCheck;
}

export interface AutoUpdaterState {
	updateReady: boolean;
	updateVersion: string | null;
	isChecking: boolean;
	checkForUpdates: () => Promise<Update | null>;
	installAndRelaunch: () => void;
}

export function useAutoUpdater(enabled = true): AutoUpdaterState {
	const [update, setUpdate] = useState<Update | null>(cachedUpdate);
	const [isChecking, setIsChecking] = useState(false);

	const checkForUpdates = useCallback(async () => {
		if (!enabled) return null;
		setIsChecking(true);
		try {
			const nextUpdate = await downloadUpdate();
			setUpdate(nextUpdate);
			return nextUpdate;
		} finally {
			setIsChecking(false);
		}
	}, [enabled]);

	useEffect(() => {
		if (!enabled) {
			setUpdate(null);
			return;
		}
		if (cachedUpdate) {
			setUpdate(cachedUpdate);
		}

		let cancelled = false;
		const runCheck = async () => {
			const nextUpdate = await checkForUpdates();
			if (cancelled) return;
			setUpdate(nextUpdate);
		};

		if (!launchCheckStarted) {
			launchCheckStarted = true;
			void runCheck();
		}

		const intervalId = window.setInterval(() => {
			void runCheck();
		}, THREE_HOURS_MS);

		return () => {
			cancelled = true;
			window.clearInterval(intervalId);
		};
	}, [checkForUpdates, enabled]);

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
		isChecking,
		checkForUpdates,
		installAndRelaunch,
	};
}
