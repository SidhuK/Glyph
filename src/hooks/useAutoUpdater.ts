import { getCurrentWindow } from "@tauri-apps/api/window";
import { relaunch } from "@tauri-apps/plugin-process";
import { Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type ReleaseChannel,
	loadSettings,
	setAutoUpdateLastCheckedAt,
} from "../lib/settings";
import { invoke } from "../lib/tauri";
import { useTauriEvent } from "../lib/tauriEvents";

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
let cachedUpdate: { channel: ReleaseChannel; update: Update } | null = null;
let inFlightUpdateCheck: Promise<Update | null> | null = null;
let inFlightChannel: ReleaseChannel | null = null;
const launchCheckStarted = new Set<ReleaseChannel>();

async function isMainWindow(): Promise<boolean> {
	let windowLabel = "";
	try {
		windowLabel = getCurrentWindow().label;
	} catch {
		return false;
	}
	return windowLabel === "main";
}

async function checkReleaseChannel(
	channel: ReleaseChannel,
): Promise<Update | null> {
	const metadata = await invoke("updater_check_release_channel", { channel });
	return metadata ? new Update(metadata) : null;
}

async function downloadUpdate(channel: ReleaseChannel): Promise<Update | null> {
	if (import.meta.env.DEV) return null;
	if (cachedUpdate?.channel === channel) return cachedUpdate.update;
	if (!(await isMainWindow())) return null;
	if (inFlightUpdateCheck && inFlightChannel === channel) {
		return inFlightUpdateCheck;
	}

	inFlightChannel = channel;
	inFlightUpdateCheck = (async () => {
		try {
			const update = await checkReleaseChannel(channel);
			await setAutoUpdateLastCheckedAt(Date.now());
			if (!update) return null;

			await update.download();
			cachedUpdate = { channel, update };
			return update;
		} catch (error) {
			console.warn("Auto-update check/download failed", error);
			return null;
		} finally {
			if (inFlightChannel === channel) {
				inFlightUpdateCheck = null;
				inFlightChannel = null;
			}
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
	const [releaseChannel, setReleaseChannelState] =
		useState<ReleaseChannel>("stable");
	const releaseChannelRef = useRef(releaseChannel);
	const [releaseChannelLoaded, setReleaseChannelLoaded] = useState(false);
	const [update, setUpdate] = useState<Update | null>(null);
	const [isChecking, setIsChecking] = useState(false);

	const checkForUpdates = useCallback(async () => {
		if (!enabled || !releaseChannelLoaded) return null;
		const requestedChannel = releaseChannel;
		setIsChecking(true);
		try {
			const nextUpdate = await downloadUpdate(requestedChannel);
			if (releaseChannelRef.current === requestedChannel) {
				setUpdate(nextUpdate);
			}
			return nextUpdate;
		} finally {
			setIsChecking(false);
		}
	}, [enabled, releaseChannel, releaseChannelLoaded]);

	useEffect(() => {
		releaseChannelRef.current = releaseChannel;
	}, [releaseChannel]);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (!cancelled) setReleaseChannelState(settings.ui.releaseChannel);
			})
			.catch(() => undefined)
			.finally(() => {
				if (!cancelled) setReleaseChannelLoaded(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		const nextChannel = payload.ui?.releaseChannel;
		if (!nextChannel) return;
		setReleaseChannelState(nextChannel);
		setReleaseChannelLoaded(true);
		setUpdate(
			cachedUpdate?.channel === nextChannel ? cachedUpdate.update : null,
		);
	});

	useEffect(() => {
		if (!enabled || !releaseChannelLoaded) {
			setUpdate(null);
			return;
		}
		if (cachedUpdate?.channel === releaseChannel) {
			setUpdate(cachedUpdate.update);
		}

		const runCheck = async () => {
			await checkForUpdates();
		};

		if (!launchCheckStarted.has(releaseChannel)) {
			launchCheckStarted.add(releaseChannel);
			void runCheck();
		}

		const intervalId = window.setInterval(() => {
			void runCheck();
		}, THREE_HOURS_MS);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [checkForUpdates, enabled, releaseChannel, releaseChannelLoaded]);

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
