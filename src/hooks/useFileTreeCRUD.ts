import { join } from "@tauri-apps/api/path";
import { useCallback, useEffect, useRef } from "react";
import { dispatchPathRemoved } from "../lib/appEvents";
import {
	createDatabaseNotePath,
	createDefaultDatabaseConfig,
	createStarterDatabaseMarkdown,
} from "../lib/database/config";
import { extractErrorMessage } from "../lib/errorUtils";
import { updateFileTreeOrder } from "../lib/settings";
import type { FsEntry } from "../lib/tauri";
import { invoke } from "../lib/tauri";
import { isMarkdownPath, parentDir } from "../utils/path";
import {
	clampInsertionIndex,
	compareEntries,
	fileTitleFromRelPath,
	getFileTreeOrderKey,
	insertPathAtIndex,
	normalizeEntry,
	type FileTreeMoveOptions,
	type FileTreeOrderByDir,
	normalizeRelPath,
	removeFileTreeOrderPaths,
	rewriteFileTreeOrderPaths,
	rewritePrefix,
	shouldRefreshActiveFolderView,
	withInsertedEntry,
} from "./fileTreeHelpers";

export interface UseFileTreeCRUDDeps {
	spacePath: string | null;
	updateChildrenByDir: (
		next:
			| Record<string, FsEntry[] | undefined>
			| ((
				prev: Record<string, FsEntry[] | undefined>,
			) => Record<string, FsEntry[] | undefined>),
	) => void;
	childrenByDir: Record<string, FsEntry[] | undefined>;
	updateExpandedDirs: (
		next: Set<string> | ((prev: Set<string>) => Set<string>),
	) => void;
	updateRootEntries: (
		next: FsEntry[] | ((prev: FsEntry[]) => FsEntry[]),
	) => void;
	rootEntries: FsEntry[];
	setActiveFilePath: (path: string | null) => void;
	setActivePreviewPath: (path: string | null) => void;
	activeFilePath: string | null;
	activePreviewPath: string | null;
	setError: (error: string) => void;
	loadDir: (dirPath: string, force?: boolean) => Promise<void>;
	loadAndBuildFolderView: (dir: string) => Promise<void>;
	getActiveFolderDir: () => string | null;
	loadedDirsRef: React.RefObject<Set<string>>;
}

export function useFileTreeCRUD(deps: UseFileTreeCRUDDeps) {
	const {
		spacePath,
		updateChildrenByDir,
		childrenByDir,
		updateExpandedDirs,
		updateRootEntries,
		rootEntries,
		setActiveFilePath,
		setActivePreviewPath,
		activeFilePath,
		activePreviewPath,
		setError,
		loadDir,
		loadAndBuildFolderView,
		getActiveFolderDir,
		loadedDirsRef,
	} = deps;
	const activeFilePathRef = useRef(activeFilePath);
	const activePreviewPathRef = useRef(activePreviewPath);

	useEffect(() => {
		activeFilePathRef.current = activeFilePath;
	}, [activeFilePath]);

	useEffect(() => {
		activePreviewPathRef.current = activePreviewPath;
	}, [activePreviewPath]);

	const getEntriesForDir = useCallback(
		(dirPath: string) => (dirPath ? (childrenByDir[dirPath] ?? []) : rootEntries),
		[childrenByDir, rootEntries],
	);

	const buildNextOrderState = useCallback(
		(
			current: FileTreeOrderByDir,
			from: string,
			nextPath: string,
			fromParent: string,
			toParent: string,
			requestedIndex: number | undefined,
		) => {
			const next =
				nextPath === from
					? { ...current }
					: rewriteFileTreeOrderPaths(current, from, nextPath);
			const sourceCurrentPaths = (() => {
				const entries = getEntriesForDir(fromParent);
				return entries.length > 0
					? entries.map((entry) => entry.rel_path)
					: [...(next[getFileTreeOrderKey(fromParent)] ?? [])];
			})();
			const destCurrentPaths = (() => {
				if (fromParent === toParent) return sourceCurrentPaths;
				const entries = getEntriesForDir(toParent);
				return entries.length > 0
					? entries.map((entry) => entry.rel_path)
					: [...(next[getFileTreeOrderKey(toParent)] ?? [])];
			})();

			const sourceWithoutMoved = sourceCurrentPaths.filter(
				(path) => path !== from && path !== nextPath,
			);
			const destWithoutMoved =
				fromParent === toParent
					? sourceWithoutMoved
					: destCurrentPaths.filter((path) => path !== from && path !== nextPath);

			const sourceIndex = sourceCurrentPaths.findIndex((path) => path === from);
			let insertionIndex =
				typeof requestedIndex === "number" && Number.isFinite(requestedIndex)
					? Math.trunc(requestedIndex)
					: destWithoutMoved.length;
			if (
				fromParent === toParent &&
				sourceIndex !== -1 &&
				insertionIndex > sourceIndex
			) {
				insertionIndex = Math.max(sourceIndex, insertionIndex - 1);
			}
			insertionIndex = clampInsertionIndex(insertionIndex, destWithoutMoved.length);

			const reorderedDestPaths = insertPathAtIndex(
				destWithoutMoved,
				nextPath,
				insertionIndex,
			);
			if (fromParent === toParent) {
				next[getFileTreeOrderKey(toParent)] = reorderedDestPaths;
				return next;
			}

			const sourceKey = getFileTreeOrderKey(fromParent);
			const destKey = getFileTreeOrderKey(toParent);
			if (sourceWithoutMoved.length > 0) next[sourceKey] = sourceWithoutMoved;
			else delete next[sourceKey];
			next[destKey] = reorderedDestPaths;
			return next;
		},
		[getEntriesForDir],
	);

	const refreshAfterCreate = useCallback(
		async (targetDir: string) => {
			await loadDir(targetDir, true);
			const parent = parentDir(targetDir);
			if (parent !== targetDir) await loadDir(parent, true);
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

	const refreshActiveFolderViewAfterPathChange = useCallback(
		async (changedPath: string) => {
			const activeDir = getActiveFolderDir();
			if (activeDir === null) return;
			if (
				activeDir === changedPath ||
				activeDir.startsWith(`${changedPath}/`) ||
				changedPath.startsWith(`${activeDir}/`)
			)
				await loadAndBuildFolderView(activeDir);
		},
		[getActiveFolderDir, loadAndBuildFolderView],
	);

	const insertEntryOptimistic = useCallback(
		(parentDirPath: string, entry: FsEntry) => {
			const normalizedEntry = normalizeEntry(entry);
			if (!normalizedEntry) return;
			if (parentDirPath) {
				updateChildrenByDir((prev) => {
					const c = prev[parentDirPath];
					if (!c) return prev;
					return {
						...prev,
						[parentDirPath]: withInsertedEntry(c, normalizedEntry),
					};
				});
				return;
			}
			updateRootEntries((prev) => withInsertedEntry(prev, normalizedEntry));
		},
		[updateChildrenByDir, updateRootEntries],
	);

	const onNewFileInDir = useCallback(
		async (dirPath: string) => {
			if (!spacePath) return;
			setError("");
			try {
				const { save } = await import("@tauri-apps/plugin-dialog");
				const defaultPath = dirPath
					? await join(spacePath, dirPath, "Untitled.md")
					: await join(spacePath, "Untitled.md");
				const selection = await save({
					title: "Create new Markdown file",
					defaultPath,
					filters: [{ name: "Markdown", extensions: ["md"] }],
				});
				const absPath = Array.isArray(selection)
					? (selection[0] ?? null)
					: selection;
				if (!absPath) return;
				const rel = await invoke("space_relativize_path", {
					abs_path: absPath,
				});
				const markdownRel = isMarkdownPath(rel) ? rel : `${rel}.md`;
				const fileName = markdownRel.split("/").pop()?.trim() || "Untitled.md";
				const fileTitle = fileTitleFromRelPath(markdownRel);
				if (dirPath && !markdownRel.startsWith(`${dirPath}/`)) {
					setError(`Choose a file path inside "${dirPath}"`);
					return;
				}
				await invoke("space_write_text", {
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
				if (dirPath)
					updateExpandedDirs((prev) => {
						if (prev.has(dirPath)) return prev;
						const next = new Set(prev);
						next.add(dirPath);
						return next;
					});
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
			updateExpandedDirs,
			spacePath,
		],
	);

	const onNewFile = useCallback(async () => {
		await onNewFileInDir("");
	}, [onNewFileInDir]);

	const onNewDatabaseInDir = useCallback(
		async (dirPath: string) => {
			if (!spacePath) return null;
			setError("");
			try {
				const entries = await invoke(
					"space_list_dir",
					dirPath ? { dir: dirPath } : {},
				);
				const existing = new Set(
					entries.map((entry) => entry.rel_path.toLowerCase()),
				);
				let nextPath = createDatabaseNotePath(dirPath);
				let suffix = 2;
				while (existing.has(nextPath.toLowerCase())) {
					nextPath = createDatabaseNotePath(dirPath, `New Database ${suffix}`);
					suffix += 1;
				}
				const title =
					nextPath.split("/").pop()?.replace(/\.md$/i, "") ?? "New Database";
				const markdown = createStarterDatabaseMarkdown(
					title,
					createDefaultDatabaseConfig(dirPath),
				);
				await invoke("space_write_text", {
					path: nextPath,
					text: markdown,
					base_mtime_ms: null,
				});
				insertEntryOptimistic(parentDir(nextPath), {
					name: nextPath.split("/").pop() ?? "New Database.md",
					rel_path: nextPath,
					kind: "file",
					is_markdown: true,
				});
				await refreshAfterCreate(parentDir(nextPath));
				await refreshActiveFolderViewAfterCreate(parentDir(nextPath));
				return nextPath;
			} catch (e) {
				setError(extractErrorMessage(e));
				return null;
			}
		},
		[
			insertEntryOptimistic,
			refreshActiveFolderViewAfterCreate,
			refreshAfterCreate,
			setError,
			spacePath,
		],
	);

	const onNewFolderInDir = useCallback(
		async (dirPath: string) => {
			if (!spacePath) return null;
			try {
				const siblings = await invoke(
					"space_list_dir",
					dirPath ? { dir: dirPath } : {},
				);
				const siblingNames = new Set(
					siblings
						.filter((e) => e.kind === "dir")
						.map((e) => e.name.toLowerCase()),
				);
				let name = "New Folder";
				if (siblingNames.has(name.toLowerCase())) {
					let n = 2;
					while (siblingNames.has(`new folder ${n}`)) n += 1;
					name = `New Folder ${n}`;
				}
				setError("");
				const path = dirPath ? `${dirPath}/${name}` : name;
				await invoke("space_create_dir", { path });
				insertEntryOptimistic(dirPath, {
					name,
					rel_path: path,
					kind: "dir",
					is_markdown: false,
				});
				updateExpandedDirs((prev) => {
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
			updateExpandedDirs,
			spacePath,
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
				await invoke("space_rename_path", {
					from_path: dirPath,
					to_path: nextPath,
				});
				if (spacePath) {
					await updateFileTreeOrder(spacePath, (current) =>
						rewriteFileTreeOrderPaths(current, dirPath, nextPath),
					);
				}
				updateExpandedDirs((prev) => {
					const next = new Set<string>();
					for (const expanded of prev)
						next.add(rewritePrefix(expanded, dirPath, nextPath));
					return next;
				});
				if (parent) {
					updateChildrenByDir((prev) => {
						const pe = prev[parent] ?? [];
						return {
							...prev,
							[parent]: pe
								.map((e) =>
									e.rel_path === dirPath
										? { ...e, name, rel_path: nextPath }
										: e,
								)
								.sort(compareEntries),
						};
					});
				} else {
					updateRootEntries((prev) =>
						prev
							.map((e) =>
								e.rel_path === dirPath ? { ...e, name, rel_path: nextPath } : e,
							)
							.sort(compareEntries),
					);
				}
				if (kind === "dir") {
					updateChildrenByDir((prev) => {
						const next: Record<string, FsEntry[] | undefined> = {};
						for (const [k, v] of Object.entries(prev)) {
							next[rewritePrefix(k, dirPath, nextPath)] = v?.map((e) => ({
								...e,
								rel_path: rewritePrefix(e.rel_path, dirPath, nextPath),
							}));
						}
						return next;
					});
					loadedDirsRef.current = new Set(
						[...loadedDirsRef.current].map((l) =>
							rewritePrefix(l, dirPath, nextPath),
						),
					);
				} else {
					updateChildrenByDir((prev) => {
						const next: Record<string, FsEntry[] | undefined> = {};
						for (const [k, v] of Object.entries(prev)) {
							next[k] = v?.map((e) =>
								e.rel_path === dirPath ? { ...e, name, rel_path: nextPath } : e,
							);
						}
						return next;
					});
				}
				await refreshAfterCreate(parent);
				if (kind === "dir") await loadDir(nextPath, true);
				return nextPath;
			} catch (e) {
				setError(extractErrorMessage(e));
				return null;
			}
		},
		[
			loadDir,
			loadedDirsRef,
			refreshAfterCreate,
			spacePath,
			updateChildrenByDir,
			setError,
			updateExpandedDirs,
			updateRootEntries,
		],
	);

	const onDeletePath = useCallback(
		async (path: string, kind: "dir" | "file") => {
			const target = normalizeRelPath(path);
			if (!target) return false;
			setError("");
			try {
				await invoke("space_delete_path", {
					path: target,
					recursive: kind === "dir",
				});
				if (spacePath) {
					await updateFileTreeOrder(spacePath, (current) =>
						removeFileTreeOrderPaths(current, target),
					);
				}
				const parent = parentDir(target);
				updateExpandedDirs((prev) => {
					if (kind !== "dir") return prev;
					const next = new Set<string>();
					for (const e of prev) {
						if (e === target || e.startsWith(`${target}/`)) continue;
						next.add(e);
					}
					return next;
				});
				updateRootEntries((prev) =>
					prev.filter(
						(e) =>
							e.rel_path !== target &&
							(kind !== "dir" || !e.rel_path.startsWith(`${target}/`)),
					),
				);
				updateChildrenByDir((prev) => {
					const next: Record<string, FsEntry[] | undefined> = {};
					for (const [k, entries] of Object.entries(prev)) {
						if (kind === "dir" && (k === target || k.startsWith(`${target}/`)))
							continue;
						next[k] = entries?.filter(
							(e) =>
								e.rel_path !== target &&
								(kind !== "dir" || !e.rel_path.startsWith(`${target}/`)),
						);
					}
					return next;
				});
				loadedDirsRef.current = new Set(
					[...loadedDirsRef.current].filter(
						(d) =>
							d !== target && (kind !== "dir" || !d.startsWith(`${target}/`)),
					),
				);
				const activeFile = activeFilePathRef.current;
				const activePreview = activePreviewPathRef.current;
				if (
					activeFile === target ||
					(kind === "dir" && Boolean(activeFile?.startsWith(`${target}/`)))
				)
					setActiveFilePath(null);
				if (
					activePreview === target ||
					(kind === "dir" && Boolean(activePreview?.startsWith(`${target}/`)))
				)
					setActivePreviewPath(null);
				dispatchPathRemoved({
					path: target,
					recursive: kind === "dir",
				});
				await loadDir(parent, true);
				await refreshActiveFolderViewAfterPathChange(target);
				return true;
			} catch (e) {
				setError(extractErrorMessage(e));
				return false;
			}
		},
		[
			loadDir,
			loadedDirsRef,
			refreshActiveFolderViewAfterPathChange,
			spacePath,
			setActiveFilePath,
			setActivePreviewPath,
			updateChildrenByDir,
			setError,
			updateExpandedDirs,
			updateRootEntries,
		],
	);

	const onMovePath = useCallback(
		async (
			fromPath: string,
			toDirPath: string,
			options?: FileTreeMoveOptions,
		) => {
			const from = normalizeRelPath(fromPath);
			const toDir = normalizeRelPath(toDirPath);
			if (!from) return null;

			// Prevent moving a folder into itself or its own children
			if (toDir === from || toDir.startsWith(`${from}/`)) return null;

			const fileName = from.split("/").pop() ?? "";
			if (!fileName) return null;
			const nextPath = toDir ? `${toDir}/${fileName}` : fileName;
			const fromParent = parentDir(from);
			const toParent = toDir;

			if (nextPath === from && options?.index === undefined) return nextPath;
			setError("");
			try {
				if (nextPath === from) {
					if (spacePath) {
						await updateFileTreeOrder(spacePath, (current) =>
							buildNextOrderState(
								current,
								from,
								nextPath,
								fromParent,
								toParent,
								options?.index,
							),
						);
					}
					await Promise.all([
						loadDir(fromParent, true),
						refreshActiveFolderViewAfterPathChange(fromParent),
					]);
					return nextPath;
				}

				await invoke("space_rename_path", {
					from_path: from,
					to_path: nextPath,
				});
				if (spacePath) {
					await updateFileTreeOrder(spacePath, (current) =>
						buildNextOrderState(
							current,
							from,
							nextPath,
							fromParent,
							toParent,
							options?.index,
						),
					);
				}
				const nextName = nextPath.split("/").pop() ?? fileName;
				updateChildrenByDir((prev) => {
					const next: Record<string, FsEntry[] | undefined> = {};
					for (const [k, v] of Object.entries(prev)) {
						next[k] = v?.map((e) =>
							e.rel_path === from
								? { ...e, name: nextName, rel_path: nextPath }
								: e,
						);
					}
					return next;
				});
				updateRootEntries((prev) =>
					prev.map((e) =>
						e.rel_path === from
							? { ...e, name: nextName, rel_path: nextPath }
							: e,
					),
				);
				if (activeFilePathRef.current === from) setActiveFilePath(nextPath);
				if (activePreviewPathRef.current === from)
					setActivePreviewPath(nextPath);
				await Promise.all([
					loadDir(fromParent, true),
					loadDir(toParent, true),
					refreshActiveFolderViewAfterPathChange(from),
					refreshActiveFolderViewAfterPathChange(toParent),
				]);
				return nextPath;
			} catch (e) {
				setError(extractErrorMessage(e));
				return null;
			}
		},
		[
			buildNextOrderState,
			loadDir,
			refreshActiveFolderViewAfterPathChange,
			spacePath,
			setActiveFilePath,
			setActivePreviewPath,
			updateChildrenByDir,
			setError,
			updateRootEntries,
		],
	);

	return {
		onNewFile,
		onNewFileInDir,
		onNewDatabaseInDir,
		onNewFolderInDir,
		onRenameDir,
		onDeletePath,
		onMovePath,
	};
}
