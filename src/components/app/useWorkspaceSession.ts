import { useCallback, useEffect, useRef } from "react";
import { invoke } from "../../lib/tauri";
import {
	type WorkspaceSessionSnapshot,
	type WorkspaceSessionTabSnapshot,
	loadWorkspaceSessionSnapshot,
	saveWorkspaceSessionSnapshot,
} from "../../lib/workspaceSession";
import type { WorkspaceTab } from "./useTabManager";

const WORKSPACE_SESSION_SAVE_DEBOUNCE_MS = 250;

function buildWorkspaceSessionTabs(
	tabs: WorkspaceTab[],
): WorkspaceSessionTabSnapshot[] {
	const seenTargets = new Set<string>();
	const snapshotTabs: WorkspaceSessionTabSnapshot[] = [];
	for (const tab of tabs) {
		if (
			(tab.kind !== "file" && tab.kind !== "special") ||
			tab.target === null ||
			seenTargets.has(tab.target)
		) {
			continue;
		}
		seenTargets.add(tab.target);
		snapshotTabs.push({ kind: tab.kind, target: tab.target });
	}
	return snapshotTabs;
}

async function validateRestorableSessionTabs(
	tabs: WorkspaceSessionTabSnapshot[],
): Promise<WorkspaceSessionTabSnapshot[] | null> {
	const fileTargets = tabs
		.filter((tab) => tab.kind === "file")
		.map((tab) => tab.target);
	if (!fileTargets.length) return tabs;

	try {
		const markdownFiles = await invoke("space_list_markdown_files", {
			recursive: true,
			limit: null,
		});
		const existingTargets = new Set(markdownFiles.map((file) => file.rel_path));
		return tabs.filter(
			(tab) => tab.kind === "special" || existingTargets.has(tab.target),
		);
	} catch {
		return null;
	}
}

interface UseWorkspaceSessionArgs {
	spacePath: string | null;
	settingsLoaded: boolean;
	resumeLastSession: boolean | null;
	onboardingNotePath: string | null;
	tabs: WorkspaceTab[];
	activeTabPath: string | null;
	tabsRevision: number;
	restoreWorkspaceTabs: (
		tabSnapshots: WorkspaceSessionTabSnapshot[],
		activeTabTarget: string | null,
	) => void;
}

interface PendingWorkspaceSessionSave {
	spacePath: string;
	snapshot: WorkspaceSessionSnapshot;
}

export function useWorkspaceSession({
	spacePath,
	settingsLoaded,
	resumeLastSession,
	onboardingNotePath,
	tabs,
	activeTabPath,
	tabsRevision,
	restoreWorkspaceTabs,
}: UseWorkspaceSessionArgs) {
	const restoredSessionSpaceRef = useRef<string | null>(null);
	const restoreSessionRequestIdRef = useRef(0);
	const pendingSaveRef = useRef<PendingWorkspaceSessionSave | null>(null);
	const saveTimerRef = useRef<number | null>(null);
	const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
	const saveSpaceRef = useRef(spacePath);

	const clearSaveTimer = useCallback(() => {
		if (saveTimerRef.current === null) return;
		window.clearTimeout(saveTimerRef.current);
		saveTimerRef.current = null;
	}, []);

	const flushPendingSave = useCallback(() => {
		const pending = pendingSaveRef.current;
		if (!pending) return;
		pendingSaveRef.current = null;
		clearSaveTimer();
		saveQueueRef.current = saveQueueRef.current
			.catch(() => {})
			.then(() =>
				saveWorkspaceSessionSnapshot(pending.spacePath, pending.snapshot),
			)
			.catch((cause) => {
				console.error("Failed to save workspace session", cause);
			});
	}, [clearSaveTimer]);

	useEffect(() => {
		if (restoredSessionSpaceRef.current !== spacePath) {
			restoredSessionSpaceRef.current = null;
			restoreSessionRequestIdRef.current += 1;
		}
		if (
			!spacePath ||
			!settingsLoaded ||
			resumeLastSession === null ||
			restoredSessionSpaceRef.current === spacePath
		) {
			return;
		}

		restoredSessionSpaceRef.current = spacePath;
		if (onboardingNotePath) return;
		if (!resumeLastSession) return;

		const requestId = ++restoreSessionRequestIdRef.current;
		void (async () => {
			const snapshot = await loadWorkspaceSessionSnapshot(spacePath);
			if (
				requestId !== restoreSessionRequestIdRef.current ||
				!snapshot?.tabs.length
			) {
				return;
			}

			const restorableTabs = await validateRestorableSessionTabs(snapshot.tabs);
			if (
				requestId !== restoreSessionRequestIdRef.current ||
				restorableTabs === null ||
				!restorableTabs.length
			) {
				return;
			}

			const activeTabTarget = restorableTabs.some(
				(tab) => tab.target === snapshot.activeTabTarget,
			)
				? snapshot.activeTabTarget
				: null;
			restoreWorkspaceTabs(restorableTabs, activeTabTarget);
		})().catch((cause) => {
			console.error("Failed to restore workspace session", cause);
		});
		return () => {
			restoreSessionRequestIdRef.current += 1;
		};
	}, [
		onboardingNotePath,
		restoreWorkspaceTabs,
		resumeLastSession,
		settingsLoaded,
		spacePath,
	]);

	useEffect(() => {
		if (saveSpaceRef.current !== spacePath) {
			pendingSaveRef.current = null;
			clearSaveTimer();
			saveSpaceRef.current = spacePath;
			return;
		}
		if (!spacePath || tabsRevision === 0) {
			return;
		}
		const snapshotTabs = buildWorkspaceSessionTabs(tabs);
		const activeTarget =
			snapshotTabs.find((tab) => tab.target === activeTabPath)?.target ?? null;
		pendingSaveRef.current = {
			spacePath,
			snapshot: {
				version: 1,
				savedAt: Date.now(),
				tabs: snapshotTabs,
				activeTabTarget: activeTarget,
			},
		};
		clearSaveTimer();
		saveTimerRef.current = window.setTimeout(
			flushPendingSave,
			WORKSPACE_SESSION_SAVE_DEBOUNCE_MS,
		);
		return clearSaveTimer;
	}, [
		activeTabPath,
		clearSaveTimer,
		flushPendingSave,
		spacePath,
		tabs,
		tabsRevision,
	]);

	useEffect(() => {
		const currentSpacePath = spacePath;
		return () => {
			if (currentSpacePath) flushPendingSave();
		};
	}, [flushPendingSave, spacePath]);
}
