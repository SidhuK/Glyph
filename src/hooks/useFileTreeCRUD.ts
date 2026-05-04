import { useCallback, useRef } from "react";
import { toast } from "sonner";
import {
	dispatchFileTreeStartRename,
	dispatchPathRemoved,
	dispatchPathRenamed,
} from "../lib/appEvents";
import { extractErrorMessage } from "../lib/errorUtils";
import { isMissingFileError } from "../lib/fsErrors";
import {
	invalidateAllDocsPrefetch,
	optimisticallyAddAllDocsNote,
	optimisticallyRemoveAllDocsPath,
	optimisticallyRenameAllDocsPath,
} from "../lib/navigationPrefetch";
import { updateOnboardingSettings } from "../lib/settings";
import type { FsEntry, LinkRewriteResult } from "../lib/tauri";
import { invoke } from "../lib/tauri";
import { isMarkdownPath, parentDir } from "../utils/path";
import {
	compareEntries,
	normalizeEntry,
	normalizeRelPath,
	rewritePrefix,
	withInsertedEntry,
} from "./fileTreeHelpers";

interface UseFileTreeCRUDDeps {
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
	renamePinnedPath: (fromPath: string, toPath: string) => Promise<void>;
	deletePinnedPath: (path: string) => Promise<void>;
	renameItemAppearance: (fromPath: string, toPath: string) => Promise<void>;
	deleteItemAppearance: (path: string) => Promise<void>;
	setActiveFilePath: (path: string | null) => void;
	setActivePreviewPath: (path: string | null) => void;
	activeFilePath: string | null;
	activePreviewPath: string | null;
	setError: (error: string) => void;
	loadDir: (dirPath: string, force?: boolean) => Promise<void>;
	loadedDirsRef: React.RefObject<Set<string>>;
}

export interface CreateMarkdownFileOptions {
	path: string;
	text: string;
	openParentDir?: string | null;
}

function showLinkRewriteToast(result: LinkRewriteResult) {
	if (result.changed_files.length === 0) return;
	const linkLabel = result.changed_links === 1 ? "link" : "links";
	const fileLabel = result.changed_files.length === 1 ? "file" : "files";
	toast.success(
		`Updated ${result.changed_links.toLocaleString()} ${linkLabel}`,
		{
			description: `Repaired references in ${result.changed_files.length.toLocaleString()} ${fileLabel}.`,
		},
	);
}

export function useFileTreeCRUD(deps: UseFileTreeCRUDDeps) {
	const {
		spacePath,
		updateChildrenByDir,
		updateExpandedDirs,
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
	} = deps;
	const activeFilePathRef = useRef(activeFilePath);
	const activePreviewPathRef = useRef(activePreviewPath);
	activeFilePathRef.current = activeFilePath;
	activePreviewPathRef.current = activePreviewPath;

	const refreshAfterCreate = useCallback(
		async (targetDir: string) => {
			await loadDir(targetDir, true);
			const parent = parentDir(targetDir);
			if (parent !== targetDir) await loadDir(parent, true);
		},
		[loadDir],
	);

	const runPinnedSync = useCallback(
		async (context: string, operation: () => Promise<void>) => {
			try {
				await operation();
			} catch (error) {
				console.error(`Failed to sync pinned files ${context}`, error);
			}
		},
		[],
	);

	const ensureDirChainLoaded = useCallback(
		async (dirPath: string) => {
			const normalizedDirPath = normalizeRelPath(dirPath);
			const loadChain: string[] = [];
			let current = normalizedDirPath;
			while (true) {
				loadChain.unshift(current);
				if (!current) break;
				current = parentDir(current);
			}
			updateExpandedDirs((prev) => {
				const next = new Set(prev);
				let changed = false;
				for (const dir of loadChain) {
					if (!dir || next.has(dir)) continue;
					next.add(dir);
					changed = true;
				}
				return changed ? next : prev;
			});
			await Promise.all(loadChain.map((dir) => loadDir(dir, true)));
		},
		[loadDir, updateExpandedDirs],
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

	const createMarkdownFileAtPath = useCallback(
		async ({ path, text, openParentDir }: CreateMarkdownFileOptions) => {
			setError("");
			try {
				const markdownRel = isMarkdownPath(path) ? path : `${path}.md`;
				const fileName = markdownRel.split("/").pop()?.trim() || "Untitled.md";
				try {
					await invoke("space_read_text", { path: markdownRel });
					throw new Error(`File already exists: ${markdownRel}`);
				} catch (error) {
					if (!isMissingFileError(error)) {
						throw error;
					}
				}
				await invoke("space_write_text", {
					path: markdownRel,
					text,
					base_mtime_ms: null,
				});
				insertEntryOptimistic(parentDir(markdownRel), {
					name: fileName,
					rel_path: markdownRel,
					kind: "file",
					is_markdown: true,
				});
				optimisticallyAddAllDocsNote({ path: markdownRel, text });
				const nextOpenParentDir =
					typeof openParentDir === "string"
						? openParentDir
						: parentDir(markdownRel);
				if (nextOpenParentDir) {
					updateExpandedDirs((prev) => {
						if (prev.has(nextOpenParentDir)) return prev;
						const next = new Set(prev);
						next.add(nextOpenParentDir);
						return next;
					});
				}
				await refreshAfterCreate(parentDir(markdownRel));
				void updateOnboardingSettings({ createdFirstNote: true });
				return markdownRel;
			} catch (e) {
				setError(extractErrorMessage(e));
				return null;
			}
		},
		[insertEntryOptimistic, refreshAfterCreate, setError, updateExpandedDirs],
	);

	const onNewFileInDir = useCallback(
		async (dirPath: string) => {
			if (!spacePath) return null;
			setError("");
			try {
				const siblings = await invoke(
					"space_list_dir",
					dirPath ? { dir: dirPath } : {},
				);
				const siblingNames = new Set(
					siblings.map((entry) => entry.name.toLowerCase()),
				);
				let fileName = "Untitled.md";
				if (siblingNames.has(fileName.toLowerCase())) {
					let suffix = 2;
					while (siblingNames.has(`untitled ${suffix}.md`)) {
						suffix += 1;
					}
					fileName = `Untitled ${suffix}.md`;
				}
				const markdownRel = dirPath ? `${dirPath}/${fileName}` : fileName;
				const createdPath = await createMarkdownFileAtPath({
					path: markdownRel,
					text: "",
					openParentDir: dirPath,
				});
				if (createdPath) {
					dispatchFileTreeStartRename({ path: createdPath });
				}
				return createdPath;
			} catch (e) {
				setError(extractErrorMessage(e));
				return null;
			}
		},
		[createMarkdownFileAtPath, setError, spacePath],
	);

	const onNewFile = useCallback(async () => {
		return onNewFileInDir("");
	}, [onNewFileInDir]);

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
				return path;
			} catch (e) {
				setError(extractErrorMessage(e));
			}
			return null;
		},
		[
			insertEntryOptimistic,
			refreshAfterCreate,
			setError,
			updateExpandedDirs,
			spacePath,
		],
	);

	const onDuplicateFile = useCallback(
		async (path: string) => {
			const target = normalizeRelPath(path);
			if (!target) return null;
			setError("");
			try {
				const duplicated = await invoke("space_duplicate_path", {
					path: target,
				});
				const duplicatedPath = normalizeRelPath(duplicated.rel_path);
				if (!duplicatedPath) return null;
				insertEntryOptimistic(parentDir(duplicatedPath), duplicated);
				if (duplicated.is_markdown) {
					optimisticallyAddAllDocsNote({
						path: duplicatedPath,
						sourcePath: target,
					});
				}
				await ensureDirChainLoaded(parentDir(duplicatedPath));
				return duplicatedPath;
			} catch (error) {
				setError(extractErrorMessage(error));
				return null;
			}
		},
		[ensureDirChainLoaded, insertEntryOptimistic, setError],
	);

	const onRenameDir = useCallback(
		async (dirPath: string, nextName: string, kind: "dir" | "file") => {
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
				const rewriteResult = await invoke("space_rename_path", {
					from_path: dirPath,
					to_path: nextPath,
				});
				showLinkRewriteToast(rewriteResult);
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
				if (activeFilePathRef.current === dirPath) setActiveFilePath(nextPath);
				if (activePreviewPathRef.current === dirPath)
					setActivePreviewPath(nextPath);
				dispatchPathRenamed({
					fromPath: dirPath,
					toPath: nextPath,
					recursive: kind === "dir",
				});
				optimisticallyRenameAllDocsPath(dirPath, nextPath, kind === "dir");
				invalidateAllDocsPrefetch();
				await refreshAfterCreate(parent);
				if (kind === "dir") await loadDir(nextPath, true);
				await runPinnedSync("rename", () =>
					renamePinnedPath(dirPath, nextPath),
				);
				try {
					await renameItemAppearance(dirPath, nextPath);
				} catch (error) {
					console.error("Failed to sync file tree appearance rename", error);
				}
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
			runPinnedSync,
			updateChildrenByDir,
			renamePinnedPath,
			renameItemAppearance,
			setActiveFilePath,
			setActivePreviewPath,
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
				optimisticallyRemoveAllDocsPath(target, kind === "dir");
				invalidateAllDocsPrefetch();
				await runPinnedSync("delete", () => deletePinnedPath(target));
				try {
					await deleteItemAppearance(target);
				} catch (error) {
					console.error("Failed to sync file tree appearance delete", error);
				}
				await loadDir(parent, true);
				return true;
			} catch (e) {
				setError(extractErrorMessage(e));
				return false;
			}
		},
		[
			loadDir,
			loadedDirsRef,
			runPinnedSync,
			setActiveFilePath,
			setActivePreviewPath,
			updateChildrenByDir,
			deletePinnedPath,
			deleteItemAppearance,
			setError,
			updateExpandedDirs,
			updateRootEntries,
		],
	);

	const onMovePath = useCallback(
		async (
			fromPath: string,
			toDirPath: string,
			kind: "dir" | "file" = "file",
		) => {
			const from = normalizeRelPath(fromPath);
			const toDir = normalizeRelPath(toDirPath);
			if (!from) return null;
			const fileName = from.split("/").pop() ?? "";
			if (!fileName) return null;
			const nextPath = toDir ? `${toDir}/${fileName}` : fileName;
			if (nextPath === from) return nextPath;
			if (toDir === parentDir(from)) return from;
			if (kind === "dir" && (toDir === from || toDir.startsWith(`${from}/`))) {
				setError("Cannot move a folder into itself");
				return null;
			}
			setError("");
			try {
				const rewriteResult = await invoke("space_rename_path", {
					from_path: from,
					to_path: nextPath,
				});
				showLinkRewriteToast(rewriteResult);
				const fromParent = parentDir(from);
				const toParent = parentDir(nextPath);
				const nextName = nextPath.split("/").pop() ?? fileName;
				const movedEntry: FsEntry = {
					name: nextName,
					rel_path: nextPath,
					kind,
					is_markdown: kind === "file" && isMarkdownPath(nextPath),
				};
				updateExpandedDirs((prev) => {
					if (kind !== "dir") return prev;
					const next = new Set<string>();
					for (const expanded of prev)
						next.add(rewritePrefix(expanded, from, nextPath));
					if (toDir) next.add(toDir);
					return next;
				});
				if (kind === "dir") {
					updateChildrenByDir((prev) => {
						const next: Record<string, FsEntry[] | undefined> = {};
						for (const [k, v] of Object.entries(prev)) {
							const key = rewritePrefix(k, from, nextPath);
							const entries = v
								?.map((e) => ({
									...e,
									name: e.rel_path === from ? nextName : e.name,
									rel_path: rewritePrefix(e.rel_path, from, nextPath),
								}))
								.filter((e) => !(k === fromParent && e.rel_path === nextPath));
							next[key] = entries;
						}
						if (toParent && next[toParent]) {
							next[toParent] = withInsertedEntry(next[toParent], movedEntry);
						}
						return next;
					});
					loadedDirsRef.current = new Set(
						[...loadedDirsRef.current].map((dir) =>
							rewritePrefix(dir, from, nextPath),
						),
					);
				} else {
					updateChildrenByDir((prev) => {
						const next: Record<string, FsEntry[] | undefined> = {};
						for (const [k, v] of Object.entries(prev)) {
							next[k] = v?.filter((e) => e.rel_path !== from);
						}
						if (toParent && next[toParent]) {
							next[toParent] = withInsertedEntry(next[toParent], movedEntry);
						}
						return next;
					});
				}
				updateRootEntries((prev) => {
					const withoutMoved = prev.filter((e) => e.rel_path !== from);
					if (toParent) return withoutMoved;
					return withInsertedEntry(withoutMoved, movedEntry);
				});
				const activeFile = activeFilePathRef.current;
				if (
					activeFile &&
					(activeFile === from ||
						(kind === "dir" && activeFile.startsWith(`${from}/`)))
				) {
					setActiveFilePath(rewritePrefix(activeFile, from, nextPath));
				}
				const activePreview = activePreviewPathRef.current;
				if (
					activePreview &&
					(activePreview === from ||
						(kind === "dir" && activePreview.startsWith(`${from}/`)))
				) {
					setActivePreviewPath(rewritePrefix(activePreview, from, nextPath));
				}
				dispatchPathRenamed({
					fromPath: from,
					toPath: nextPath,
					recursive: kind === "dir",
				});
				optimisticallyRenameAllDocsPath(from, nextPath, kind === "dir");
				invalidateAllDocsPrefetch();
				await runPinnedSync("move", () => renamePinnedPath(from, nextPath));
				try {
					await renameItemAppearance(from, nextPath);
				} catch (error) {
					console.error("Failed to sync file tree appearance move", error);
				}
				await Promise.all([
					loadDir(fromParent, true),
					loadDir(toParent, true),
					kind === "dir" ? loadDir(nextPath, true) : Promise.resolve(),
				]);
				return nextPath;
			} catch (e) {
				setError(extractErrorMessage(e));
				return null;
			}
		},
		[
			loadDir,
			loadedDirsRef,
			renamePinnedPath,
			renameItemAppearance,
			runPinnedSync,
			setActiveFilePath,
			setActivePreviewPath,
			updateExpandedDirs,
			updateChildrenByDir,
			setError,
			updateRootEntries,
		],
	);

	return {
		createMarkdownFileAtPath,
		onNewFile,
		onNewFileInDir,
		onNewFolderInDir,
		onDuplicateFile,
		onRenameDir,
		onDeletePath,
		onMovePath,
	};
}
