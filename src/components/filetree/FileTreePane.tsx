import {
	DragDropProvider,
	type DragEndEvent,
	useDroppable,
} from "@dnd-kit/react";
import { PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m } from "motion/react";
import {
	type KeyboardEvent,
	type MutableRefObject,
	type ReactNode,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { useFileTreeContext, useSpace } from "../../contexts";
import { useTaskProgressIndicatorSetting } from "../../hooks/useTaskProgressIndicatorSetting";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { extractErrorMessage } from "../../lib/errorUtils";
import { splitYamlFrontmatter } from "../../lib/notePreview";
import { loadSettings } from "../../lib/settings";
import type {
	DirChildSummary,
	FileTreeAppearance,
	FsEntry,
	NoteTaskSummary,
} from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { isDeleteKey } from "../../utils/keyboard";
import {
	isMarkdownPath,
	normalizeRelPath,
	parentDir,
	basename as relBasename,
} from "../../utils/path";
import { ChevronRight } from "../Icons";
import { TaskProgressIndicator } from "../tasks/TaskProgressIndicator";
import { springPresets } from "../ui/animations";
import { FileTreeDirItem } from "./FileTreeDirItem";
import { FileTreeFileItem } from "./FileTreeFileItem";
import { FILE_TREE_ENTRY_TYPE } from "./fileTreeDnd";
import { rowVariants } from "./fileTreeItemHelpers";

interface FileTreePaneProps {
	rootEntries: FsEntry[];
	childrenByDir: Record<string, FsEntry[] | undefined>;
	expandedDirs: Set<string>;
	activeFilePath: string | null;
	activeDirPath: string | null;
	onToggleDir: (dirPath: string) => void;
	onLoadDir?: (dirPath: string, force?: boolean) => Promise<void>;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (filePath: string) => void;
	onPrefetchFile?: (filePath: string) => void;
	onNewFileInDir: (dirPath: string) => void;
	onCreateFromTemplateInDir: (dirPath: string) => void;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onDuplicateFile: (path: string) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	renamingPath: string | null;
	onStartRename: (path: string) => void;
	onCancelRename: () => void;
	onCommitFileRename: (path: string, nextName: string) => Promise<void>;
	onCommitDirRename: (dirPath: string, nextName: string) => Promise<void>;
	onMovePath: (
		fromPath: string,
		toDirPath: string,
		kind?: "dir" | "file",
	) => Promise<string | null>;
	pinnedFiles: string[];
	onTogglePinnedFile: (path: string) => Promise<void>;
	children?: ReactNode;
}

const springTransition = springPresets.bouncy;
const MARKDOWN_PREVIEW_MAX_BYTES = 4096;
const MARKDOWN_PREVIEW_LINE_LIMIT = 1;

function spaceLabelFromPath(path: string | null): string {
	if (!path) return "Glyph";
	const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

function folderBreadcrumbParts(spacePath: string | null, dirPath: string) {
	const parts = [
		{ label: spaceLabelFromPath(spacePath), path: "" },
		...dirPath
			.split("/")
			.filter(Boolean)
			.map((label, index, segments) => ({
				label,
				path: segments.slice(0, index + 1).join("/"),
			})),
	];
	return parts;
}

function plainMarkdownLine(line: string): string {
	return line
		.replace(/^#{1,6}\s+/, "")
		.replace(/^>\s?/, "")
		.replace(/^[-*+]\s+\[[ xX]\]\s+/, "")
		.replace(/^[-*+]\s+/, "")
		.replace(/^\d+\.\s+/, "")
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/[*_`~]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

function markdownPreviewSnippet(markdown: string): string {
	const { body } = splitYamlFrontmatter(markdown);
	const lines: string[] = [];
	let inFence = false;

	for (const rawLine of body.replace(/\r\n?/g, "\n").split("\n")) {
		const trimmed = rawLine.trim();
		if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
			inFence = !inFence;
			continue;
		}
		if (inFence || !trimmed) continue;
		const line = plainMarkdownLine(trimmed);
		if (!line) continue;
		lines.push(line);
		if (lines.length >= MARKDOWN_PREVIEW_LINE_LIMIT) break;
	}

	return lines.join(" ");
}

interface FileTreeRootDropProps {
	children: ReactNode;
	targetDirPath?: string;
}

function FileTreeRootDrop({
	children,
	targetDirPath = "",
}: FileTreeRootDropProps) {
	const { ref, isDropTarget } = useDroppable({
		id: targetDirPath ? `file-tree-focused:${targetDirPath}` : "file-tree-root",
		data: { targetDirPath },
		accept: FILE_TREE_ENTRY_TYPE,
	});

	return (
		<div
			ref={ref}
			className="fileTreeScroll"
			data-drop-target={isDropTarget ? "true" : undefined}
		>
			{children}
		</div>
	);
}

function isEditableTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}

interface FolderBreadcrumbProps {
	spacePath: string | null;
	dirPath: string;
	onNavigate: (dirPath: string) => void;
	onExit: () => void;
}

function FolderBreadcrumb({
	spacePath,
	dirPath,
	onNavigate,
	onExit,
}: FolderBreadcrumbProps) {
	const parts = folderBreadcrumbParts(spacePath, dirPath);
	const navRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		const nav = navRef.current;
		if (!nav) return;
		if (nav.dataset.dirPath !== dirPath) return;
		nav.scrollLeft = nav.scrollWidth;
	}, [dirPath]);

	return (
		<nav
			ref={navRef}
			data-dir-path={dirPath}
			className="fileTreeBreadcrumb"
			aria-label="Folder breadcrumb"
		>
			{parts.map((part, index) => {
				const isLast = index === parts.length - 1;
				const handleClick = () => {
					if (isLast) return;
					if (!part.path) {
						onExit();
						return;
					}
					onNavigate(part.path);
				};

				return (
					<span
						key={part.path || "__root__"}
						className="fileTreeBreadcrumbPart"
					>
						<button
							type="button"
							className="fileTreeBreadcrumbButton"
							aria-current={isLast ? "page" : undefined}
							disabled={isLast}
							onClick={handleClick}
						>
							{part.label}
						</button>
						{!isLast ? (
							<ChevronRight
								size={11}
								className="fileTreeBreadcrumbSeparator"
								aria-hidden="true"
							/>
						) : null}
					</span>
				);
			})}
		</nav>
	);
}

interface TreeEntriesProps {
	entries: FsEntry[];
	parentDepth: number;
	childrenByDir: Record<string, FsEntry[] | undefined>;
	expandedDirs: Set<string>;
	activeFilePath: string | null;
	activeDirPath: string | null;
	renamingPath: string | null;
	onToggleDir: (dirPath: string) => void;
	onEnterDir?: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (filePath: string) => void;
	onPrefetchFile?: (filePath: string) => void;
	onNewFileInDir: (dirPath: string) => void;
	onCreateFromTemplateInDir: (dirPath: string) => void;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onDuplicateFile: (path: string) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<void>;
	onStartRename: (path: string) => void;
	onCommitDirRename: (dirPath: string, nextName: string) => Promise<void>;
	onCommitFileRename: (path: string, nextName: string) => Promise<void>;
	onCancelRename: () => void;
	itemAppearance: Record<string, FileTreeAppearance>;
	folderFileCounts: Record<string, number>;
	showFolderFileCounts: boolean;
	onChangeAppearance: (
		entry: FsEntry,
		appearance: FileTreeAppearance,
	) => Promise<void> | void;
	pinnedFiles: string[];
	onTogglePinnedFile: (path: string) => Promise<void>;
	onMoveClickSuppressRef: MutableRefObject<boolean>;
	onArrowNavigate: (
		path: string,
		direction: -1 | 1,
		currentTarget: HTMLElement,
	) => void;
	showTaskProgressIndicator: boolean;
	taskSummariesByPath: Record<string, NoteTaskSummary>;
	showFilePreviews?: boolean;
	filePreviewsByPath?: Record<string, string | null | undefined>;
}

function TreeEntries({
	entries,
	parentDepth,
	childrenByDir,
	expandedDirs,
	activeFilePath,
	activeDirPath,
	renamingPath,
	onToggleDir,
	onEnterDir,
	onSelectDir,
	onOpenFile,
	onPrefetchFile,
	onNewFileInDir,
	onCreateFromTemplateInDir,
	onNewFolderInDir,
	onDuplicateFile,
	onDeletePath,
	onStartRename,
	onCommitDirRename,
	onCommitFileRename,
	onCancelRename,
	itemAppearance,
	folderFileCounts,
	showFolderFileCounts,
	onChangeAppearance,
	pinnedFiles,
	onTogglePinnedFile,
	onMoveClickSuppressRef,
	onArrowNavigate,
	showTaskProgressIndicator,
	taskSummariesByPath,
	showFilePreviews = false,
	filePreviewsByPath = {},
}: TreeEntriesProps) {
	if (entries.length === 0) return null;

	return (
		<ul className="fileTreeList">
			{entries.map((e) => {
				const isDir = e.kind === "dir";
				const depth = parentDepth + 1;
				const rowKey =
					e.rel_path.trim() || `${e.kind}:${e.name.trim()}:${depth}`;

				if (isDir) {
					const isExpanded = expandedDirs.has(e.rel_path);
					const children = childrenByDir[e.rel_path];

					return (
						<FileTreeDirItem
							key={rowKey}
							entry={e}
							depth={depth}
							isExpanded={isExpanded}
							isActive={!activeFilePath && e.rel_path === activeDirPath}
							isRenaming={renamingPath === e.rel_path}
							onToggleDir={onToggleDir}
							onEnterDir={onEnterDir}
							onSelectDir={onSelectDir}
							onNewFileInDir={onNewFileInDir}
							onCreateFromTemplateInDir={onCreateFromTemplateInDir}
							onNewFolderInDir={onNewFolderInDir}
							onDeletePath={onDeletePath}
							appearance={itemAppearance[e.rel_path] ?? null}
							fileCount={
								showFolderFileCounts
									? (folderFileCounts[e.rel_path] ?? null)
									: null
							}
							onChangeAppearance={(appearance) =>
								onChangeAppearance(e, appearance)
							}
							onStartRename={() => onStartRename(e.rel_path)}
							onCommitRename={onCommitDirRename}
							onCancelRename={onCancelRename}
							onMoveClickSuppressRef={onMoveClickSuppressRef}
						>
							{children && (
								<TreeEntries
									entries={children}
									parentDepth={depth}
									childrenByDir={childrenByDir}
									expandedDirs={expandedDirs}
									activeFilePath={activeFilePath}
									activeDirPath={activeDirPath}
									renamingPath={renamingPath}
									onToggleDir={onToggleDir}
									onEnterDir={onEnterDir}
									onSelectDir={onSelectDir}
									onOpenFile={onOpenFile}
									onPrefetchFile={onPrefetchFile}
									onNewFileInDir={onNewFileInDir}
									onCreateFromTemplateInDir={onCreateFromTemplateInDir}
									onNewFolderInDir={onNewFolderInDir}
									onDuplicateFile={onDuplicateFile}
									onDeletePath={onDeletePath}
									onStartRename={onStartRename}
									onCommitDirRename={onCommitDirRename}
									onCommitFileRename={onCommitFileRename}
									onCancelRename={onCancelRename}
									itemAppearance={itemAppearance}
									folderFileCounts={folderFileCounts}
									showFolderFileCounts={showFolderFileCounts}
									onChangeAppearance={onChangeAppearance}
									pinnedFiles={pinnedFiles}
									onTogglePinnedFile={onTogglePinnedFile}
									onMoveClickSuppressRef={onMoveClickSuppressRef}
									onArrowNavigate={onArrowNavigate}
									showTaskProgressIndicator={showTaskProgressIndicator}
									taskSummariesByPath={taskSummariesByPath}
									showFilePreviews={showFilePreviews}
									filePreviewsByPath={filePreviewsByPath}
								/>
							)}
						</FileTreeDirItem>
					);
				}

				return (
					<FileTreeFileItem
						key={rowKey}
						entry={e}
						depth={depth}
						isActive={e.rel_path === activeFilePath}
						onOpenFile={onOpenFile}
						onPrefetchFile={onPrefetchFile}
						onNewFileInDir={onNewFileInDir}
						onCreateFromTemplateInDir={onCreateFromTemplateInDir}
						onNewFolderInDir={onNewFolderInDir}
						onDuplicateFile={onDuplicateFile}
						isRenaming={renamingPath === e.rel_path}
						onStartRename={() => onStartRename(e.rel_path)}
						onCommitRename={onCommitFileRename}
						onCancelRename={onCancelRename}
						parentDirPath={parentDir(e.rel_path)}
						onDeletePath={onDeletePath}
						appearance={itemAppearance[e.rel_path] ?? null}
						onChangeAppearance={(appearance) =>
							onChangeAppearance(e, appearance)
						}
						isPinned={pinnedFiles.includes(e.rel_path)}
						onTogglePinned={onTogglePinnedFile}
						onMoveClickSuppressRef={onMoveClickSuppressRef}
						onArrowNavigate={onArrowNavigate}
						taskSummary={
							showTaskProgressIndicator
								? (taskSummariesByPath[e.rel_path] ?? null)
								: null
						}
						previewText={
							showFilePreviews && e.is_markdown
								? (filePreviewsByPath[e.rel_path] ?? null)
								: null
						}
					/>
				);
			})}
		</ul>
	);
}

export const FileTreePane = memo(function FileTreePane({
	rootEntries,
	childrenByDir,
	expandedDirs,
	activeFilePath,
	activeDirPath,
	onToggleDir,
	onLoadDir,
	onSelectDir,
	onOpenFile,
	onPrefetchFile,
	onNewFileInDir,
	onCreateFromTemplateInDir,
	onNewFolderInDir,
	onDuplicateFile,
	onDeletePath,
	renamingPath,
	onStartRename,
	onCancelRename,
	onCommitFileRename,
	onCommitDirRename,
	onMovePath,
	pinnedFiles,
	onTogglePinnedFile,
	children,
}: FileTreePaneProps) {
	const { itemAppearance, setItemAppearance } = useFileTreeContext();
	const { spacePath, setError } = useSpace();
	const [showFolderFileCounts, setShowFolderFileCounts] = useState(false);
	const showTaskProgressIndicator = useTaskProgressIndicatorSetting();
	const [folderFileCounts, setFolderFileCounts] = useState<
		Record<string, number>
	>({});
	const [taskSummaryRefreshKey, setTaskSummaryRefreshKey] = useState(0);
	const [focusedDirPath, setFocusedDirPath] = useState<string | null>(null);
	const [filePreviewsByPath, setFilePreviewsByPath] = useState<
		Record<string, string | null | undefined>
	>({});
	const [filePreviewRefreshKey, setFilePreviewRefreshKey] = useState(0);
	const filePreviewRequestRef = useRef("");
	const moveClickSuppressRef = useRef(false);
	const previousSpacePathRef = useRef(spacePath);

	useEffect(() => {
		if (previousSpacePathRef.current === spacePath) return;
		previousSpacePathRef.current = spacePath;
		setFocusedDirPath(null);
		setFilePreviewsByPath({});
	}, [spacePath]);

	useEffect(() => {
		let cancelled = false;
		void loadSettings().then((settings) => {
			if (!cancelled) {
				setShowFolderFileCounts(settings.ui.showFileTreeFolderCounts);
			}
		});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.ui?.showFileTreeFolderCounts === "boolean") {
			setShowFolderFileCounts(payload.ui.showFileTreeFolderCounts);
		}
	});

	const summaryParentDirs = useMemo(() => {
		const parents = new Set<string>([""]);
		for (const dirPath of expandedDirs) {
			parents.add(dirPath);
		}
		if (focusedDirPath) {
			parents.add(focusedDirPath);
		}
		return [...parents].sort();
	}, [expandedDirs, focusedDirPath]);

	const folderCountTreeRevision = useMemo(() => {
		const serializeEntries = (entries: FsEntry[] | undefined) =>
			(entries ?? [])
				.map((entry) => `${entry.kind}:${entry.rel_path}`)
				.join("|");

		return summaryParentDirs
			.map((dirPath) =>
				dirPath
					? `${dirPath}=>${serializeEntries(childrenByDir[dirPath])}`
					: `root=>${serializeEntries(rootEntries)}`,
			)
			.join("||");
	}, [childrenByDir, rootEntries, summaryParentDirs]);

	useEffect(() => {
		if (!spacePath || !showFolderFileCounts) {
			setFolderFileCounts({});
			return;
		}

		const requestRevision = folderCountTreeRevision;
		if (!requestRevision) {
			setFolderFileCounts({});
			return;
		}

		let cancelled = false;
		const summaryRequests: Array<Promise<DirChildSummary[]>> =
			summaryParentDirs.map((dirPath) =>
				invoke("space_dir_children_summary", dirPath ? { dir: dirPath } : {}),
			);

		void Promise.allSettled(summaryRequests).then((results) => {
			if (cancelled) return;
			const nextCounts: Record<string, number> = {};
			let hasSuccessfulResult = false;

			for (const result of results) {
				if (result.status !== "fulfilled") {
					console.warn(
						"Failed to load folder file counts for part of the tree",
						result.reason,
					);
					continue;
				}
				hasSuccessfulResult = true;
				for (const summary of result.value) {
					nextCounts[summary.dir_rel_path] = summary.total_files_recursive;
				}
			}

			if (!hasSuccessfulResult) return;
			setFolderFileCounts((prev) => ({
				...prev,
				...nextCounts,
			}));
		});

		return () => {
			cancelled = true;
		};
	}, [
		spacePath,
		showFolderFileCounts,
		summaryParentDirs,
		folderCountTreeRevision,
	]);

	const taskSummaryPaths = useMemo(() => {
		const paths = new Set<string>();
		const collectEntries = (entries: FsEntry[] | undefined) => {
			for (const entry of entries ?? []) {
				if (entry.kind === "file" && entry.is_markdown) {
					paths.add(entry.rel_path);
				}
			}
		};

		collectEntries(rootEntries);
		for (const dirPath of expandedDirs) {
			collectEntries(childrenByDir[dirPath]);
		}
		if (focusedDirPath) {
			collectEntries(childrenByDir[focusedDirPath]);
		}
		for (const pinnedPath of pinnedFiles) {
			if (isMarkdownPath(pinnedPath)) {
				paths.add(pinnedPath);
			}
		}

		return [...paths].sort();
	}, [childrenByDir, expandedDirs, focusedDirPath, pinnedFiles, rootEntries]);
	const taskSummariesByPath = useTaskSummariesForPaths(
		taskSummaryPaths,
		Boolean(spacePath) && showTaskProgressIndicator,
		taskSummaryRefreshKey,
	);

	useTauriEvent("notes:external_changed", (payload) => {
		const relPath = normalizeRelPath(payload.rel_path);
		if (!relPath || !isMarkdownPath(relPath)) return;
		if (!taskSummaryPaths.includes(relPath)) return;
		if (filePreviewPaths.includes(relPath)) {
			setFilePreviewsByPath((current) => {
				const next = { ...current };
				delete next[relPath];
				return next;
			});
			if (!payload.removed) {
				setFilePreviewRefreshKey((key) => key + 1);
			}
		}
		if (payload.removed) {
			setTaskSummaryRefreshKey((key) => key + 1);
			return;
		}
		setTaskSummaryRefreshKey((key) => key + 1);
	});

	const handleCreateFolder = useCallback(
		async (dirPath: string) => {
			const created = await onNewFolderInDir(dirPath);
			if (created) {
				onStartRename(created);
			}
			return created;
		},
		[onNewFolderInDir, onStartRename],
	);

	const handleDeletePath = useCallback(
		async (path: string, kind: "dir" | "file") => {
			const { confirm } = await import("@tauri-apps/plugin-dialog");
			const noun = kind === "dir" ? "folder" : "file";
			const confirmed = await confirm(`Delete this ${noun}?`, {
				title: "Confirm delete",
				okLabel: "Delete",
				cancelLabel: "Cancel",
			});
			if (!confirmed) return;
			await onDeletePath(path, kind);
		},
		[onDeletePath],
	);

	const handleTreeKeyDown = useCallback(
		(event: KeyboardEvent<HTMLElement>) => {
			if (!isDeleteKey(event) || isEditableTarget(event.target)) return;
			if (!(event.target instanceof HTMLElement)) return;
			const row = event.target.closest<HTMLElement>(
				"[data-file-tree-path][data-file-tree-kind]",
			);
			if (!row || !event.currentTarget.contains(row)) return;
			const path = row.dataset.fileTreePath;
			const kind = row.dataset.fileTreeKind;
			if (!path || (kind !== "dir" && kind !== "file")) return;
			event.preventDefault();
			event.stopPropagation();
			void handleDeletePath(path, kind);
		},
		[handleDeletePath],
	);

	const handleDuplicateFile = useCallback(
		async (path: string) => {
			const duplicatedPath = await onDuplicateFile(path);
			if (duplicatedPath) {
				onStartRename(duplicatedPath);
			}
			return duplicatedPath;
		},
		[onDuplicateFile, onStartRename],
	);

	const handleChangeAppearance = useCallback(
		async (entry: FsEntry, appearance: FileTreeAppearance) => {
			try {
				await setItemAppearance(entry.rel_path, appearance);
			} catch (error) {
				const message = extractErrorMessage(error);
				setError(message);
				toast.error("Could not update file tree appearance", {
					description: message,
				});
			}
		},
		[setError, setItemAppearance],
	);

	const handleEnterDir = useCallback(
		(dirPath: string) => {
			setFocusedDirPath(dirPath);
			onSelectDir(dirPath);
			if (!onLoadDir && !childrenByDir[dirPath] && !expandedDirs.has(dirPath)) {
				onToggleDir(dirPath);
			}
		},
		[childrenByDir, expandedDirs, onLoadDir, onSelectDir, onToggleDir],
	);

	const handleExitFocusedDir = useCallback(() => {
		setFocusedDirPath(null);
		onSelectDir("");
	}, [onSelectDir]);

	const focusedEntries = focusedDirPath
		? (childrenByDir[focusedDirPath] ?? null)
		: null;
	const focusedEntriesLoading = Boolean(focusedDirPath && !focusedEntries);

	useEffect(() => {
		if (!focusedDirPath || focusedEntries || !onLoadDir) return;
		void onLoadDir(focusedDirPath);
	}, [focusedDirPath, focusedEntries, onLoadDir]);

	const filePreviewPaths = useMemo(() => {
		if (!focusedEntries) return [];
		return focusedEntries
			.filter((entry) => entry.kind === "file" && entry.is_markdown)
			.map((entry) => entry.rel_path)
			.sort();
	}, [focusedEntries]);
	const filePreviewRequestKey = useMemo(
		() => `${filePreviewRefreshKey}:${filePreviewPaths.join("\0")}`,
		[filePreviewPaths, filePreviewRefreshKey],
	);

	useEffect(() => {
		filePreviewRequestRef.current = filePreviewRequestKey;
		if (!spacePath || !focusedDirPath || filePreviewPaths.length === 0) {
			return;
		}

		const missingPaths = filePreviewPaths.filter(
			(path) =>
				filePreviewsByPath[path] === undefined ||
				filePreviewsByPath[path] === "",
		);
		if (missingPaths.length === 0) return;

		let cancelled = false;
		void Promise.allSettled(
			missingPaths.map(async (path) => {
				const preview = await invoke("space_read_text_preview", {
					path,
					max_bytes: MARKDOWN_PREVIEW_MAX_BYTES,
				});
				return {
					path,
					snippet: markdownPreviewSnippet(preview.text),
				};
			}),
		).then((results) => {
			if (
				cancelled ||
				filePreviewRequestRef.current !== filePreviewRequestKey
			) {
				return;
			}
			setFilePreviewsByPath((prev) => {
				let changed = false;
				const next = { ...prev };
				for (const [index, result] of results.entries()) {
					if (result.status === "fulfilled") {
						const snippet = result.value.snippet || null;
						if (next[result.value.path] !== snippet) {
							next[result.value.path] = snippet;
							changed = true;
						}
					} else {
						const path = missingPaths[index];
						if (path && path in next) {
							delete next[path];
							changed = true;
						}
					}
				}
				return changed ? next : prev;
			});
		});

		return () => {
			cancelled = true;
		};
	}, [
		filePreviewPaths,
		filePreviewRequestKey,
		filePreviewsByPath,
		focusedDirPath,
		spacePath,
	]);

	const pinnedFileItems = useMemo(
		() =>
			pinnedFiles.map((path) => {
				const fileName = relBasename(path);
				const displayName =
					fileName.replace(/\.[^./]+$/, "") || fileName || path;
				return {
					path,
					displayName,
					parent: parentDir(path),
					isMarkdown: isMarkdownPath(path),
				};
			}),
		[pinnedFiles],
	);

	const handleArrowNavigate = useCallback(
		(_path: string, direction: -1 | 1, currentTarget: HTMLElement) => {
			const pane = currentTarget.closest(".fileTreePane");
			if (!pane) return;
			const fileButtons = Array.from(
				pane.querySelectorAll<HTMLElement>("[data-file-tree-file='true']"),
			);
			const currentIndex = fileButtons.findIndex(
				(button) => button === currentTarget,
			);
			if (currentIndex === -1) return;
			const nextButton = fileButtons[currentIndex + direction];
			if (!nextButton) return;
			nextButton.focus();
			nextButton.click();
		},
		[],
	);

	const handleDragEnd = useCallback(
		(event: DragEndEvent) => {
			moveClickSuppressRef.current = true;
			window.setTimeout(() => {
				moveClickSuppressRef.current = false;
			}, 0);
			if (event.canceled) return;

			const { source, target } = event.operation;
			const sourcePath =
				typeof source?.data.path === "string" ? source.data.path : null;
			const sourceKind =
				source?.data.kind === "dir" || source?.data.kind === "file"
					? source.data.kind
					: null;
			const targetDirPath =
				typeof target?.data.targetDirPath === "string"
					? target.data.targetDirPath
					: null;
			if (!sourcePath || !sourceKind || targetDirPath == null) return;

			void onMovePath(sourcePath, targetDirPath, sourceKind);
		},
		[onMovePath],
	);

	return (
		<DragDropProvider onDragEnd={handleDragEnd}>
			<m.aside
				className="fileTreePane"
				initial={{ y: 10 }}
				animate={{ y: 0 }}
				transition={springTransition}
				onKeyDown={handleTreeKeyDown}
			>
				{focusedDirPath ? (
					<FileTreeRootDrop targetDirPath={focusedDirPath}>
						<FolderBreadcrumb
							spacePath={spacePath}
							dirPath={focusedDirPath}
							onNavigate={handleEnterDir}
							onExit={handleExitFocusedDir}
						/>
						{focusedEntriesLoading ? (
							<m.div
								className="fileTreeEmpty"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
							>
								Loading folder...
							</m.div>
						) : focusedEntries?.length ? (
							<TreeEntries
								entries={focusedEntries}
								parentDepth={-1}
								childrenByDir={childrenByDir}
								expandedDirs={expandedDirs}
								activeFilePath={activeFilePath}
								activeDirPath={activeDirPath}
								renamingPath={renamingPath}
								onToggleDir={onToggleDir}
								onEnterDir={handleEnterDir}
								onSelectDir={onSelectDir}
								onOpenFile={onOpenFile}
								onPrefetchFile={onPrefetchFile}
								onNewFileInDir={onNewFileInDir}
								onCreateFromTemplateInDir={onCreateFromTemplateInDir}
								onNewFolderInDir={handleCreateFolder}
								onDuplicateFile={handleDuplicateFile}
								onDeletePath={handleDeletePath}
								onStartRename={onStartRename}
								onCommitDirRename={onCommitDirRename}
								onCommitFileRename={onCommitFileRename}
								onCancelRename={onCancelRename}
								itemAppearance={itemAppearance}
								folderFileCounts={folderFileCounts}
								showFolderFileCounts={showFolderFileCounts}
								onChangeAppearance={handleChangeAppearance}
								pinnedFiles={pinnedFiles}
								onTogglePinnedFile={onTogglePinnedFile}
								onMoveClickSuppressRef={moveClickSuppressRef}
								onArrowNavigate={handleArrowNavigate}
								showTaskProgressIndicator={showTaskProgressIndicator}
								taskSummariesByPath={taskSummariesByPath}
								showFilePreviews
								filePreviewsByPath={filePreviewsByPath}
							/>
						) : (
							<m.div
								className="fileTreeEmpty"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
							>
								No files found.
							</m.div>
						)}
					</FileTreeRootDrop>
				) : rootEntries.length || pinnedFileItems.length ? (
					<FileTreeRootDrop>
						{pinnedFileItems.length > 0 ? (
							<section className="fileTreePinnedSection">
								<ul className="fileTreeList fileTreePinnedList">
									{pinnedFileItems.map((file) => {
										const isActive = file.path === activeFilePath;
										return (
											<li
												key={file.path}
												className={
													isActive ? "fileTreeItem active" : "fileTreeItem"
												}
											>
												<div className="fileTreeRowShell">
													<m.div
														className="fileTreeRow"
														variants={rowVariants}
														whileHover="hover"
														whileTap="tap"
														animate={isActive ? "active" : "idle"}
														transition={springTransition}
													>
														<button
															type="button"
															aria-label={`Unpin ${file.displayName}`}
															title="Unpin"
															onClick={() => onTogglePinnedFile(file.path)}
															className="fileTreePinToggle fileTreeIcon fileTreePinnedLeadingPin"
														>
															<HugeiconsIcon
																icon={PinIcon}
																size={14}
																strokeWidth={0.9}
																className="fileTreePinIcon"
																aria-hidden="true"
															/>
															<HugeiconsIcon
																icon={PinOffIcon}
																size={14}
																strokeWidth={0.9}
																className="fileTreePinOffIcon"
																aria-hidden="true"
															/>
														</button>
														<button
															type="button"
															className="fileTreePinToggle fileTreePinnedRow"
															onClick={() => onOpenFile(file.path)}
															onKeyDown={(event) => {
																if (
																	event.key !== "ArrowDown" &&
																	event.key !== "ArrowUp"
																)
																	return;
																event.preventDefault();
																handleArrowNavigate(
																	file.path,
																	event.key === "ArrowDown" ? 1 : -1,
																	event.currentTarget,
																);
															}}
															title={file.path}
															data-file-tree-file="true"
															data-file-tree-kind="file"
															data-file-tree-path={file.path}
														>
															<span className="fileTreeName">
																{file.displayName}
															</span>
															{showTaskProgressIndicator &&
															(taskSummariesByPath[file.path]?.total_count ??
																0) > 0 ? (
																<TaskProgressIndicator
																	summary={taskSummariesByPath[file.path]}
																	className="fileTreeTaskProgress"
																/>
															) : null}
															{file.parent ? (
																<span className="fileTreePinnedPath">
																	{file.parent}
																</span>
															) : null}
														</button>
													</m.div>
												</div>
											</li>
										);
									})}
								</ul>
							</section>
						) : null}
						{rootEntries.length ? (
							<TreeEntries
								entries={rootEntries}
								parentDepth={-1}
								childrenByDir={childrenByDir}
								expandedDirs={expandedDirs}
								activeFilePath={activeFilePath}
								activeDirPath={activeDirPath}
								renamingPath={renamingPath}
								onToggleDir={onToggleDir}
								onEnterDir={handleEnterDir}
								onSelectDir={onSelectDir}
								onOpenFile={onOpenFile}
								onPrefetchFile={onPrefetchFile}
								onNewFileInDir={onNewFileInDir}
								onCreateFromTemplateInDir={onCreateFromTemplateInDir}
								onNewFolderInDir={handleCreateFolder}
								onDuplicateFile={handleDuplicateFile}
								onDeletePath={handleDeletePath}
								onStartRename={onStartRename}
								onCommitDirRename={onCommitDirRename}
								onCommitFileRename={onCommitFileRename}
								onCancelRename={onCancelRename}
								itemAppearance={itemAppearance}
								folderFileCounts={folderFileCounts}
								showFolderFileCounts={showFolderFileCounts}
								onChangeAppearance={handleChangeAppearance}
								pinnedFiles={pinnedFiles}
								onTogglePinnedFile={onTogglePinnedFile}
								onMoveClickSuppressRef={moveClickSuppressRef}
								onArrowNavigate={handleArrowNavigate}
								showTaskProgressIndicator={showTaskProgressIndicator}
								taskSummariesByPath={taskSummariesByPath}
							/>
						) : null}
					</FileTreeRootDrop>
				) : (
					<m.div
						className="fileTreeEmpty"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: 0.2 }}
					>
						No files found.
					</m.div>
				)}
				{children}
			</m.aside>
		</DragDropProvider>
	);
});
