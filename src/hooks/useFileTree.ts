import { join } from "@tauri-apps/api/path";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useRef } from "react";
import { extractErrorMessage } from "../lib/errorUtils";
import type { FsEntry } from "../lib/tauri";
import { invoke } from "../lib/tauri";
import { isInAppPreviewable } from "../utils/filePreview";
import { isMarkdownPath, parentDir } from "../utils/path";
import {
	areEntriesEqual,
	normalizeEntries,
} from "./fileTreeHelpers";
import { useFileTreeCRUD } from "./useFileTreeCRUD";

export interface UseFileTreeResult {
	loadDir: (dirPath: string, force?: boolean) => Promise<void>;
	toggleDir: (dirPath: string) => void;
	openFile: (relPath: string) => Promise<void>;
	openMarkdownFile: (relPath: string) => Promise<void>;
	openNonMarkdownExternally: (relPath: string) => Promise<void>;
	onNewFile: () => Promise<void>;
	onNewFileInDir: (dirPath: string) => Promise<void>;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (path: string, nextName: string, kind?: "dir" | "file") => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	onMovePath: (fromPath: string, toDirPath: string) => Promise<string | null>;
}

export interface UseFileTreeDeps {
	vaultPath: string | null;
	setChildrenByDir: React.Dispatch<React.SetStateAction<Record<string, FsEntry[] | undefined>>>;
	setExpandedDirs: React.Dispatch<React.SetStateAction<Set<string>>>;
	setRootEntries: React.Dispatch<React.SetStateAction<FsEntry[]>>;
	setActiveFilePath: (path: string | null) => void;
	setActivePreviewPath: (path: string | null) => void;
	activeFilePath: string | null;
	activePreviewPath: string | null;
	setError: (error: string) => void;
	loadAndBuildFolderView: (dir: string) => Promise<void>;
	getActiveFolderDir: () => string | null;
}

export function useFileTree(deps: UseFileTreeDeps): UseFileTreeResult {
	const { vaultPath, setChildrenByDir, setExpandedDirs, setRootEntries, setActiveFilePath, setActivePreviewPath, setError, loadAndBuildFolderView, getActiveFolderDir, activeFilePath, activePreviewPath } = deps;

	const loadedDirsRef = useRef(new Set<string>());
	const loadRequestVersionRef = useRef(new Map<string, number>());
	const previousVaultPathRef = useRef<string | null>(vaultPath);

	useEffect(() => {
		if (previousVaultPathRef.current === vaultPath) return;
		previousVaultPathRef.current = vaultPath;
		loadedDirsRef.current.clear();
		loadRequestVersionRef.current.clear();
	}, [vaultPath]);

	const loadDir = useCallback(async (dirPath: string, force = false) => {
		if (!force && loadedDirsRef.current.has(dirPath)) return;
		const nextVersion = (loadRequestVersionRef.current.get(dirPath) ?? 0) + 1;
		loadRequestVersionRef.current.set(dirPath, nextVersion);
		const entries = await invoke("vault_list_dir", dirPath ? { dir: dirPath } : {});
		const normalizedEntries = normalizeEntries(entries);
		if (loadRequestVersionRef.current.get(dirPath) !== nextVersion) return;
		if (dirPath) {
			setChildrenByDir((prev) => { const c = prev[dirPath]; if (areEntriesEqual(c, normalizedEntries)) return prev; return { ...prev, [dirPath]: normalizedEntries }; });
		} else {
			setRootEntries((prev) => areEntriesEqual(prev, normalizedEntries) ? prev : normalizedEntries);
		}
		loadedDirsRef.current.add(dirPath);
	}, [setChildrenByDir, setRootEntries]);

	const toggleDir = useCallback((dirPath: string) => {
		setExpandedDirs((prev) => {
			const next = new Set(prev);
			if (next.has(dirPath)) next.delete(dirPath);
			else { next.add(dirPath); void loadDir(dirPath); }
			return next;
		});
	}, [loadDir, setExpandedDirs]);

	const openMarkdownFile = useCallback(async (relPath: string) => {
		setError("");
		setActivePreviewPath(null);
		setActiveFilePath(relPath);
		try { await loadAndBuildFolderView(parentDir(relPath)); }
		catch (e) { setError(extractErrorMessage(e)); }
	}, [loadAndBuildFolderView, setActiveFilePath, setActivePreviewPath, setError]);

	const openNonMarkdownExternally = useCallback(async (relPath: string) => {
		if (!vaultPath) return;
		if (relPath.startsWith("http://") || relPath.startsWith("https://")) { await openUrl(relPath); return; }
		const abs = await invoke("vault_resolve_abs_path", { path: relPath }).catch(async () => join(vaultPath, relPath));
		await openPath(abs);
	}, [vaultPath]);

	const openFile = useCallback(async (relPath: string) => {
		if (!relPath) return;
		if (isMarkdownPath(relPath)) { await openMarkdownFile(relPath); return; }
		setActiveFilePath(relPath);
		if (isInAppPreviewable(relPath)) { setActivePreviewPath(relPath); return; }
		setActivePreviewPath(null);
		await openNonMarkdownExternally(relPath);
	}, [openMarkdownFile, openNonMarkdownExternally, setActiveFilePath, setActivePreviewPath]);

	const crud = useFileTreeCRUD({
		vaultPath, setChildrenByDir, setExpandedDirs, setRootEntries,
		setActiveFilePath, setActivePreviewPath, activeFilePath, activePreviewPath,
		setError, loadDir, loadAndBuildFolderView, getActiveFolderDir, loadedDirsRef,
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
