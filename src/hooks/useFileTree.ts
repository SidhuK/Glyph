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
	compareEntries,
	fileTitleFromRelPath,
	normalizeEntries,
	normalizeEntry,
	rewritePrefix,
	shouldRefreshActiveFolderView,
	withInsertedEntry,
} from "./fileTreeHelpers";

export interface UseFileTreeResult {
	loadDir: (dirPath: string, force?: boolean) => Promise<void>;
	toggleDir: (dirPath: string) => void;
	openFile: (relPath: string) => Promise<void>;
	openMarkdownFile: (relPath: string) => Promise<void>;
	openNonMarkdownExternally: (relPath: string) => Promise<void>;
	onNewFile: () => Promise<void>;
	onNewFileInDir: (dirPath: string) => Promise<void>;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (
		path: string,
		nextName: string,
		kind?: "dir" | "file",
	) => Promise<string | null>;
}

export interface UseFileTreeDeps {
	vaultPath: string | null;
	setChildrenByDir: React.Dispatch<
		React.SetStateAction<Record<string, FsEntry[] | undefined>>
	>;
	setExpandedDirs: React.Dispatch<React.SetStateAction<Set<string>>>;
	setRootEntries: React.Dispatch<React.SetStateAction<FsEntry[]>>;
	setActiveFilePath: (path: string | null) => void;
	setActivePreviewPath: (path: string | null) => void;
	setError: (error: string) => void;
	loadAndBuildFolderView: (dir: string) => Promise<void>;
	getActiveFolderDir: () => string | null;
}

export function useFileTree(deps: UseFileTreeDeps): UseFileTreeResult {
	const {
		vaultPath,
		setChildrenByDir,
		setExpandedDirs,
		setRootEntries,
		setActiveFilePath,
		setActivePreviewPath,
		setError,
		loadAndBuildFolderView,
		getActiveFolderDir,
	} = deps;

	const loadedDirsRef = useRef(new Set<string>());
	const loadRequestVersionRef = useRef(new Map<string, number>());
	const previousVaultPathRef = useRef<string | null>(vaultPath);

	useEffect(() => {
		if (previousVaultPathRef.current === vaultPath) return;
		previousVaultPathRef.current = vaultPath;
		loadedDirsRef.current.clear();
		loadRequestVersionRef.current.clear();
	}, [vaultPath]);

	const loadDir = useCallback(
		async (dirPath: string, force = false) => {
			if (!force && loadedDirsRef.current.has(dirPath)) return;
			const nextVersion = (loadRequestVersionRef.current.get(dirPath) ?? 0) + 1;
			loadRequestVersionRef.current.set(dirPath, nextVersion);
			const entries = await invoke(
				"vault_list_dir",
				dirPath ? { dir: dirPath } : {},
			);
			const normalizedEntries = normalizeEntries(entries);
			if (loadRequestVersionRef.current.get(dirPath) !== nextVersion) return;
			if (dirPath) {
				setChildrenByDir((prev) => {
					const current = prev[dirPath];
					if (areEntriesEqual(current, normalizedEntries)) return prev;
					return { ...prev, [dirPath]: normalizedEntries };
				});
			} else {
				setRootEntries((prev) =>
					areEntriesEqual(prev, normalizedEntries) ? prev : normalizedEntries,
				);
			}
			loadedDirsRef.current.add(dirPath);
		},
		[setChildrenByDir, setRootEntries],
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

	const openMarkdownFile = useCallback(
		async (relPath: string) => {
			setError("");
			setActivePreviewPath(null);
			setActiveFilePath(relPath);
			try {
				const dir = parentDir(relPath);
				await loadAndBuildFolderView(dir);
			} catch (e) {
				setError(extractErrorMessage(e));
			}
		},
		[loadAndBuildFolderView, setActiveFilePath, setActivePreviewPath, setError],
	);

	const openNonMarkdownExternally = useCallback(
		async (relPath: string) => {
			if (!vaultPath) return;
			if (relPath.startsWith("http://") || relPath.startsWith("https://")) {
				await openUrl(relPath);
				return;
			}
			const abs = await invoke("vault_resolve_abs_path", {
				path: relPath,
			}).catch(async () => join(vaultPath, relPath));
			await openPath(abs);
		},
		[vaultPath],
	);

	const openFile = useCallback(
		async (relPath: string) => {
			if (!relPath) return;
			if (isMarkdownPath(relPath)) {
				await openMarkdownFile(relPath);
				return;
			}
			setActiveFilePath(relPath);
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
			setActivePreviewPath,
		],
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

	const refreshActiveFolderViewAfterCreate = useCallback(
		async (createdInDir: string) => {
			const activeDir = getActiveFolderDir();
			if (activeDir === null) return;
			if (!shouldRefreshActiveFolderView(activeDir, createdInDir)) return;
			await loadAndBuildFolderView(activeDir);
		},
		[getActiveFolderDir, loadAndBuildFolderView],
	);

	const insertEntryOptimistic = useCallback(
		(parentDirPath: string, entry: FsEntry) => {
			const normalizedEntry = normalizeEntry(entry);
			if (!normalizedEntry) return;
			if (parentDirPath) {
				setChildrenByDir((prev) => {
					const current = prev[parentDirPath];
					if (!current) return prev;
					return {
						...prev,
						[parentDirPath]: withInsertedEntry(current, normalizedEntry),
					};
				});
				return;
			}
			setRootEntries((prev) => withInsertedEntry(prev, normalizedEntry));
		},
		[setChildrenByDir, setRootEntries],
	);

	const onNewFileInDir = useCallback(
		async (dirPath: string) => {
			if (!vaultPath) return;
			setError("");
			try {
				const { save } = await import("@tauri-apps/plugin-dialog");
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
					abs_path: absPath,
				});
				const markdownRel = isMarkdownPath(rel) ? rel : `${rel}.md`;
				const fileName = markdownRel.split("/").pop()?.trim() || "Untitled.md";
				const fileTitle = fileTitleFromRelPath(markdownRel);
				if (dirPath && !markdownRel.startsWith(`${dirPath}/`)) {
					setError(`Choose a file path inside "${dirPath}"`);
					return;
				}
				await invoke("vault_write_text", {
					path: markdownRel,
					text: `# ${fileTitle}\n`,
					base_mtime_ms: null,
				});
				insertEntryOptimistic(parentDir(markdownRel), {
					name: fileName,
					rel_path: markdownRel,
					kind: "file",
					is_markdown: true,
				});
				if (dirPath) {
					setExpandedDirs((prev) => {
						if (prev.has(dirPath)) return prev;
						const next = new Set(prev);
						next.add(dirPath);
						return next;
					});
				}
				const createdInDir = parentDir(markdownRel);
				await refreshAfterCreate(createdInDir);
				await refreshActiveFolderViewAfterCreate(createdInDir);
			} catch (e) {
				setError(extractErrorMessage(e));
			}
		},
		[
			insertEntryOptimistic,
			refreshAfterCreate,
			refreshActiveFolderViewAfterCreate,
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
				insertEntryOptimistic(dirPath, {
					name,
					rel_path: path,
					kind: "dir",
					is_markdown: false,
				});
				setExpandedDirs((prev) => {
					const next = new Set(prev);
					if (dirPath) next.add(dirPath);
					return next;
				});
				await refreshAfterCreate(dirPath);
				await refreshActiveFolderViewAfterCreate(dirPath);
				return path;
			} catch (e) {
				setError(extractErrorMessage(e));
			}
			return null;
		},
		[
			insertEntryOptimistic,
			refreshAfterCreate,
			refreshActiveFolderViewAfterCreate,
			setError,
			setExpandedDirs,
			vaultPath,
		],
	);

	const onRenameDir = useCallback(
		async (dirPath: string, nextName: string, kind: "dir" | "file" = "dir") => {
			const name = nextName.trim();
			if (!name) return dirPath;
			if (name === "." || name === "..") return null;
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
						next.add(rewritePrefix(expanded, dirPath, nextPath));
					}
					return next;
				});
				if (parent) {
					setChildrenByDir((prev) => {
						const parentEntries = prev[parent] ?? [];
						return {
							...prev,
							[parent]: parentEntries
								.map((entry) =>
									entry.rel_path === dirPath
										? { ...entry, name, rel_path: nextPath }
										: entry,
								)
								.sort(compareEntries),
						};
					});
				} else {
					setRootEntries((prev) =>
						prev
							.map((entry) =>
								entry.rel_path === dirPath
									? { ...entry, name, rel_path: nextPath }
									: entry,
							)
							.sort(compareEntries),
					);
				}
				if (kind === "dir") {
					setChildrenByDir((prev) => {
						const next: Record<string, FsEntry[] | undefined> = {};
						for (const [key, value] of Object.entries(prev)) {
							const rewrittenKey = rewritePrefix(key, dirPath, nextPath);
							next[rewrittenKey] = value?.map((entry) => ({
								...entry,
								rel_path: rewritePrefix(entry.rel_path, dirPath, nextPath),
							}));
						}
						return next;
					});
					loadedDirsRef.current = new Set(
						[...loadedDirsRef.current].map((loaded) =>
							rewritePrefix(loaded, dirPath, nextPath),
						),
					);
				} else {
					setChildrenByDir((prev) => {
						const next: Record<string, FsEntry[] | undefined> = {};
						for (const [key, value] of Object.entries(prev)) {
							next[key] = value?.map((entry) =>
								entry.rel_path === dirPath
									? { ...entry, name, rel_path: nextPath }
									: entry,
							);
						}
						return next;
					});
				}
				await refreshAfterCreate(parent);
				if (kind === "dir") {
					await loadDir(nextPath, true);
				}
				return nextPath;
			} catch (e) {
				setError(extractErrorMessage(e));
				return null;
			}
		},
		[
			loadDir,
			refreshAfterCreate,
			setChildrenByDir,
			setError,
			setExpandedDirs,
			setRootEntries,
		],
	);

	return {
		loadDir,
		toggleDir,
		openFile,
		openMarkdownFile,
		openNonMarkdownExternally,
		onNewFile,
		onNewFileInDir,
		onNewFolderInDir,
		onRenameDir,
	};
}
