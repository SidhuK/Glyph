import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { FileTreeSortMode } from "../lib/settings";
import type { SpaceChange } from "../lib/spaceChange";
import { type FsEntry, invoke } from "../lib/tauri";
import { useTauriEvent } from "../lib/tauriEvents";
import { normalizeRelPath, parentDir } from "../utils/path";

export function pathInWorkspace(path: string, folder: string | null): boolean {
	return !folder || path === folder || path.startsWith(`${folder}/`);
}

type FolderView = {
	expanded: Set<string>;
	scroll: number;
	sort?: FileTreeSortMode;
};
type WorkspaceSession = {
	folder: string | null;
	views: Record<string, FolderView>;
};

const EMPTY_EXPANDED = new Set<string>();

// Views live per space and folder for this window's lifetime.
export function useFolderWorkspace(spacePath: string | null) {
	const [sessions, setSessions] = useState<Record<string, WorkspaceSession>>(
		{},
	);
	const session = sessions[spacePath ?? ""];
	const folder = session?.folder ?? null;
	const view = session?.views[folder ?? ""];
	const expanded = view?.expanded ?? EMPTY_EXPANDED;
	const enter = useCallback(
		(rawPath: string | null) => {
			if (!spacePath) return;
			const next = rawPath ? normalizeRelPath(rawPath) : null;
			if (
				next?.split("/").some((part) => part === ".." || part.startsWith("."))
			)
				return;
			setSessions((current) => {
				const previous = current[spacePath];
				if ((previous?.folder ?? null) === next) return current;
				return {
					...current,
					[spacePath]: { folder: next, views: previous?.views ?? {} },
				};
			});
		},
		[spacePath],
	);
	const setExpanded: Dispatch<SetStateAction<Set<string>>> = useCallback(
		(next) => {
			if (!spacePath) return;
			setSessions((current) => {
				const previous = current[spacePath];
				const saved = previous?.views[folder ?? ""];
				const value =
					typeof next === "function"
						? next(saved?.expanded ?? EMPTY_EXPANDED)
						: next;
				if (value === saved?.expanded) return current;
				return {
					...current,
					[spacePath]: {
						folder: previous?.folder ?? null,
						views: {
							...previous?.views,
							[folder ?? ""]: {
								...saved,
								scroll: saved?.scroll ?? 0,
								expanded: value,
							},
						},
					},
				};
			});
		},
		[spacePath, folder],
	);
	const updateView = useCallback(
		(patch: Partial<FolderView>) => {
			if (!spacePath) return;
			setSessions((current) => {
				const previous = current[spacePath];
				const saved = previous?.views[folder ?? ""];
				if (
					patch.scroll !== undefined &&
					patch.scroll === saved?.scroll &&
					patch.sort === undefined &&
					patch.expanded === undefined
				)
					return current;
				return {
					...current,
					[spacePath]: {
						folder: previous?.folder ?? null,
						views: {
							...previous?.views,
							[folder ?? ""]: {
								...(previous?.views[folder ?? ""] ?? { expanded, scroll: 0 }),
								...patch,
							},
						},
					},
				};
			});
		},
		[spacePath, folder, expanded],
	);

	const expandedPaths = useMemo(() => [...expanded].sort(), [expanded]);
	// Reload a restored view in one IPC call, including its expanded descendants.
	const tree = useQuery({
		queryKey: ["folder-workspace", "tree", spacePath, folder, expandedPaths],
		enabled: Boolean(spacePath),
		queryFn: async () => {
			const entries = await invoke("space_list_dir", {
				dir: folder,
				recursive: true,
				expanded_dirs: expandedPaths,
			});
			const byDir: Record<string, FsEntry[]> = { [folder ?? ""]: [] };
			for (const path of expandedPaths) byDir[path] = [];
			for (const entry of entries) {
				const parent = parentDir(entry.rel_path);
				byDir[parent] ??= [];
				byDir[parent].push(entry);
			}
			return byDir;
		},
	});

	useTauriEvent("space:fs_changed", (change) => {
		function apply(event: SpaceChange) {
			if (event.space_path !== spacePath) return;
			if (event.kind === "batch") {
				event.changes.forEach(apply);
				return;
			}
			if (event.kind !== "rename" && event.kind !== "remove") return;
			const from = event.kind === "rename" ? event.from_path : event.rel_path;
			setSessions((current) => {
				const previous = current[event.space_path];
				if (!previous) return current;
				const rewrite = (path: string): string | null => {
					if (
						path !== from &&
						!(event.recursive && path.startsWith(`${from}/`))
					)
						return path;
					return event.kind === "rename"
						? event.to_path + path.slice(from.length)
						: null;
				};
				const views: Record<string, FolderView> = {};
				for (const [path, saved] of Object.entries(previous.views)) {
					const next = rewrite(path);
					if (next !== null)
						views[next] = {
							...saved,
							expanded: new Set(
								[...saved.expanded].flatMap((item) => {
									const value = rewrite(item);
									return value === null ? [] : [value];
								}),
							),
						};
				}
				const nextFolder = previous.folder ? rewrite(previous.folder) : null;
				return {
					...current,
					[event.space_path]: {
						folder:
							nextFolder ?? (previous.folder ? parentDir(from) || null : null),
						views,
					},
				};
			});
		}
		apply(change);
	});

	return useMemo(
		() => ({
			folder,
			enter,
			expanded,
			setExpanded,
			scroll: view?.scroll ?? 0,
			sort: view?.sort,
			updateView,
			tree: { data: tree.data, error: tree.error },
		}),
		[
			folder,
			enter,
			expanded,
			setExpanded,
			view?.scroll,
			view?.sort,
			updateView,
			tree.data,
			tree.error,
		],
	);
}
