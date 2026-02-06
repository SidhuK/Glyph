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
	onNewFileInDir: (dirPath: string) => Promise<void>;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (dirPath: string, nextName: string) => Promise<string | null>;
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
	const issueOpenNoteCommand = useCallback(
		(relPath: string) => {
			setCanvasCommand({
				id: crypto.randomUUID(),
				kind: "open_note_editor",
				noteId: relPath,
				title: relPath.split("/").pop() || relPath,
			});
		},
		[setCanvasCommand],
	);

	const loadDir = useCallback(
		async (dirPath: string, force = false) => {
			if (!force && loadedDirsRef.current.has(dirPath)) return;
			const entries = await invoke(
				"vault_list_dir",
				dirPath ? { dir: dirPath } : {},
			);
			if (dirPath) {
				setChildrenByDir((prev) => ({ ...prev, [dirPath]: entries }));
			} else {
				setRootEntries(entries);
			}
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
		[setChildrenByDir, setDirSummariesByParent, setRootEntries],
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
			setActiveFilePath(relPath);
			issueOpenNoteCommand(relPath);
			try {
				const dir = parentDir(relPath);
				await loadAndBuildFolderView(dir);
				issueOpenNoteCommand(relPath);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[issueOpenNoteCommand, loadAndBuildFolderView, setActiveFilePath, setError],
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

	const refreshAfterCreate = useCallback(
		async (targetDir: string) => {
			await loadDir(targetDir, true);
			const parent = parentDir(targetDir);
			if (parent !== targetDir) {
				await loadDir(parent, true);
			}
		},
		[loadDir],
	);

	const onNewFileInDir = useCallback(
		async (dirPath: string) => {
			if (!vaultPath) return;
			setError("");
			try {
				const defaultPath = dirPath
					? await join(vaultPath, dirPath, "Untitled.md")
					: await join(vaultPath, "Untitled.md");
				const selection = await save({
					title: "Create new Markdown file",
					defaultPath,
					filters: [{ name: "Markdown", extensions: ["md"] }],
				});
				const absPath = Array.isArray(selection)
					? (selection[0] ?? null)
					: selection;
				if (!absPath) return;
				const rel = await invoke("vault_relativize_path", {
					absPath,
				});
				const markdownRel = isMarkdownPath(rel) ? rel : `${rel}.md`;
				if (dirPath && !markdownRel.startsWith(`${dirPath}/`)) {
					setError(`Choose a file path inside "${dirPath}"`);
					return;
				}
				await invoke("vault_write_text", {
					path: markdownRel,
					text: "# Untitled\n",
					base_mtime_ms: null,
				});
				if (dirPath) {
					setExpandedDirs((prev) => {
						if (prev.has(dirPath)) return prev;
						const next = new Set(prev);
						next.add(dirPath);
						return next;
					});
				}
				await refreshAfterCreate(dirPath);
				await openMarkdownFileInCanvas(markdownRel);
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[
			openMarkdownFileInCanvas,
			refreshAfterCreate,
			setError,
			setExpandedDirs,
			vaultPath,
		],
	);

	const onNewFile = useCallback(async () => {
		await onNewFileInDir("");
	}, [onNewFileInDir]);

	const onNewFolderInDir = useCallback(
		async (dirPath: string) => {
			if (!vaultPath) return null;
			try {
				const siblings = await invoke(
					"vault_list_dir",
					dirPath ? { dir: dirPath } : {},
				);
				const siblingNames = new Set(
					siblings
						.filter((entry) => entry.kind === "dir")
						.map((entry) => entry.name.toLowerCase()),
				);
				let name = "New Folder";
				if (siblingNames.has(name.toLowerCase())) {
					let n = 2;
					while (siblingNames.has(`new folder ${n}`)) n += 1;
					name = `New Folder ${n}`;
				}
				setError("");
				const path = dirPath ? `${dirPath}/${name}` : name;
				await invoke("vault_create_dir", { path });
				setExpandedDirs((prev) => {
					const next = new Set(prev);
					if (dirPath) next.add(dirPath);
					next.add(path);
					return next;
				});
				await refreshAfterCreate(dirPath);
				return path;
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
			return null;
		},
		[refreshAfterCreate, setError, setExpandedDirs, vaultPath],
	);

	const onRenameDir = useCallback(
		async (dirPath: string, nextName: string) => {
			const name = nextName.trim();
			if (!name || name === "." || name === "..") return null;
			if (name.includes("/") || name.includes("\\")) {
				setError("Folder name cannot contain path separators");
				return null;
			}
			const parent = parentDir(dirPath);
			const nextPath = parent ? `${parent}/${name}` : name;
			if (nextPath === dirPath) return nextPath;
			setError("");
			try {
				await invoke("vault_rename_path", {
					from_path: dirPath,
					to_path: nextPath,
				});
				setExpandedDirs((prev) => {
					const next = new Set<string>();
					for (const expanded of prev) {
						if (expanded === dirPath || expanded.startsWith(`${dirPath}/`)) {
							next.add(`${nextPath}${expanded.slice(dirPath.length)}`);
						} else {
							next.add(expanded);
						}
					}
					return next;
				});
				setChildrenByDir((prev) => {
					const next: Record<string, FsEntry[] | undefined> = {};
					for (const [key, value] of Object.entries(prev)) {
						if (key === dirPath || key.startsWith(`${dirPath}/`)) {
							next[`${nextPath}${key.slice(dirPath.length)}`] = value;
						} else {
							next[key] = value;
						}
					}
					return next;
				});
				loadedDirsRef.current = new Set(
					[...loadedDirsRef.current].map((loaded) =>
						loaded === dirPath || loaded.startsWith(`${dirPath}/`)
							? `${nextPath}${loaded.slice(dirPath.length)}`
							: loaded,
					),
				);
				await refreshAfterCreate(parent);
				await loadDir(nextPath, true);
				return nextPath;
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
				return null;
			}
		},
		[loadDir, refreshAfterCreate, setChildrenByDir, setError, setExpandedDirs],
	);

	return {
		loadDir,
		toggleDir,
		openFile,
		openMarkdownFileInCanvas,
		openNonMarkdownExternally,
		onNewFile,
		onNewFileInDir,
		onNewFolderInDir,
		onRenameDir,
	};
}
