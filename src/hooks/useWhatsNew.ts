import { useCallback, useEffect, useMemo, useState } from "react";
import { currentReleaseNotes } from "../generated/currentReleaseNotes";
import {
	PUBLIC_CHANGELOG_URL,
	resolveWhatsNewState,
} from "../lib/releaseNotes";
import {
	loadSettings,
	setLastAcknowledgedChangelogVersion,
} from "../lib/settings";

export interface UseWhatsNewResult {
	open: boolean;
	available: boolean;
	releaseNotes: typeof currentReleaseNotes;
	publicChangelogUrl: string;
	openDialog: () => void;
	closeDialog: () => void;
}

const SESSION_KEY = "glyph:whatsNewShownThisSession";

export function useWhatsNew(appVersion: string | null): UseWhatsNewResult {
	const [open, setOpen] = useState(false);
	const [available, setAvailable] = useState(false);

	const releaseNotes = currentReleaseNotes;
	const previewMode = useMemo(() => {
		if (typeof window === "undefined") return false;
		return (
			new URLSearchParams(window.location.search).get("preview-whats-new") ===
			"1"
		);
	}, []);

	useEffect(() => {
		if (previewMode) {
			setAvailable(true);
			setOpen(true);
			return;
		}

		let cancelled = false;

		void (async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;

				const resolution = resolveWhatsNewState({
					appVersion,
					manifestVersion: releaseNotes.version,
					lastAcknowledgedVersion: settings.changelog.lastAcknowledgedVersion,
				});

				setAvailable(resolution.available);

				if (!resolution.available) {
					setOpen(false);
					return;
				}

				if (resolution.shouldSeedVersion && appVersion) {
					await setLastAcknowledgedChangelogVersion(appVersion);
					if (cancelled) return;
				}

				const shownThisSession =
					sessionStorage.getItem(SESSION_KEY) === appVersion;
				setOpen(resolution.shouldAutoOpen && !shownThisSession);
			} catch (error) {
				console.error("Failed to resolve What's New state", error);
				if (!cancelled) {
					setAvailable(false);
					setOpen(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [appVersion, previewMode, releaseNotes.version]);

	const openDialog = useCallback(() => {
		if (!available) return;
		setOpen(true);
	}, [available]);

	const closeDialog = useCallback(() => {
		setOpen(false);
		if (previewMode) return;
		if (!appVersion || !available) return;
		void (async () => {
			try {
				await setLastAcknowledgedChangelogVersion(appVersion);
				sessionStorage.setItem(SESSION_KEY, appVersion);
			} catch (error) {
				console.error(
					"Failed to persist acknowledged changelog version",
					error,
				);
			}
		})();
	}, [appVersion, available, previewMode]);

	return {
		open,
		available,
		releaseNotes,
		publicChangelogUrl: PUBLIC_CHANGELOG_URL,
		openDialog,
		closeDialog,
	};
}
