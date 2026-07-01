import { useCallback, useEffect, useRef, useState } from "react";
import { useUILayoutContext } from "../contexts";
import {
	completeAutoSyncPrompt,
	promptForAutoSync,
	shouldPromptForAutoSync,
} from "../lib/gitSyncPrompt";
import { loadSettings } from "../lib/settings";
import type { GitSyncRunMode, GitSyncStatus } from "../lib/tauri";
import { invoke } from "../lib/tauri";
import { useTauriEvent } from "../lib/tauriEvents";

interface UseGitSyncOptions {
	spacePath: string | null;
	saveCurrentEditor: () => Promise<boolean>;
}

interface GitSyncController {
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
	const autoSyncPromptSpaceRef = useRef<string | null>(null);
	const activeSpacePathRef = useRef<string | null>(spacePath);
	const statusSpaceRef = useRef<string | null>(null);
	activeSpacePathRef.current = spacePath;

	const refreshStatus = useCallback(async () => {
		if (!spacePath) {
			statusSpaceRef.current = null;
			setStatus(null);
			setError("");
			return;
		}
		const refreshSpacePath = spacePath;
		setLoading(true);
		setError("");
		try {
			const nextStatus = await invoke("git_sync_status_read");
			if (activeSpacePathRef.current === refreshSpacePath) {
				statusSpaceRef.current = refreshSpacePath;
				setStatus(nextStatus);
			}
		} catch (cause) {
			if (activeSpacePathRef.current === refreshSpacePath) {
				setError(
					cause instanceof Error
						? cause.message
						: "Failed to load Git Sync status",
				);
			}
		} finally {
			if (activeSpacePathRef.current === refreshSpacePath) {
				setLoading(false);
			}
		}
	}, [spacePath]);

	const runSync = useCallback(
		async (mode: GitSyncRunMode) => {
			const runSpacePath = activeSpacePathRef.current;
			await saveCurrentEditor();
			const context = await buildRunContext();
			const nextStatus = await invoke("git_sync_run", {
				request: { mode, context },
			});
			if (runSpacePath && activeSpacePathRef.current === runSpacePath) {
				statusSpaceRef.current = runSpacePath;
				setStatus(nextStatus);
			}
			return nextStatus;
		},
		[saveCurrentEditor],
	);

	const syncNow = useCallback(async () => runSync("manual"), [runSync]);

	const resumeAutoSync = useCallback(async () => {
		const resumeSpacePath = activeSpacePathRef.current;
		const nextConfig = await invoke("git_sync_config_update", {
			patch: { paused: false, enabled: true },
		});
		setStatus((current) =>
			resumeSpacePath && statusSpaceRef.current === resumeSpacePath && current
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
			statusSpaceRef.current = null;
			setStatus(null);
			setError("");
			initialAutoRunSpaceRef.current = null;
			autoSyncPromptSpaceRef.current = null;
			return;
		}
		statusSpaceRef.current = null;
		setStatus(null);
		setError("");
		void refreshStatus();
	}, [refreshStatus, spacePath]);

	useTauriEvent("git_sync:status", (payload) => {
		const currentSpacePath = activeSpacePathRef.current;
		if (!currentSpacePath || statusSpaceRef.current !== currentSpacePath) {
			return;
		}
		setStatus(payload);
		setError("");
	});

	const statusConfigured = status?.configured ?? false;
	const statusEnabled = status?.enabled ?? false;
	const statusPaused = status?.paused ?? false;
	const statusIntervalMinutes = status?.interval_minutes ?? 10;

	useEffect(() => {
		if (
			!spacePath ||
			statusSpaceRef.current !== spacePath ||
			!shouldPromptForAutoSync(status)
		) {
			return;
		}
		if (autoSyncPromptSpaceRef.current === spacePath) return;
		autoSyncPromptSpaceRef.current = spacePath;

		void (async () => {
			const isCurrentPromptSpace = () =>
				activeSpacePathRef.current === spacePath &&
				statusSpaceRef.current === spacePath;
			const resetPromptForSpace = () => {
				if (autoSyncPromptSpaceRef.current === spacePath) {
					autoSyncPromptSpaceRef.current = null;
				}
			};
			try {
				const enable = await promptForAutoSync(status);
				if (!isCurrentPromptSpace()) {
					resetPromptForSpace();
					return;
				}
				await completeAutoSyncPrompt(enable);
				if (!isCurrentPromptSpace()) {
					resetPromptForSpace();
					return;
				}
				setStatus((current) =>
					statusSpaceRef.current === spacePath && current
						? {
								...current,
								enabled: enable,
								auto_sync_prompted: true,
							}
						: current,
				);
			} catch (cause) {
				resetPromptForSpace();
				if (!isCurrentPromptSpace()) {
					return;
				}
				setError(
					cause instanceof Error
						? cause.message
						: "Failed to configure Git Sync",
				);
			}
		})();
	}, [spacePath, status]);

	useEffect(() => {
		if (
			!spacePath ||
			statusSpaceRef.current !== spacePath ||
			!statusConfigured ||
			!statusEnabled ||
			statusPaused ||
			shouldPromptForAutoSync(status)
		)
			return;
		if (initialAutoRunSpaceRef.current === spacePath) return;
		initialAutoRunSpaceRef.current = spacePath;
		void runSync("auto").catch((cause) => {
			setError(cause instanceof Error ? cause.message : "Git Sync failed");
		});
	}, [
		runSync,
		spacePath,
		status,
		statusConfigured,
		statusEnabled,
		statusPaused,
	]);

	useEffect(() => {
		if (
			!spacePath ||
			statusSpaceRef.current !== spacePath ||
			!statusConfigured ||
			!statusEnabled ||
			statusPaused ||
			shouldPromptForAutoSync(status)
		) {
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
		status,
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
