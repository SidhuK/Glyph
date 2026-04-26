import { join } from "@tauri-apps/api/path";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useRef } from "react";
import type { FsEntry } from "../lib/tauri";
import { invoke } from "../lib/tauri";
import { isInAppPreviewable } from "../utils/filePreview";
import { isMarkdownPath, parentDir } from "../utils/path";
import { areEntriesEqual, normalizeEntries } from "./fileTreeHelpers";
import { useFileTreeCRUD } from "./useFileTreeCRUD";
import type { CreateMarkdownFileOptions } from "./useFileTreeCRUD";

interface UseFileTreeResult {
	loadDir: (dirPath: string, force?: boolean) => Promise<void>;
	toggleDir: (dirPath: string) => void;
	openFile: (relPath: string) => Promise<void>;
	openMarkdownFile: (relPath: string) => Promise<void>;
	openNonMarkdownExternally: (relPath: string) => Promise<void>;
	createMarkdownFileAtPath: (
		options: CreateMarkdownFileOptions,
	) => Promise<string | null>;
	onNewFile: () => Promise<string | null>;
	onNewFileInDir: (dirPath: string) => Promise<string | null>;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onDuplicateFile: (path: string) => Promise<string | null>;
	onRenameDir: (
		path: string,
		nextName: string,
		kind: "dir" | "file",
	) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	onMovePath: (
		fromPath: string,
		toDirPath: string,
		kind?: "dir" | "file",
	) => Promise<string | null>;
}

interface UseFileTreeDeps {
	spacePath: string | null;
	expandedDirs: Set<string>;
	updateChildrenByDir: (
		next:
			| Record<string, FsEntry[] | undefined>
			| ((
					prev: Record<string, FsEntry[] | undefined>,
			  ) => Record<string, FsEntry[] | undefined>),
	) => void;
	updateExpandedDirs: (
		next: Set<string> | ((prev: Set<string>) => Set<string>),
	) => void;
	updateRootEntries: (
		next: FsEntry[] | ((prev: FsEntry[]) => FsEntry[]),
	) => void;
	renamePinnedPath: (fromPath: string, toPath: string) => Promise<void>;
	deletePinnedPath: (path: string) => Promise<void>;
	renameItemAppearance: (fromPath: string, toPath: string) => Promise<void>;
	deleteItemAppearance: (path: string) => Promise<void>;
	setActiveFilePath: (path: string | null) => void;
	setActiveDirPath: (path: string | null) => void;
	setActivePreviewPath: (path: string | null) => void;
	activeFilePath: string | null;
	activePreviewPath: string | null;
	setError: (error: string) => void;
}

export function useFileTree(deps: UseFileTreeDeps): UseFileTreeResult {
	const {
		spacePath,
		expandedDirs,
		updateChildrenByDir,
		updateExpandedDirs,
		updateRootEntries,
		renamePinnedPath,
		deletePinnedPath,
		renameItemAppearance,
		deleteItemAppearance,
		setActiveFilePath,
		setActiveDirPath,
		setActivePreviewPath,
		setError,
		activeFilePath,
		activePreviewPath,
	} = deps;

	const loadedDirsRef = useRef(new Set<string>());
	const loadRequestVersionRef = useRef(new Map<string, number>());
	const previousSpacePathRef = useRef<string | null>(spacePath);
	const expandedDirsRef = useRef(expandedDirs);
	expandedDirsRef.current = expandedDirs;

	if (previousSpacePathRef.current !== spacePath) {
		previousSpacePathRef.current = spacePath;
		loadedDirsRef.current.clear();
		loadRequestVersionRef.current.clear();
	}

	const updateExpandedDirsAndRef = useCallback(
		(next: Set<string> | ((prev: Set<string>) => Set<string>)) => {
			updateExpandedDirs((prev) => {
				const resolved = typeof next === "function" ? next(prev) : next;
				expandedDirsRef.current = resolved;
				return resolved;
			});
		},
		[updateExpandedDirs],
	);

	const hasCollapsedAncestor = useCallback((dirPath: string) => {
		if (!dirPath) return false;
		const expanded = expandedDirsRef.current;
		let current = parentDir(dirPath);
		while (current) {
			if (!expanded.has(current)) return true;
			current = parentDir(current);
		}
		return false;
	}, []);

	const evictCollapsedDirState = useCallback(
		(dirPath: string) => {
			updateChildrenByDir((prev) => {
				let changed = false;
				const next: Record<string, FsEntry[] | undefined> = {};
				for (const [key, value] of Object.entries(prev)) {
					if (key.startsWith(`${dirPath}/`)) {
						changed = true;
						continue;
					}
					next[key] = value;
				}
				return changed ? next : prev;
			});
			loadedDirsRef.current = new Set(
				[...loadedDirsRef.current].filter(
					(key) => !key.startsWith(`${dirPath}/`),
				),
			);
			for (const key of [...loadRequestVersionRef.current.keys()]) {
				if (key.startsWith(`${dirPath}/`)) {
					loadRequestVersionRef.current.delete(key);
				}
			}
		},
		[updateChildrenByDir],
	);

	const loadDir = useCallback(
		async (dirPath: string, force = false) => {
			if (force && hasCollapsedAncestor(dirPath)) return;
			if (!force && loadedDirsRef.current.has(dirPath)) return;
			const nextVersion = (loadRequestVersionRef.current.get(dirPath) ?? 0) + 1;
			loadRequestVersionRef.current.set(dirPath, nextVersion);
			const entries = await invoke(
				"space_list_dir",
				dirPath ? { dir: dirPath } : {},
			);
			const normalizedEntries = normalizeEntries(entries);
			if (loadRequestVersionRef.current.get(dirPath) !== nextVersion) return;
			if (dirPath) {
				updateChildrenByDir((prev) => {
					const c = prev[dirPath];
					if (areEntriesEqual(c, normalizedEntries)) return prev;
					return { ...prev, [dirPath]: normalizedEntries };
				});
			} else {
				updateRootEntries((prev) =>
					areEntriesEqual(prev, normalizedEntries) ? prev : normalizedEntries,
				);
			}
			loadedDirsRef.current.add(dirPath);
		},
		[hasCollapsedAncestor, updateChildrenByDir, updateRootEntries],
	);

	const toggleDir = useCallback(
		(dirPath: string) => {
			const wasExpanded = expandedDirsRef.current.has(dirPath);
			updateExpandedDirsAndRef((prev) => {
				const next = new Set(prev);
				if (next.has(dirPath)) {
					next.delete(dirPath);
					for (const expanded of prev) {
						if (expanded.startsWith(`${dirPath}/`)) {
							next.delete(expanded);
						}
					}
				} else {
					next.add(dirPath);
				}
				return next;
			});
			if (wasExpanded) {
				evictCollapsedDirState(dirPath);
			} else {
				void loadDir(dirPath);
			}
		},
		[evictCollapsedDirState, loadDir, updateExpandedDirsAndRef],
	);

	const openMarkdownFile = useCallback(
		async (relPath: string) => {
			setError("");
			setActivePreviewPath(null);
			setActiveFilePath(relPath);
			setActiveDirPath(parentDir(relPath));
		},
		[setActiveDirPath, setActiveFilePath, setActivePreviewPath, setError],
	);

	const openNonMarkdownExternally = useCallback(
		async (relPath: string) => {
			if (!spacePath) return;
			if (relPath.startsWith("http://") || relPath.startsWith("https://")) {
				await openUrl(relPath);
				return;
			}
			const abs = await invoke("space_resolve_abs_path", {
				path: relPath,
			}).catch(async () => join(spacePath, relPath));
			await openPath(abs);
		},
		[spacePath],
	);

	const openFile = useCallback(
		async (relPath: string) => {
			if (!relPath) return;
			if (isMarkdownPath(relPath)) {
				await openMarkdownFile(relPath);
				return;
			}
			setActiveFilePath(relPath);
			setActiveDirPath(parentDir(relPath));
			if (isInAppPreviewable(relPath)) {
				setActivePreviewPath(relPath);
				return;
			}
			setActivePreviewPath(null);
			await openNonMarkdownExternally(relPath);
		},
		[
			openMarkdownFile,
			openNonMarkdownExternally,
			setActiveFilePath,
			setActiveDirPath,
			setActivePreviewPath,
		],
	);

	const crud = useFileTreeCRUD({
		spacePath,
		updateChildrenByDir,
		updateExpandedDirs: updateExpandedDirsAndRef,
		updateRootEntries,
		renamePinnedPath,
		deletePinnedPath,
		renameItemAppearance,
		deleteItemAppearance,
		setActiveFilePath,
		setActivePreviewPath,
		activeFilePath,
		activePreviewPath,
		setError,
		loadDir,
		loadedDirsRef,
	});

	return {
		loadDir,
		toggleDir,
		openFile,
		openMarkdownFile,
		openNonMarkdownExternally,
		...crud,
	};
}
