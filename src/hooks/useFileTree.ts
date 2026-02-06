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
	setRootEntries: React.Dispatch<React.SetStateAction<FsEntry[]>>;
	setActiveFilePath: (path: string | null) => void;
	setCanvasCommand: (
		cmd: { id: string; kind: string; noteId?: string; title?: string } | null,
	) => void;
	setError: (error: string) => void;
	loadAndBuildFolderView: (dir: string) => Promise<void>;
	getActiveFolderDir: () => string | null;
}

function compareEntries(a: FsEntry, b: FsEntry): number {
	if (a.kind === "dir" && b.kind === "file") return -1;
	if (a.kind === "file" && b.kind === "dir") return 1;
	return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

function normalizeRelPath(relPath: string): string {
	const normalized = relPath.replace(/\\/g, "/").trim();
	return normalized.replace(/^\/+/, "").replace(/\/+$/, "");
}

function entryNameFromRelPath(relPath: string): string {
	const parts = relPath.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? "";
}

function fileTitleFromRelPath(relPath: string): string {
	const name = entryNameFromRelPath(relPath);
	if (!name) return "Untitled";
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

function normalizeEntry(entry: FsEntry): FsEntry | null {
	const relPath = normalizeRelPath(entry.rel_path);
	if (!relPath) return null;
	const relName = entryNameFromRelPath(relPath);
	const name =
		entry.name.replace(/\u200b/g, "").trim() ||
		relName ||
		(entry.kind === "dir" ? "New Folder" : "Untitled.md");
	return {
		...entry,
		name,
		rel_path: relPath,
	};
}

function normalizeEntries(entries: FsEntry[]): FsEntry[] {
	const byPath = new Map<string, FsEntry>();
	for (const entry of entries) {
		const normalized = normalizeEntry(entry);
		if (!normalized) continue;
		byPath.set(normalized.rel_path, normalized);
	}
	return [...byPath.values()].sort(compareEntries);
}

function withInsertedEntry(entries: FsEntry[], entry: FsEntry): FsEntry[] {
	if (entries.some((e) => e.rel_path === entry.rel_path)) return entries;
	return [...entries, entry].sort(compareEntries);
}

function rewritePrefix(path: string, from: string, to: string): string {
	if (path === from) return to;
	if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`;
	return path;
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
		getActiveFolderDir,
	} = deps;

	const dirSummariesInFlightRef = useRef(new Set<string>());
	const loadedDirsRef = useRef(new Set<string>());
	const loadRequestVersionRef = useRef(new Map<string, number>());
	const issueOpenNoteCommand = useCallback(
		(relPath: string) => {
			setCanvasCommand({
				id: crypto.randomUUID(),
				kind: "open_note_editor",
				noteId: relPath,
				title: fileTitleFromRelPath(relPath),
			});
		},
		[setCanvasCommand],
	);

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
				setChildrenByDir((prev) => ({ ...prev, [dirPath]: normalizedEntries }));
			} else {
				setRootEntries(normalizedEntries);
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
					if (loadRequestVersionRef.current.get(dirPath) !== nextVersion)
						return;
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

	const refreshActiveFolderViewAfterCreate = useCallback(
		async (createdInDir: string) => {
			const activeDir = getActiveFolderDir();
			if (activeDir === null) return;
			if (activeDir !== createdInDir) return;
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
				setError(e instanceof Error ? e.message : String(e));
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
				setError(e instanceof Error ? e.message : String(e));
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
		async (dirPath: string, nextName: string) => {
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
					fromPath: dirPath,
					toPath: nextPath,
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
				await refreshAfterCreate(parent);
				await loadDir(nextPath, true);
				return nextPath;
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
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
		openMarkdownFileInCanvas,
		openNonMarkdownExternally,
		onNewFile,
		onNewFileInDir,
		onNewFolderInDir,
		onRenameDir,
	};
}
