import { join } from "@tauri-apps/api/path";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useRef } from "react";
import type { FsEntry } from "../lib/tauri";
import { invoke } from "../lib/tauri";
import { isInAppPreviewable } from "../utils/filePreview";
import { isMarkdownPath, parentDir } from "../utils/path";
import { areEntriesEqual, normalizeEntries } from "./fileTreeHelpers";
import { useFileTreeCRUD } from "./useFileTreeCRUD";
import type { CreateMarkdownFileOptions } from "./useFileTreeCRUD";

export interface UseFileTreeResult {
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
	onRenameDir: (
		path: string,
		nextName: string,
		kind?: "dir" | "file",
	) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	onMovePath: (fromPath: string, toDirPath: string) => Promise<string | null>;
}

export interface UseFileTreeDeps {
	spacePath: string | null;
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
		updateChildrenByDir,
		updateExpandedDirs,
		updateRootEntries,
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

	useEffect(() => {
		if (previousSpacePathRef.current === spacePath) return;
		previousSpacePathRef.current = spacePath;
		loadedDirsRef.current.clear();
		loadRequestVersionRef.current.clear();
	}, [spacePath]);

	const loadDir = useCallback(
		async (dirPath: string, force = false) => {
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
		[updateChildrenByDir, updateRootEntries],
	);

	const toggleDir = useCallback(
		(dirPath: string) => {
			updateExpandedDirs((prev) => {
				const next = new Set(prev);
				if (next.has(dirPath)) next.delete(dirPath);
				else {
					next.add(dirPath);
					void loadDir(dirPath);
				}
				return next;
			});
		},
		[loadDir, updateExpandedDirs],
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
		updateExpandedDirs,
		updateRootEntries,
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
