import { join } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useRef } from "react";
import type { DirChildSummary, FsEntry } from "../lib/tauri";
import { invoke } from "../lib/tauri";
import { isMarkdownPath, parentDir } from "../utils/path";

export interface UseFileTreeResult {
	loadDir: (dirPath: string, force?: boolean) => Promise<void>;
	toggleDir: (dirPath: string) => void;
	openFile: (relPath: string) => Promise<void>;
	openMarkdownFileInCanvas: (relPath: string) => Promise<void>;
	openNonMarkdownExternally: (relPath: string) => Promise<void>;
	onNewFile: () => Promise<void>;
}

export interface UseFileTreeDeps {
	vaultPath: string | null;
	setChildrenByDir: React.Dispatch<
		React.SetStateAction<Record<string, FsEntry[] | undefined>>
	>;
	setDirSummariesByParent: React.Dispatch<
		React.SetStateAction<Record<string, DirChildSummary[] | undefined>>
	>;
	setExpandedDirs: React.Dispatch<React.SetStateAction<Set<string>>>;
	setRootEntries: (entries: FsEntry[]) => void;
	setActiveFilePath: (path: string | null) => void;
	setCanvasCommand: (
		cmd: { id: string; kind: string; noteId?: string; title?: string } | null,
	) => void;
	setError: (error: string) => void;
	loadAndBuildFolderView: (dir: string) => Promise<void>;
}

export function useFileTree(deps: UseFileTreeDeps): UseFileTreeResult {
	const {
		vaultPath,
		setChildrenByDir,
		setDirSummariesByParent,
		setExpandedDirs,
		setRootEntries,
		setActiveFilePath,
		setCanvasCommand,
		setError,
		loadAndBuildFolderView,
	} = deps;

	const dirSummariesInFlightRef = useRef(new Set<string>());
	const loadedDirsRef = useRef(new Set<string>());

	const loadDir = useCallback(
		async (dirPath: string, force = false) => {
			if (!force && loadedDirsRef.current.has(dirPath)) return;
			const entries = await invoke(
				"vault_list_dir",
				dirPath ? { dir: dirPath } : {},
			);
			setChildrenByDir((prev) => ({ ...prev, [dirPath]: entries }));
			loadedDirsRef.current.add(dirPath);

			if (dirSummariesInFlightRef.current.has(dirPath)) return;
			dirSummariesInFlightRef.current.add(dirPath);

			void (async () => {
				try {
					const summaries = await invoke("vault_dir_children_summary", {
						dir: dirPath || null,
						preview_limit: 1,
					});
					setDirSummariesByParent((prev) => ({
						...prev,
						[dirPath]: summaries,
					}));
				} catch {
					// ignore: counts are convenience UI
				} finally {
					dirSummariesInFlightRef.current.delete(dirPath);
				}
			})();
		},
		[setChildrenByDir, setDirSummariesByParent],
	);

	const toggleDir = useCallback(
		(dirPath: string) => {
			setExpandedDirs((prev) => {
				const next = new Set(prev);
				if (next.has(dirPath)) {
					next.delete(dirPath);
				} else {
					next.add(dirPath);
					void loadDir(dirPath);
				}
				return next;
			});
		},
		[loadDir, setExpandedDirs],
	);

	const openMarkdownFileInCanvas = useCallback(
		async (relPath: string) => {
			setError("");
			try {
				const dir = parentDir(relPath);
				await loadAndBuildFolderView(dir);
				setActiveFilePath(relPath);
				setCanvasCommand({
					id: crypto.randomUUID(),
					kind: "open_note_editor",
					noteId: relPath,
					title: relPath.split("/").pop() || relPath,
				});
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[loadAndBuildFolderView, setActiveFilePath, setCanvasCommand, setError],
	);

	const openNonMarkdownExternally = useCallback(
		async (relPath: string) => {
			if (!vaultPath) return;
			if (relPath.startsWith("http://") || relPath.startsWith("https://")) {
				await openUrl(relPath);
				return;
			}
			const abs = await join(vaultPath, relPath);
			await openPath(abs);
		},
		[vaultPath],
	);

	const openFile = useCallback(
		async (relPath: string) => {
			if (!relPath) return;
			if (isMarkdownPath(relPath)) {
				await openMarkdownFileInCanvas(relPath);
				return;
			}
			setActiveFilePath(relPath);
			await openNonMarkdownExternally(relPath);
		},
		[openMarkdownFileInCanvas, openNonMarkdownExternally, setActiveFilePath],
	);

	const onNewFile = useCallback(async () => {
		if (!vaultPath) return;
		const selection = await save({
			title: "Create new Markdown file",
			defaultPath: `${vaultPath}/Untitled.md`,
			filters: [{ name: "Markdown", extensions: ["md"] }],
		});
		const absPath = Array.isArray(selection)
			? (selection[0] ?? null)
			: selection;
		if (!absPath) return;
		const rel = await invoke("vault_relativize_path", { abs_path: absPath });
		await invoke("vault_write_text", {
			path: rel,
			text: "# Untitled\n",
			base_mtime_ms: null,
		});
		const entries = await invoke("vault_list_dir", {});
		setRootEntries(entries);
		await openMarkdownFileInCanvas(rel);
	}, [openMarkdownFileInCanvas, setRootEntries, vaultPath]);

	return {
		loadDir,
		toggleDir,
		openFile,
		openMarkdownFileInCanvas,
		openNonMarkdownExternally,
		onNewFile,
	};
}
