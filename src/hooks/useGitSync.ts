import { useCallback, useEffect, useRef, useState } from "react";
import { useUILayoutContext } from "../contexts";
import { loadSettings } from "../lib/settings";
import type { GitSyncRunMode, GitSyncStatus } from "../lib/tauri";
import { invoke } from "../lib/tauri";
import { useTauriEvent } from "../lib/tauriEvents";

interface UseGitSyncOptions {
	spacePath: string | null;
	saveCurrentEditor: () => Promise<boolean>;
}

export interface GitSyncController {
	status: GitSyncStatus | null;
	loading: boolean;
	error: string;
	refreshStatus: () => Promise<void>;
	syncNow: () => Promise<GitSyncStatus>;
	resumeAutoSync: () => Promise<void>;
	openGitSettings: () => void;
}

async function buildRunContext() {
	const settings = await loadSettings();
	return {
		templates_folder: settings.templates.folder,
		attachment_storage_mode: settings.editor.attachmentStorageMode,
		attachment_folder:
			settings.editor.attachmentStorageMode === "specific-folder"
				? settings.editor.attachmentFolder
				: null,
	};
}

export function useGitSync({
	spacePath,
	saveCurrentEditor,
}: UseGitSyncOptions): GitSyncController {
	const { openSettings } = useUILayoutContext();
	const [status, setStatus] = useState<GitSyncStatus | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const initialAutoRunSpaceRef = useRef<string | null>(null);

	const refreshStatus = useCallback(async () => {
		if (!spacePath) {
			setStatus(null);
			setError("");
			return;
		}
		setLoading(true);
		setError("");
		try {
			const nextStatus = await invoke("git_sync_status_read");
			setStatus(nextStatus);
		} catch (cause) {
			setError(
				cause instanceof Error
					? cause.message
					: "Failed to load Git Sync status",
			);
		} finally {
			setLoading(false);
		}
	}, [spacePath]);

	const runSync = useCallback(
		async (mode: GitSyncRunMode) => {
			await saveCurrentEditor();
			const context = await buildRunContext();
			const nextStatus = await invoke("git_sync_run", {
				request: { mode, context },
			});
			setStatus(nextStatus);
			return nextStatus;
		},
		[saveCurrentEditor],
	);

	const syncNow = useCallback(async () => runSync("manual"), [runSync]);

	const resumeAutoSync = useCallback(async () => {
		const nextConfig = await invoke("git_sync_config_update", {
			patch: { paused: false, enabled: true },
		});
		setStatus((current) =>
			current
				? {
						...current,
						paused: false,
						enabled: nextConfig.enabled,
						last_error: null,
					}
				: current,
		);
	}, []);

	const openGitSettings = useCallback(() => {
		openSettings("git");
	}, [openSettings]);

	useEffect(() => {
		if (!spacePath) {
			setStatus(null);
			setError("");
			initialAutoRunSpaceRef.current = null;
			return;
		}
		void refreshStatus();
	}, [refreshStatus, spacePath]);

	useTauriEvent("git_sync:status", (payload) => {
		setStatus(payload);
		setError("");
	});

	const statusConfigured = status?.configured ?? false;
	const statusEnabled = status?.enabled ?? false;
	const statusPaused = status?.paused ?? false;
	const statusIntervalMinutes = status?.interval_minutes ?? 10;

	useEffect(() => {
		if (!spacePath || !statusConfigured || !statusEnabled || statusPaused)
			return;
		if (initialAutoRunSpaceRef.current === spacePath) return;
		initialAutoRunSpaceRef.current = spacePath;
		void runSync("auto").catch((cause) => {
			setError(cause instanceof Error ? cause.message : "Git Sync failed");
		});
	}, [runSync, spacePath, statusConfigured, statusEnabled, statusPaused]);

	useEffect(() => {
		if (!spacePath || !statusConfigured || !statusEnabled || statusPaused) {
			return;
		}
		const intervalMinutes = Math.max(1, statusIntervalMinutes || 10);
		const timer = window.setInterval(
			() => {
				void runSync("auto").catch((cause) => {
					setError(cause instanceof Error ? cause.message : "Git Sync failed");
				});
			},
			intervalMinutes * 60 * 1000,
		);
		return () => window.clearInterval(timer);
	}, [
		runSync,
		spacePath,
		statusConfigured,
		statusEnabled,
		statusPaused,
		statusIntervalMinutes,
	]);

	return {
		status,
		loading,
		error,
		refreshStatus,
		syncNow,
		resumeAutoSync,
		openGitSettings,
	};
}
