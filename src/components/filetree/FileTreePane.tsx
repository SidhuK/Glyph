import {
	type DragEndEvent,
	useDragDropMonitor,
	useDroppable,
} from "@dnd-kit/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { m } from "motion/react";
import {
	type CSSProperties,
	type KeyboardEvent,
	type MouseEvent,
	type MutableRefObject,
	type ReactNode,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext, useSpace } from "../../contexts";
import { toast } from "../../lib/toast";

import {
	compareEntriesForSort,
	filterVisibleFileTreeEntries,
	hasVisibleFileTreeEntries,
} from "../../hooks/fileTreeHelpers";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { extractErrorMessage } from "../../lib/errorUtils";
import { spaceLabelFromAbsPath } from "../../lib/fileTreeFolderName";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import { type FileTreeSortMode, loadSettings } from "../../lib/settings";
import { registerPreviewInvalidator } from "../../lib/spaceChange";
import type {
	FileTreeAppearance,
	FsEntry,
	NoteTaskSummary,
} from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { isDeleteKey } from "../../utils/keyboard";
import { isMarkdownPath, normalizeRelPath, parentDir } from "../../utils/path";
import { AppearancePicker } from "../AppearancePicker";
import { ChevronRight } from "../Icons";
import { EDITOR_TEXT_COLORS, isEditorTextColor } from "../editor/textColors";
import { springPresets } from "../ui/animations";
import { FileTreeDirItem } from "./FileTreeDirItem";
import { FileTreeFileItem } from "./FileTreeFileItem";
import {
	FILE_TREE_ENTRY_TYPE,
	FILE_TREE_ROOT_DROP_COLLISION_PRIORITY,
} from "./fileTreeDnd";
import { useFileTreeCreateFolderScroll } from "./useFileTreeCreateFolderScroll";
import { useVisibleFilePreviews } from "./useVisibleFilePreviews";

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
	onImportFilesInDir: (dirPath: string) => void;
	onImportFolderInDir: (dirPath: string) => void;
	onImportPathsInDir: (paths: string[], dirPath: string) => void;
	onRequestCreateFolder: (dirPath: string) => Promise<string | null>;
	onDuplicateFile: (path: string) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	renamingPath: string | null;
	onStartRename: (path: string) => void;
	onCancelRename: () => void;
	onCommitFileRename: (path: string, nextName: string) => Promise<boolean>;
	onCommitDirRename: (dirPath: string, nextName: string) => Promise<boolean>;
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
const FILE_TREE_ROW_ESTIMATE = 32;
const FILE_TREE_PREVIEW_ROW_ESTIMATE = 52;
const DRAG_CLICK_SUPPRESSION_DELAY_MS = 100;

interface AppearancePickerTarget {
	entry: FsEntry;
}

function sortedVisibleFileTreeEntries(
	entries: FsEntry[],
	showNonMarkdownFiles: boolean,
	sortMode: FileTreeSortMode,
): FsEntry[] {
	return filterVisibleFileTreeEntries(entries, showNonMarkdownFiles)
		.slice()
		.sort(compareEntriesForSort(sortMode));
}

function folderBreadcrumbParts(spacePath: string | null, dirPath: string) {
	const parts = [
		{ label: spaceLabelFromAbsPath(spacePath), path: "" },
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

interface FileTreeRootDropProps {
	children: ReactNode;
	targetDirPath?: string;
	isExternalDropTarget?: boolean;
}

function FileTreeRootDrop({
	children,
	targetDirPath = "",
	isExternalDropTarget = false,
}: FileTreeRootDropProps) {
	const { ref, isDropTarget } = useDroppable({
		id: targetDirPath ? `file-tree-focused:${targetDirPath}` : "file-tree-root",
		data: { targetDirPath },
		accept: FILE_TREE_ENTRY_TYPE,
		collisionPriority: FILE_TREE_ROOT_DROP_COLLISION_PRIORITY,
	});

	return (
		<div
			ref={ref}
			className="fileTreeScroll"
			data-drop-target={
				isDropTarget || isExternalDropTarget ? "true" : undefined
			}
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

function fileTreeDropTargetAtPoint(
	pane: HTMLElement,
	x: number,
	y: number,
	fallbackDirPath: string,
): string | null {
	const bounds = pane.getBoundingClientRect();
	if (
		x < bounds.left ||
		x >= bounds.right ||
		y < bounds.top ||
		y >= bounds.bottom
	) {
		return null;
	}

	const hit = document.elementFromPoint(x, y);
	const row =
		hit instanceof Element
			? hit.closest<HTMLElement>("[data-file-tree-path][data-file-tree-kind]")
			: null;
	const rowPath =
		row && pane.contains(row) ? row.dataset.fileTreePath : undefined;
	return rowPath && row?.dataset.fileTreeKind === "dir"
		? rowPath
		: rowPath
			? parentDir(rowPath)
			: fallbackDirPath;
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
								size="var(--icon-xs)"
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
	onImportFilesInDir: (dirPath: string) => void;
	onImportFolderInDir: (dirPath: string) => void;
	onRequestCreateFolder: (dirPath: string) => void;
	onDuplicateFile: (path: string) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<void>;
	onStartRename: (path: string) => void;
	onCommitDirRename: (dirPath: string, nextName: string) => Promise<boolean>;
	onCommitFileRename: (path: string, nextName: string) => Promise<boolean>;
	onCancelRename: () => void;
	itemAppearance: Record<string, FileTreeAppearance>;
	folderFileCounts: Record<string, number>;
	showFolderFileCounts: boolean;
	showNonMarkdownFiles: boolean;
	externalDropTargetPath: string | null;
	onOpenAppearancePicker: (entry: FsEntry) => void;
	pinnedFiles: string[];
	onTogglePinnedFile: (path: string) => Promise<void>;
	onMoveClickSuppressRef: MutableRefObject<boolean>;
	taskSummariesByPath?: Record<string, NoteTaskSummary>;
	showFilePreviews?: boolean;
	filePreviewsByPath?: Record<string, string | null | undefined>;
	onVisiblePreviewPathsChange?: (paths: string[]) => void;
	sortMode: FileTreeSortMode;
}

interface VirtualFileTreeRow {
	id: string;
	entry: FsEntry;
	depth: number;
}

function flattenVisibleFileTreeRows({
	entries,
	parentDepth,
	childrenByDir,
	expandedDirs,
	showNonMarkdownFiles,
	sortMode,
}: Pick<
	TreeEntriesProps,
	| "entries"
	| "parentDepth"
	| "childrenByDir"
	| "expandedDirs"
	| "showNonMarkdownFiles"
	| "sortMode"
>): VirtualFileTreeRow[] {
	const rows: VirtualFileTreeRow[] = [];
	const walk = (currentEntries: FsEntry[], currentParentDepth: number) => {
		const visibleEntries = sortedVisibleFileTreeEntries(
			currentEntries,
			showNonMarkdownFiles,
			sortMode,
		);
		for (const entry of visibleEntries) {
			const depth = currentParentDepth + 1;
			rows.push({
				id:
					entry.rel_path.trim() ||
					`${entry.kind}:${entry.name.trim()}:${depth}`,
				entry,
				depth,
			});
			if (entry.kind !== "dir" || !expandedDirs.has(entry.rel_path)) continue;
			const childEntries = childrenByDir[entry.rel_path];
			if (childEntries) walk(childEntries, depth);
		}
	};
	walk(entries, parentDepth);
	return rows;
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
	onImportFilesInDir,
	onImportFolderInDir,
	onRequestCreateFolder,
	onDuplicateFile,
	onDeletePath,
	onStartRename,
	onCommitDirRename,
	onCommitFileRename,
	onCancelRename,
	itemAppearance,
	folderFileCounts,
	showFolderFileCounts,
	showNonMarkdownFiles,
	externalDropTargetPath,
	onOpenAppearancePicker,
	pinnedFiles,
	onTogglePinnedFile,
	onMoveClickSuppressRef,
	taskSummariesByPath = {},
	showFilePreviews = false,
	filePreviewsByPath = {},
	onVisiblePreviewPathsChange,
	sortMode,
}: TreeEntriesProps) {
	const virtualRows = useMemo(
		() =>
			flattenVisibleFileTreeRows({
				entries,
				parentDepth,
				childrenByDir,
				expandedDirs,
				showNonMarkdownFiles,
				sortMode,
			}),
		[
			childrenByDir,
			entries,
			expandedDirs,
			parentDepth,
			showNonMarkdownFiles,
			sortMode,
		],
	);
	const [listElement, setListElement] = useState<HTMLUListElement | null>(null);
	const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
	const listRef = useCallback((element: HTMLUListElement | null) => {
		setListElement(element);
		setScrollElement(
			element?.closest<HTMLElement>(".sidebarSectionContent") ??
				element?.parentElement ??
				null,
		);
	}, []);
	const rowVirtualizer = useVirtualizer<HTMLElement, HTMLLIElement>({
		count: virtualRows.length,
		estimateSize: (index) => {
			const row = virtualRows[index];
			if (!row) return FILE_TREE_ROW_ESTIMATE;
			return showFilePreviews &&
				row.entry.kind === "file" &&
				row.entry.is_markdown
				? FILE_TREE_PREVIEW_ROW_ESTIMATE
				: FILE_TREE_ROW_ESTIMATE;
		},
		getScrollElement: () => scrollElement,
		getItemKey: (index) => virtualRows[index]?.id ?? index,
		overscan: 4,
		scrollMargin: listElement?.offsetTop ?? 0,
	});
	const virtualItems = rowVirtualizer.getVirtualItems();
	const visiblePreviewPathKey = useMemo(() => {
		if (!showFilePreviews) return "";
		const paths = new Set<string>();
		for (const virtualItem of virtualItems) {
			const entry = virtualRows[virtualItem.index]?.entry;
			if (entry?.kind === "file" && entry.is_markdown) {
				paths.add(entry.rel_path);
			}
		}
		return [...paths].sort().join("\0");
	}, [showFilePreviews, virtualItems, virtualRows]);
	useEffect(() => {
		onVisiblePreviewPathsChange?.(
			visiblePreviewPathKey ? visiblePreviewPathKey.split("\0") : [],
		);
	}, [onVisiblePreviewPathsChange, visiblePreviewPathKey]);
	const onVisiblePreviewPathsChangeRef = useRef(onVisiblePreviewPathsChange);
	onVisiblePreviewPathsChangeRef.current = onVisiblePreviewPathsChange;
	useEffect(() => {
		return () => {
			onVisiblePreviewPathsChangeRef.current?.([]);
		};
	}, []);
	const handleVirtualArrowNavigate = useCallback(
		(path: string, direction: -1 | 1, currentTarget: HTMLElement) => {
			const currentIndex = virtualRows.findIndex(
				(row) => row.entry.kind === "file" && row.entry.rel_path === path,
			);
			if (currentIndex === -1) return;
			for (
				let nextIndex = currentIndex + direction;
				nextIndex >= 0 && nextIndex < virtualRows.length;
				nextIndex += direction
			) {
				const nextRow = virtualRows[nextIndex];
				if (!nextRow || nextRow.entry.kind !== "file") continue;
				const pane = currentTarget.closest(".fileTreePane");
				rowVirtualizer.scrollToIndex(nextIndex, { align: "auto" });
				onOpenFile(nextRow.entry.rel_path);
				requestAnimationFrame(() => {
					const nextButton = Array.from(
						pane?.querySelectorAll<HTMLElement>(
							"[data-file-tree-file='true']",
						) ?? [],
					).find(
						(button) => button.dataset.fileTreePath === nextRow.entry.rel_path,
					);
					nextButton?.focus();
				});
				return;
			}
		},
		[onOpenFile, rowVirtualizer, virtualRows],
	);

	if (virtualRows.length === 0) return null;

	return (
		<ul
			ref={listRef}
			className="fileTreeList"
			style={{ height: rowVirtualizer.getTotalSize() }}
		>
			{virtualItems.map((virtualItem) => {
				const row = virtualRows[virtualItem.index];
				if (!row) return null;
				const { entry, depth } = row;
				const virtualRowStyle: CSSProperties = {
					position: "absolute",
					top: 0,
					left: 0,
					width: "100%",
					transform: `translateY(${
						virtualItem.start - rowVirtualizer.options.scrollMargin
					}px)`,
				};

				if (entry.kind === "dir") {
					const isExpanded = expandedDirs.has(entry.rel_path);

					return (
						<FileTreeDirItem
							key={virtualItem.key}
							virtualRowRef={rowVirtualizer.measureElement}
							virtualRowStyle={virtualRowStyle}
							virtualRowIndex={virtualItem.index}
							entry={entry}
							depth={depth}
							isExpanded={isExpanded}
							isActive={!activeFilePath && entry.rel_path === activeDirPath}
							isRenaming={renamingPath === entry.rel_path}
							onToggleDir={onToggleDir}
							onEnterDir={onEnterDir}
							onSelectDir={onSelectDir}
							onNewFileInDir={onNewFileInDir}
							onCreateFromTemplateInDir={onCreateFromTemplateInDir}
							onImportFilesInDir={onImportFilesInDir}
							onImportFolderInDir={onImportFolderInDir}
							onRequestCreateFolder={onRequestCreateFolder}
							onDeletePath={onDeletePath}
							appearance={itemAppearance[entry.rel_path] ?? null}
							fileCount={
								showFolderFileCounts
									? (folderFileCounts[entry.rel_path] ?? null)
									: null
							}
							isExternalDropTarget={externalDropTargetPath === entry.rel_path}
							onOpenAppearancePicker={() => onOpenAppearancePicker(entry)}
							onStartRename={() => onStartRename(entry.rel_path)}
							onCommitRename={onCommitDirRename}
							onCancelRename={onCancelRename}
							onMoveClickSuppressRef={onMoveClickSuppressRef}
						/>
					);
				}

				return (
					<FileTreeFileItem
						key={virtualItem.key}
						virtualRowRef={rowVirtualizer.measureElement}
						virtualRowStyle={virtualRowStyle}
						virtualRowIndex={virtualItem.index}
						entry={entry}
						depth={depth}
						isActive={entry.rel_path === activeFilePath}
						onOpenFile={onOpenFile}
						onPrefetchFile={onPrefetchFile}
						onNewFileInDir={onNewFileInDir}
						onCreateFromTemplateInDir={onCreateFromTemplateInDir}
						onRequestCreateFolder={onRequestCreateFolder}
						onDuplicateFile={onDuplicateFile}
						isRenaming={renamingPath === entry.rel_path}
						onStartRename={() => onStartRename(entry.rel_path)}
						onCommitRename={onCommitFileRename}
						onCancelRename={onCancelRename}
						parentDirPath={parentDir(entry.rel_path)}
						onDeletePath={onDeletePath}
						appearance={itemAppearance[entry.rel_path] ?? null}
						onOpenAppearancePicker={() => onOpenAppearancePicker(entry)}
						isPinned={pinnedFiles.includes(entry.rel_path)}
						onTogglePinned={onTogglePinnedFile}
						onMoveClickSuppressRef={onMoveClickSuppressRef}
						onArrowNavigate={handleVirtualArrowNavigate}
						taskSummary={taskSummariesByPath[entry.rel_path] ?? null}
						previewText={
							showFilePreviews && entry.is_markdown
								? (filePreviewsByPath[entry.rel_path] ?? null)
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
	onImportFilesInDir,
	onImportFolderInDir,
	onImportPathsInDir,
	onRequestCreateFolder,
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
	const { t } = useTranslation("shell");
	const {
		itemAppearance,
		setItemAppearance,
		fileTreeSortMode: sortMode,
	} = useFileTreeContext();
	const { spacePath, setError } = useSpace();
	const [showFolderFileCounts, setShowFolderFileCounts] = useState(false);
	const [showNonMarkdownFiles, setShowNonMarkdownFiles] = useState<
		boolean | null
	>(null);
	const [folderFileCounts, setFolderFileCounts] = useState<
		Record<string, number>
	>({});
	const [focusedDirPath, setFocusedDirPath] = useState<string | null>(
		activeDirPath,
	);
	const {
		filePreviewsByPath,
		clearVisiblePreviewPaths,
		handleVisiblePreviewPathsChange,
		invalidatePreviewForPath,
	} = useVisibleFilePreviews(spacePath, focusedDirPath);
	const [appearancePickerTarget, setAppearancePickerTarget] =
		useState<AppearancePickerTarget | null>(null);
	const [externalDropTargetPath, setExternalDropTargetPath] = useState<
		string | null
	>(null);
	const moveClickSuppressRef = useRef(false);
	const moveClickSuppressResetTimerRef = useRef<ReturnType<
		typeof window.setTimeout
	> | null>(null);
	const paneRef = useRef<HTMLElement | null>(null);
	const focusedDirPathRef = useRef(focusedDirPath);
	const settingsVersionRef = useRef(0);
	const previousSpacePathRef = useRef(spacePath);
	const itemAppearanceRef = useRef(itemAppearance);
	focusedDirPathRef.current = focusedDirPath;
	useEffect(() => {
		return () => {
			if (moveClickSuppressResetTimerRef.current !== null) {
				window.clearTimeout(moveClickSuppressResetTimerRef.current);
			}
		};
	}, []);
	useEffect(() => {
		itemAppearanceRef.current = itemAppearance;
	}, [itemAppearance]);

	useEffect(() => {
		if (previousSpacePathRef.current === spacePath) return;
		previousSpacePathRef.current = spacePath;
		setFocusedDirPath(null);
	}, [spacePath]);

	useEffect(() => {
		let cancelled = false;
		const loadId = settingsVersionRef.current + 1;
		settingsVersionRef.current = loadId;
		void loadSettings()
			.then((settings) => {
				if (!cancelled && loadId === settingsVersionRef.current) {
					setShowFolderFileCounts(settings.ui.showFileTreeFolderCounts);
					setShowNonMarkdownFiles(settings.ui.showNonMarkdownFiles);
				}
			})
			.catch(() => {
				if (!cancelled && loadId === settingsVersionRef.current) {
					setShowNonMarkdownFiles(true);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (
			typeof payload.ui?.showFileTreeFolderCounts === "boolean" ||
			typeof payload.ui?.showNonMarkdownFiles === "boolean"
		) {
			settingsVersionRef.current += 1;
		}
		if (typeof payload.ui?.showFileTreeFolderCounts === "boolean") {
			setShowFolderFileCounts(payload.ui.showFileTreeFolderCounts);
		}
		if (typeof payload.ui?.showNonMarkdownFiles === "boolean") {
			setShowNonMarkdownFiles(payload.ui.showNonMarkdownFiles);
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
		if (!spacePath || !showFolderFileCounts || showNonMarkdownFiles === null) {
			setFolderFileCounts({});
			return;
		}

		const requestRevision = folderCountTreeRevision;
		if (!requestRevision) {
			setFolderFileCounts({});
			return;
		}

		let cancelled = false;
		void invoke("space_dir_children_summary", {
			dirs: summaryParentDirs,
		})
			.then((summaries) => {
				if (cancelled) return;
				const nextCounts: Record<string, number> = {};
				for (const summary of summaries) {
					nextCounts[summary.dir_rel_path] = showNonMarkdownFiles
						? summary.total_files_recursive
						: summary.total_markdown_recursive;
				}
				setFolderFileCounts((prev) => ({
					...prev,
					...nextCounts,
				}));
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				console.warn("Failed to load folder file counts", error);
			});

		return () => {
			cancelled = true;
		};
	}, [
		spacePath,
		showFolderFileCounts,
		showNonMarkdownFiles,
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
		return [...paths].sort();
	}, [childrenByDir, expandedDirs, focusedDirPath, rootEntries]);
	const taskSummariesByPath = useTaskSummariesForPaths(
		taskSummaryPaths,
		Boolean(spacePath),
	);

	useEffect(() => {
		return registerPreviewInvalidator(invalidatePreviewForPath);
	}, [invalidatePreviewForPath]);

	const handleRequestCreateFolder = useFileTreeCreateFolderScroll(
		onRequestCreateFolder,
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

	const handleOpenAppearancePicker = useCallback((entry: FsEntry) => {
		setAppearancePickerTarget({ entry });
	}, []);

	const appearancePickerEntry = appearancePickerTarget?.entry ?? null;
	const appearancePickerAppearance = appearancePickerEntry
		? (itemAppearance[appearancePickerEntry.rel_path] ?? null)
		: null;
	const appearancePickerColor =
		appearancePickerAppearance?.color &&
		isEditorTextColor(appearancePickerAppearance.color)
			? appearancePickerAppearance.color
			: null;
	const appearancePickerIcon = appearancePickerAppearance?.icon ?? null;
	const appearancePickerDefaultIcon =
		appearancePickerEntry?.kind === "dir" ? "folder" : "document";

	const updatePickerAppearance = useCallback(
		(nextAppearance: FileTreeAppearance) => {
			if (!appearancePickerEntry) return;
			const path = appearancePickerEntry.rel_path;
			const mergedAppearance = {
				...(itemAppearanceRef.current[path] ?? {}),
				...nextAppearance,
			};
			itemAppearanceRef.current = {
				...itemAppearanceRef.current,
				[path]: mergedAppearance,
			};
			void handleChangeAppearance(appearancePickerEntry, {
				...mergedAppearance,
			});
		},
		[appearancePickerEntry, handleChangeAppearance],
	);

	const handleEnterDir = useCallback(
		(dirPath: string) => {
			clearVisiblePreviewPaths();
			setFocusedDirPath(dirPath);
			onSelectDir(dirPath);
			if (!onLoadDir && !childrenByDir[dirPath] && !expandedDirs.has(dirPath)) {
				onToggleDir(dirPath);
			}
		},
		[
			childrenByDir,
			clearVisiblePreviewPaths,
			expandedDirs,
			onLoadDir,
			onSelectDir,
			onToggleDir,
		],
	);

	const handleExitFocusedDir = useCallback(() => {
		clearVisiblePreviewPaths();
		setFocusedDirPath(null);
		onSelectDir("");
	}, [clearVisiblePreviewPaths, onSelectDir]);

	const focusedEntries = focusedDirPath
		? (childrenByDir[focusedDirPath] ?? null)
		: null;
	const hasLoadedFileVisibility = showNonMarkdownFiles !== null;
	const showNonMarkdownFilesSetting = showNonMarkdownFiles ?? false;
	const hasVisibleRootEntries = useMemo(
		() => hasVisibleFileTreeEntries(rootEntries, showNonMarkdownFilesSetting),
		[rootEntries, showNonMarkdownFilesSetting],
	);
	const hasVisibleFocusedEntries = useMemo(
		() =>
			focusedEntries === null
				? null
				: hasVisibleFileTreeEntries(
						focusedEntries,
						showNonMarkdownFilesSetting,
					),
		[focusedEntries, showNonMarkdownFilesSetting],
	);

	useEffect(() => {
		if (!focusedDirPath || focusedEntries || !onLoadDir) return;
		void onLoadDir(focusedDirPath);
	}, [focusedDirPath, focusedEntries, onLoadDir]);

	// Move only when a tree entry lands on a tree drop target. Drops onto an
	// editor pane resolve to a pane droppable, which SplitEditorLayout handles.
	const dragDropHandlers = useMemo(
		() => ({
			onDragEnd(event: DragEndEvent) {
				const { source, target } = event.operation;
				const sourcePath =
					typeof source?.data.path === "string" ? source.data.path : null;
				const sourceKind =
					source?.data.kind === "dir" || source?.data.kind === "file"
						? source.data.kind
						: null;
				if (!sourcePath || !sourceKind) return;

				moveClickSuppressRef.current = true;
				if (moveClickSuppressResetTimerRef.current !== null) {
					window.clearTimeout(moveClickSuppressResetTimerRef.current);
				}
				// The row click clears this sooner when a post-drag click arrives;
				// the fallback handles canceled and non-tree drops with no click event.
				moveClickSuppressResetTimerRef.current = window.setTimeout(() => {
					moveClickSuppressRef.current = false;
					moveClickSuppressResetTimerRef.current = null;
				}, DRAG_CLICK_SUPPRESSION_DELAY_MS);
				if (event.canceled) return;

				const targetDirPath =
					typeof target?.data.targetDirPath === "string"
						? target.data.targetDirPath
						: null;
				if (targetDirPath == null) return;

				void onMovePath(sourcePath, targetDirPath, sourceKind);
			},
		}),
		[onMovePath],
	);
	useDragDropMonitor(dragDropHandlers);
	const handlePaneContextMenu = useCallback(
		(event: MouseEvent<HTMLElement>) => {
			if (
				!(event.target instanceof Element) ||
				event.target.closest("[data-file-tree-path][data-file-tree-kind]")
			) {
				return;
			}
			const targetDir = focusedDirPath ?? "";
			void showNativeContextMenu(event, [
				{
					label: t("fileTree.importFilesHere"),
					action: () => onImportFilesInDir(targetDir),
				},
				{
					label: t("fileTree.importFolderHere"),
					action: () => onImportFolderInDir(targetDir),
				},
			]).catch((error: unknown) => {
				console.error("Failed to show file tree context menu", error);
			});
		},
		[focusedDirPath, onImportFilesInDir, onImportFolderInDir, t],
	);

	useEffect(() => {
		const currentWindow = getCurrentWindow();
		let unlisten: (() => void) | undefined;
		let disposed = false;
		void currentWindow
			.onDragDropEvent(async ({ payload }) => {
				if (payload.type === "leave") {
					setExternalDropTargetPath(null);
					return;
				}
				const pane = paneRef.current;
				if (!pane) {
					setExternalDropTargetPath(null);
					return;
				}
				const targetDir = fileTreeDropTargetAtPoint(
					pane,
					payload.position.x,
					payload.position.y,
					focusedDirPathRef.current ?? "",
				);
				if (payload.type !== "drop") {
					setExternalDropTargetPath(targetDir);
					return;
				}
				setExternalDropTargetPath(null);
				if (payload.paths.length === 0) return;
				if (targetDir === null) return;
				await onImportPathsInDir(payload.paths, targetDir);
			})
			.then((stopListening) => {
				if (disposed) {
					stopListening();
					return;
				}
				unlisten = stopListening;
			})
			.catch((error: unknown) => {
				console.error("Failed to listen for imported file drops", error);
			});
		return () => {
			disposed = true;
			unlisten?.();
		};
	}, [onImportPathsInDir]);

	return (
		<m.aside
			ref={paneRef}
			className="fileTreePane"
			initial={{ y: 10 }}
			animate={{ y: 0 }}
			transition={springTransition}
			onContextMenu={handlePaneContextMenu}
			onKeyDown={handleTreeKeyDown}
		>
			<AppearancePicker
				title="Choose file tree appearance"
				open={appearancePickerTarget !== null}
				onOpenChange={(open) => {
					if (!open) setAppearancePickerTarget(null);
				}}
				iconValue={appearancePickerIcon}
				defaultIconName={appearancePickerDefaultIcon}
				showDefaultIcon
				onIconChange={(icon) => {
					updatePickerAppearance({
						icon,
					});
				}}
				showColors
				colorValue={appearancePickerColor}
				colorOptions={EDITOR_TEXT_COLORS}
				onColorChange={(color) => {
					updatePickerAppearance({
						color,
					});
				}}
			/>
			{!hasLoadedFileVisibility ? null : focusedDirPath ? (
				<FileTreeRootDrop
					targetDirPath={focusedDirPath}
					isExternalDropTarget={externalDropTargetPath === focusedDirPath}
				>
					<FolderBreadcrumb
						spacePath={spacePath}
						dirPath={focusedDirPath}
						onNavigate={handleEnterDir}
						onExit={handleExitFocusedDir}
					/>
					{hasVisibleFocusedEntries ===
					null ? null : hasVisibleFocusedEntries ? (
						<TreeEntries
							entries={focusedEntries ?? []}
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
							onImportFilesInDir={onImportFilesInDir}
							onImportFolderInDir={onImportFolderInDir}
							onRequestCreateFolder={handleRequestCreateFolder}
							onDuplicateFile={handleDuplicateFile}
							onDeletePath={handleDeletePath}
							onStartRename={onStartRename}
							onCommitDirRename={onCommitDirRename}
							onCommitFileRename={onCommitFileRename}
							onCancelRename={onCancelRename}
							itemAppearance={itemAppearance}
							folderFileCounts={folderFileCounts}
							showFolderFileCounts={showFolderFileCounts}
							showNonMarkdownFiles={showNonMarkdownFilesSetting}
							externalDropTargetPath={externalDropTargetPath}
							onOpenAppearancePicker={handleOpenAppearancePicker}
							pinnedFiles={pinnedFiles}
							onTogglePinnedFile={onTogglePinnedFile}
							onMoveClickSuppressRef={moveClickSuppressRef}
							taskSummariesByPath={taskSummariesByPath}
							showFilePreviews
							filePreviewsByPath={filePreviewsByPath}
							onVisiblePreviewPathsChange={handleVisiblePreviewPathsChange}
							sortMode={sortMode}
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
			) : hasVisibleRootEntries ? (
				<FileTreeRootDrop isExternalDropTarget={externalDropTargetPath === ""}>
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
						onImportFilesInDir={onImportFilesInDir}
						onImportFolderInDir={onImportFolderInDir}
						onRequestCreateFolder={handleRequestCreateFolder}
						onDuplicateFile={handleDuplicateFile}
						onDeletePath={handleDeletePath}
						onStartRename={onStartRename}
						onCommitDirRename={onCommitDirRename}
						onCommitFileRename={onCommitFileRename}
						onCancelRename={onCancelRename}
						itemAppearance={itemAppearance}
						folderFileCounts={folderFileCounts}
						showFolderFileCounts={showFolderFileCounts}
						showNonMarkdownFiles={showNonMarkdownFilesSetting}
						externalDropTargetPath={externalDropTargetPath}
						onOpenAppearancePicker={handleOpenAppearancePicker}
						pinnedFiles={pinnedFiles}
						onTogglePinnedFile={onTogglePinnedFile}
						onMoveClickSuppressRef={moveClickSuppressRef}
						taskSummariesByPath={taskSummariesByPath}
						sortMode={sortMode}
					/>
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
	);
});
