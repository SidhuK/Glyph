import { useCallback, useEffect, useRef } from "react";
import { normalizeRelPath, parentDir } from "../utils/path";
import { invalidateCalendarPrefetch } from "./calendarActivity";
import {
	invalidateAllDocsPrefetch,
	invalidateDatabasePrefetch,
	invalidatePrefetchedNote,
	invalidateTaskSummariesPrefetch,
} from "./navigationPrefetch";
import { queryClient } from "./queryClient";
import { useTauriEvent } from "./tauriEvents";

export type SpaceChange =
	| {
			kind: "content" | "create";
			space_path: string;
			rel_path: string;
	  }
	| {
			kind: "remove";
			space_path: string;
			rel_path: string;
			recursive: boolean;
	  }
	| {
			kind: "rename";
			space_path: string;
			from_path: string;
			to_path: string;
			recursive: boolean;
	  }
	| {
			kind: "batch";
			space_path: string;
			changes: SpaceChange[];
	  };

export interface SpaceChangeHost {
	spacePath: string | null;
	expandedDirs: ReadonlySet<string>;
	loadDir: (dirPath: string, force?: boolean) => Promise<void>;
	closeTabsForPathRemoval: (path: string, recursive: boolean) => void;
	renameTabsForPath: (
		fromPath: string,
		toPath: string,
		recursive: boolean,
	) => void;
	renamePinnedPath: (fromPath: string, toPath: string) => Promise<void>;
	deletePinnedPath: (path: string) => Promise<void>;
	renameSidebarFolderPath: (
		fromPath: string,
		toPath: string,
		recursive: boolean,
	) => Promise<void>;
	deleteSidebarFolderPath: (path: string, recursive: boolean) => Promise<void>;
	refreshTags: () => Promise<void>;
}

const BATCH_MS = 50;
const previewInvalidators = new Set<(path: string, removed: boolean) => void>();
const openNoteListeners = new Set<(path: string) => void>();
let host: SpaceChangeHost | null = null;

export function registerPreviewInvalidator(
	fn: (path: string, removed: boolean) => void,
): () => void {
	previewInvalidators.add(fn);
	return () => {
		previewInvalidators.delete(fn);
	};
}

export function subscribeOpenNoteContent(
	fn: (path: string) => void,
): () => void {
	openNoteListeners.add(fn);
	return () => {
		openNoteListeners.delete(fn);
	};
}

function reloadDirs(
	relPath: string,
	current: SpaceChangeHost,
	includeSelf: boolean,
): void {
	const dirs = new Set(["", parentDir(relPath)]);
	if (includeSelf && current.expandedDirs.has(relPath)) dirs.add(relPath);
	for (const dir of dirs) void current.loadDir(dir, true);
}

function invalidateDerived(path: string | null, removed: boolean): void {
	if (path) {
		invalidatePrefetchedNote(path);
		for (const fn of previewInvalidators) fn(path, removed);
	}
	invalidateTaskSummariesPrefetch();
	invalidateCalendarPrefetch();
	invalidateAllDocsPrefetch();
	invalidateDatabasePrefetch();
	void queryClient.invalidateQueries({ queryKey: ["usage-insights"] });
	void queryClient.invalidateQueries({ queryKey: ["unlinked-mentions"] });
	void queryClient.invalidateQueries({
		queryKey: ["navigation", "folio-files"],
	});
}

export function applySpaceChange(change: SpaceChange): void {
	const current = host;
	if (!current?.spacePath || change.space_path !== current.spacePath) return;
	if (change.kind === "batch") {
		for (const child of change.changes) applySpaceChange(child);
		return;
	}
	if (change.kind === "rename") {
		const from = normalizeRelPath(change.from_path);
		const to = normalizeRelPath(change.to_path);
		reloadDirs(from, current, false);
		reloadDirs(to, current, true);
		current.renameTabsForPath(from, to, change.recursive);
		void current.renamePinnedPath(from, to);
		void current.renameSidebarFolderPath(from, to, change.recursive);
		void current.refreshTags();
		invalidateDerived(from, true);
		invalidateDerived(to, false);
		for (const fn of openNoteListeners) fn(to);
		return;
	}
	const path = normalizeRelPath(change.rel_path);
	reloadDirs(path, current, change.kind !== "remove");
	void current.refreshTags();
	if (change.kind === "remove") {
		current.closeTabsForPathRemoval(path, change.recursive);
		void current.deletePinnedPath(path);
		void current.deleteSidebarFolderPath(path, change.recursive);
		invalidateDerived(path, true);
		return;
	}
	invalidateDerived(path, false);
	if (change.kind === "content") {
		for (const fn of openNoteListeners) fn(path);
	}
}

export function useSpaceChangePropagation(nextHost: SpaceChangeHost): void {
	const queueRef = useRef(new Map<string, SpaceChange>());
	const timerRef = useRef<number | null>(null);
	const hostRef = useRef(nextHost);
	hostRef.current = nextHost;

	useEffect(() => {
		host = nextHost;
	}, [nextHost]);

	useEffect(() => {
		return () => {
			host = null;
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			queueRef.current.clear();
		};
	}, []);

	const flush = useCallback(() => {
		timerRef.current = null;
		const queued = [...queueRef.current.values()];
		queueRef.current.clear();
		for (const change of queued) applySpaceChange(change);
	}, []);

	const enqueue = useCallback(
		(change: SpaceChange) => {
			if (change.space_path !== hostRef.current.spacePath) return;
			queueRef.current.set(JSON.stringify(change), change);
			if (timerRef.current !== null) return;
			timerRef.current = window.setTimeout(flush, BATCH_MS);
		},
		[flush],
	);

	useTauriEvent("space:fs_changed", enqueue);
}
