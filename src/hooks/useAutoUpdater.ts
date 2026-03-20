import { getCurrentWindow } from "@tauri-apps/api/window";
import { relaunch } from "@tauri-apps/plugin-process";
import { type Update, check } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type AutoUpdateCheckInterval,
	getAutoUpdateLastCheckedAt,
	loadSettings,
	setAutoUpdateLastCheckedAt,
} from "../lib/settings";
import { useTauriEvent } from "../lib/tauriEvents";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
let cachedUpdate: Update | null = null;
let inFlightUpdateCheck: Promise<Update | null> | null = null;

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
	installAndRelaunch: () => void;
}

export function useAutoUpdater(): AutoUpdaterState {
	const [update, setUpdate] = useState<Update | null>(cachedUpdate);
	const [checkInterval, setCheckInterval] =
		useState<AutoUpdateCheckInterval | null>(null);
	const launchAttemptedRef = useRef(false);

	useEffect(() => {
		let cancelled = false;
		void loadSettings().then((settings) => {
			if (!cancelled) {
				setCheckInterval(settings.ui.autoUpdateCheckInterval);
			}
		});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		const nextInterval = payload.ui?.autoUpdateCheckInterval;
		if (!nextInterval) return;
		setCheckInterval(nextInterval);
	});

	useEffect(() => {
		if (checkInterval === null) return;
		if (cachedUpdate) {
			setUpdate(cachedUpdate);
			return;
		}

		let cancelled = false;
		let timerId: ReturnType<typeof window.setTimeout> | null = null;

		const scheduleNext = (delayMs: number) => {
			if (cancelled || cachedUpdate) return;
			timerId = window.setTimeout(
				() => {
					void runCheckAndReschedule();
				},
				Math.max(0, delayMs),
			);
		};

		const runCheckAndReschedule = async () => {
			const nextUpdate = await downloadUpdate();
			if (cancelled) return;
			if (nextUpdate) {
				setUpdate(nextUpdate);
				return;
			}
			if (checkInterval === "12h") {
				scheduleNext(TWELVE_HOURS_MS);
			}
		};

		void (async () => {
			if (checkInterval === "launch") {
				if (launchAttemptedRef.current) return;
				launchAttemptedRef.current = true;
				await runCheckAndReschedule();
				return;
			}

			const lastCheckedAt = await getAutoUpdateLastCheckedAt();
			if (cancelled) return;
			if (!lastCheckedAt) {
				await runCheckAndReschedule();
				return;
			}

			const elapsed = Date.now() - lastCheckedAt;
			if (elapsed >= TWELVE_HOURS_MS) {
				await runCheckAndReschedule();
				return;
			}

			scheduleNext(TWELVE_HOURS_MS - elapsed);
		})();

		return () => {
			cancelled = true;
			if (timerId !== null) {
				window.clearTimeout(timerId);
			}
		};
	}, [checkInterval]);

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
