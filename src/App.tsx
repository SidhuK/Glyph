import { join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { AnimatePresence, motion } from "motion/react";
import {
	type MouseEvent,
	Suspense,
	lazy,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import "./App.css";
import { AIPane, type SelectedCanvasNode } from "./components/AIPane";
import type {
	CanvasEdge,
	CanvasExternalCommand,
	CanvasNode,
} from "./components/CanvasPane";
import { FileTreePane } from "./components/FileTreePane";
import { FolderBreadcrumb } from "./components/FolderBreadcrumb";
import { FolderShelf } from "./components/FolderShelf";
import {
	Files,
	FolderOpen,
	FolderPlus,
	PanelLeftClose,
	PanelLeftOpen,
	Search,
	Sparkles,
	Tags,
	X,
} from "./components/Icons";
import { MotionFloatingPanel, MotionIconButton } from "./components/MotionUI";
import { SearchPane } from "./components/SearchPane";
import { TagsPane } from "./components/TagsPane";
import { loadSettings, setCurrentVaultPath } from "./lib/settings";
import {
	type AppInfo,
	type DirChildSummary,
	type FsEntry,
	type NoteMeta,
	type RecentEntry,
	type SearchResult,
	type TagCount,
	TauriInvokeError,
	invoke,
} from "./lib/tauri";
import {
	type ViewDoc,
	type ViewRef,
	asCanvasDocLike,
	buildFolderViewDoc,
	buildSearchViewDoc,
	buildTagViewDoc,
	loadViewDoc,
	saveViewDoc,
} from "./lib/views";

const CanvasPane = lazy(() => import("./components/CanvasPane"));

function parentDir(relPath: string): string {
	const idx = relPath.lastIndexOf("/");
	return idx === -1 ? "" : relPath.slice(0, idx);
}

function isMarkdownPath(relPath: string): boolean {
	return relPath.toLowerCase().endsWith(".md");
}

const WINDOW_DRAG_INTERACTIVE_SELECTOR =
	"button, a, input, textarea, select, [role='button'], [contenteditable='true'], [data-window-drag-ignore]";

function onWindowDragMouseDown(event: MouseEvent<HTMLElement>): void {
	if (event.button !== 0) return;
	if (event.defaultPrevented) return;

	const target = event.target;
	if (target instanceof Element) {
		const interactiveAncestor = target.closest(
			WINDOW_DRAG_INTERACTIVE_SELECTOR,
		);
		if (interactiveAncestor) return;
	}

	event.preventDefault();
	void getCurrentWindow()
		.startDragging()
		.catch(() => {});
}

function App() {
	const [info, setInfo] = useState<AppInfo | null>(null);
	const [error, setError] = useState<string>("");
	const [vaultPath, setVaultPath] = useState<string | null>(null);
	const [vaultSchemaVersion, setVaultSchemaVersion] = useState<number | null>(
		null,
	);
	const [rootEntries, setRootEntries] = useState<FsEntry[]>([]);
	const [childrenByDir, setChildrenByDir] = useState<
		Record<string, FsEntry[] | undefined>
	>({});
	const [dirSummariesByParent, setDirSummariesByParent] = useState<
		Record<string, DirChildSummary[] | undefined>
	>({});
	const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
		() => new Set(),
	);
	const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
	const [activeViewPath, setActiveViewPath] = useState<string | null>(null);
	const [activeViewDoc, setActiveViewDoc] = useState<ViewDoc | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState("");
	const [tags, setTags] = useState<TagCount[]>([]);
	const [tagsError, setTagsError] = useState("");
	const [selectedCanvasNodes, setSelectedCanvasNodes] = useState<
		SelectedCanvasNode[]
	>([]);
	const [canvasCommand, setCanvasCommand] =
		useState<CanvasExternalCommand | null>(null);
	const [showAiPanel, setShowAiPanel] = useState(false);
	const [showSearch, setShowSearch] = useState(false);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [sidebarViewMode, setSidebarViewMode] = useState<"files" | "tags">(
		"files",
	);

	const [folderShelfSubfolders, setFolderShelfSubfolders] = useState<FsEntry[]>(
		[],
	);
	const [folderShelfSummaries, setFolderShelfSummaries] = useState<
		DirChildSummary[]
	>([]);
	const [folderShelfRecents, setFolderShelfRecents] = useState<RecentEntry[]>(
		[],
	);
	const folderShelfCacheRef = useRef(
		new Map<
			string,
			{
				subfolders: FsEntry[];
				summaries: DirChildSummary[];
				recents: RecentEntry[];
			}
		>(),
	);

	const activeViewDocRef = useRef<ViewDoc | null>(null);
	const activeViewPathRef = useRef<string | null>(null);

	useEffect(() => {
		activeViewDocRef.current = activeViewDoc;
	}, [activeViewDoc]);

	useEffect(() => {
		activeViewPathRef.current = activeViewPath;
	}, [activeViewPath]);

	// Keep info in sync but don't use it directly in render
	void info;

	const activeNoteId = useMemo(() => {
		if (!activeFilePath) return null;
		return isMarkdownPath(activeFilePath) ? activeFilePath : null;
	}, [activeFilePath]);

	const activeNoteTitle = useMemo(() => {
		if (!activeNoteId) return null;
		const name = activeNoteId.split("/").pop();
		return name || activeNoteId;
	}, [activeNoteId]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const appInfo = await invoke("app_info");
				if (!cancelled) setInfo(appInfo);
			} catch (err) {
				const message =
					err instanceof TauriInvokeError
						? err.message
						: err instanceof Error
							? err.message
							: String(err);
				if (!cancelled) setError(message);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				folderShelfCacheRef.current.clear();
				setFolderShelfSubfolders([]);
				setFolderShelfSummaries([]);
				setFolderShelfRecents([]);
				setDirSummariesByParent({});
				setVaultPath(settings.currentVaultPath);

				if (settings.currentVaultPath) {
					try {
						let rootEntriesLocal: FsEntry[] = [];
						const opened = await invoke("vault_open", {
							path: settings.currentVaultPath,
						});
						if (!cancelled) setVaultSchemaVersion(opened.schema_version);
						try {
							const entries = await invoke("vault_list_dir", {});
							rootEntriesLocal = entries;
							if (!cancelled) setRootEntries(entries);
						} catch {
							// ignore
						}
						try {
							const summaries = await invoke("vault_dir_children_summary", {
								dir: null,
								preview_limit: 1,
							});
							if (!cancelled)
								setDirSummariesByParent((prev) => ({
									...prev,
									"": summaries,
								}));
						} catch {
							// ignore
						}
						try {
							await invoke("index_rebuild");
						} catch {
							// ignore
						}
						try {
							const list = await invoke("tags_list", { limit: 250 });
							if (!cancelled) setTags(list);
						} catch {
							// ignore
						}
						try {
							// Default to the root folder view canvas when opening a vault from settings.
							const onlyDir =
								rootEntriesLocal.filter((e) => e.kind === "dir").length === 1 &&
								rootEntriesLocal.filter((e) => e.kind === "file").length === 0
									? (rootEntriesLocal.find((e) => e.kind === "dir")?.rel_path ??
										"")
									: "";
							const view: ViewRef = { kind: "folder", dir: onlyDir };
							const loaded = await loadViewDoc(view);
							const built = await buildFolderViewDoc(
								onlyDir,
								{ recursive: false, limit: 500 },
								loaded.doc,
							);
							if (!loaded.doc || built.changed) {
								await saveViewDoc(loaded.path, built.doc);
							}
							if (!cancelled) {
								setActiveViewPath(loaded.path);
								setActiveViewDoc(built.doc);
							}
						} catch {
							// ignore
						}
					} catch {
						if (!cancelled) setVaultSchemaVersion(null);
					}
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (!cancelled) setError(message);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const pickDirectory = useCallback(async (): Promise<string | null> => {
		const selection = await open({
			title: "Select a vault folder",
			directory: true,
			multiple: false,
		});
		if (!selection) return null;
		if (Array.isArray(selection)) return selection[0] ?? null;
		return selection;
	}, []);

	const refreshTags = useCallback(async () => {
		try {
			setTagsError("");
			const list = await invoke("tags_list", { limit: 250 });
			setTags(list);
		} catch (e) {
			setTags([]);
			setTagsError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	const loadAndBuildFolderView = useCallback(async (dir: string) => {
		setError("");
		try {
			const view: ViewRef = { kind: "folder", dir };

			const loaded = await loadViewDoc(view);
			const built = await buildFolderViewDoc(
				dir,
				{ recursive: false, limit: 500 },
				loaded.doc,
			);

			if (!loaded.doc || built.changed) {
				await saveViewDoc(loaded.path, built.doc);
			}

			setActiveViewPath(loaded.path);
			setActiveViewDoc(built.doc);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	const loadAndBuildSearchView = useCallback(async (query: string) => {
		setError("");
		try {
			const q = query.trim();
			if (!q) return;
			const view: ViewRef = { kind: "search", query: q };

			const loaded = await loadViewDoc(view);
			const built = await buildSearchViewDoc(q, { limit: 200 }, loaded.doc);
			if (!loaded.doc || built.changed) {
				await saveViewDoc(loaded.path, built.doc);
			}
			setActiveViewPath(loaded.path);
			setActiveViewDoc(built.doc);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	const loadAndBuildTagView = useCallback(async (tag: string) => {
		setError("");
		try {
			const t = tag.trim();
			if (!t) return;
			const view: ViewRef = { kind: "tag", tag: t };

			const loaded = await loadViewDoc(view);
			const built = await buildTagViewDoc(t, { limit: 500 }, loaded.doc);
			if (!loaded.doc || built.changed) {
				await saveViewDoc(loaded.path, built.doc);
			}
			setActiveViewPath(loaded.path);
			setActiveViewDoc(built.doc);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	const applyVaultSelection = useCallback(
		async (path: string, mode: "open" | "create") => {
			setError("");
			try {
				const info =
					mode === "create"
						? await invoke("vault_create", { path })
						: await invoke("vault_open", { path });
				await setCurrentVaultPath(info.root);
				setVaultPath(info.root);
				setVaultSchemaVersion(info.schema_version);

				setRootEntries([]);
				setChildrenByDir({});
				setDirSummariesByParent({});
				setExpandedDirs(new Set());
				setActiveFilePath(null);

				setActiveViewPath(null);
				setActiveViewDoc(null);
				setSearchQuery("");
				setSearchResults([]);
				setSearchError("");
				setTags([]);
				setTagsError("");

				folderShelfCacheRef.current.clear();
				setFolderShelfSubfolders([]);
				setFolderShelfSummaries([]);
				setFolderShelfRecents([]);

				const entries = await invoke("vault_list_dir", {});
				setRootEntries(entries);
				try {
					const summaries = await invoke("vault_dir_children_summary", {
						dir: null,
						preview_limit: 1,
					});
					setDirSummariesByParent((prev) => ({ ...prev, "": summaries }));
				} catch {
					// ignore
				}
				const onlyDir =
					entries.filter((e) => e.kind === "dir").length === 1 &&
					entries.filter((e) => e.kind === "file").length === 0
						? (entries.find((e) => e.kind === "dir")?.rel_path ?? "")
						: "";
				await loadAndBuildFolderView(onlyDir);

				void (async () => {
					try {
						await invoke("index_rebuild");
					} catch {
						// Index is derived; search UI can still function as "empty" until rebuilt.
					}
					await refreshTags();
				})();
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				setError(message);
			}
		},
		[loadAndBuildFolderView, refreshTags],
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
		[loadAndBuildFolderView],
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

	useEffect(() => {
		if (!vaultPath) return;
		if (!activeViewDoc) return;
		if (activeViewDoc.kind !== "folder") return;

		const dir = activeViewDoc.selector || "";
		const cached = folderShelfCacheRef.current.get(dir);
		if (cached) {
			setFolderShelfSubfolders(cached.subfolders);
			setFolderShelfSummaries(cached.summaries);
			setFolderShelfRecents(cached.recents);
		} else {
			setFolderShelfSubfolders([]);
			setFolderShelfSummaries([]);
			setFolderShelfRecents([]);
		}

		let cancelled = false;
		(async () => {
			try {
				const [entries, summaries, recents] = await Promise.all([
					invoke("vault_list_dir", { dir: dir || null }),
					invoke("vault_dir_children_summary", {
						dir: dir || null,
						preview_limit: 1,
					}),
					invoke("vault_dir_recent_entries", { dir: dir || null, limit: 5 }),
				]);
				if (cancelled) return;
				const subfolders = entries
					.filter((e) => e.kind === "dir")
					.sort((a, b) =>
						a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
					);
				const next = { subfolders, summaries, recents };
				folderShelfCacheRef.current.set(dir, next);
				setFolderShelfSubfolders(next.subfolders);
				setFolderShelfSummaries(next.summaries);
				setFolderShelfRecents(next.recents);
			} catch {
				// ignore: shelf is convenience UI
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [activeViewDoc, vaultPath]);

	const onCreateVault = useCallback(async () => {
		const path = await pickDirectory();
		if (!path) return;
		await applyVaultSelection(path, "create");
	}, [applyVaultSelection, pickDirectory]);

	const onOpenVault = useCallback(async () => {
		const path = await pickDirectory();
		if (!path) return;
		await applyVaultSelection(path, "open");
	}, [applyVaultSelection, pickDirectory]);

	const loadDir = useCallback(async (dirPath: string) => {
		const [entries, summaries] = await Promise.all([
			invoke("vault_list_dir", dirPath ? { dir: dirPath } : {}),
			invoke("vault_dir_children_summary", {
				dir: dirPath || null,
				preview_limit: 1,
			}),
		]);
		setChildrenByDir((prev) => ({ ...prev, [dirPath]: entries }));
		setDirSummariesByParent((prev) => ({ ...prev, [dirPath]: summaries }));
	}, []);

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
		[loadDir],
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
		[openMarkdownFileInCanvas, openNonMarkdownExternally],
	);

	useEffect(() => {
		if (!vaultPath) return;
		let cancelled = false;
		if (!searchQuery.trim()) {
			setSearchResults([]);
			setSearchError("");
			return;
		}
		setIsSearching(true);
		setSearchError("");
		const t = window.setTimeout(() => {
			(async () => {
				try {
					const res = await invoke("search", { query: searchQuery });
					if (!cancelled) setSearchResults(res);
				} catch (e) {
					if (!cancelled)
						setSearchError(e instanceof Error ? e.message : String(e));
				} finally {
					if (!cancelled) setIsSearching(false);
				}
			})();
		}, 180);
		return () => {
			cancelled = true;
			window.clearTimeout(t);
		};
	}, [searchQuery, vaultPath]);

	const createFileFromMarkdown = useCallback(
		async (title: string, markdown: string): Promise<NoteMeta | null> => {
			if (!vaultPath) return null;
			const defaultName = `${
				(title || "Untitled")
					.replace(/[\\/:*?"<>|]/g, "")
					.trim()
					.slice(0, 80) || "Untitled"
			}.md`;
			const selection = await save({
				title: "Create Markdown file",
				defaultPath: `${vaultPath}/${defaultName}`,
				filters: [{ name: "Markdown", extensions: ["md"] }],
			});
			const absPath = Array.isArray(selection)
				? (selection[0] ?? null)
				: selection;
			if (!absPath) return null;
			const rel = await invoke("vault_relativize_path", { abs_path: absPath });
			await invoke("vault_write_text", {
				path: rel,
				text: markdown,
				base_mtime_ms: null,
			});
			const entries = await invoke("vault_list_dir", {});
			setRootEntries(entries);
			await openMarkdownFileInCanvas(rel);
			const now = new Date().toISOString();
			return {
				id: rel,
				title: title || rel.split("/").pop() || "Untitled",
				created: now,
				updated: now,
			};
		},
		[openMarkdownFileInCanvas, vaultPath],
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
	}, [openMarkdownFileInCanvas, vaultPath]);

	const onCanvasSelectionChange = useCallback((selected: CanvasNode[]) => {
		setSelectedCanvasNodes(
			selected.map((n) => ({
				id: n.id,
				type: n.type ?? null,
				data: (n.data ?? null) as Record<string, unknown> | null,
			})),
		);
	}, []);

	const addCanvasNoteNode = useCallback((noteId: string, title: string) => {
		setCanvasCommand({
			id: crypto.randomUUID(),
			kind: "add_note_node",
			noteId,
			title,
		});
	}, []);

	const addCanvasTextNode = useCallback((text: string) => {
		setCanvasCommand({ id: crypto.randomUUID(), kind: "add_text_node", text });
	}, []);

	const onSaveView = useCallback(
		async (payload: {
			version: number;
			id: string;
			title: string;
			nodes: CanvasNode[];
			edges: CanvasEdge[];
		}) => {
			const path = activeViewPathRef.current;
			const prev = activeViewDocRef.current;
			if (!path || !prev) return;
			const next: ViewDoc = {
				...prev,
				nodes: payload.nodes,
				edges: payload.edges,
			};
			await saveViewDoc(path, next);
			setActiveViewDoc(next);
		},
		[],
	);

	return (
		<div className="appShell">
			{/* Fallback draggable strip for macOS overlay titlebar (stays behind toolbars) */}
			<div
				aria-hidden="true"
				className="windowDragStrip"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			/>
			{/* Left Sidebar - Project Navigation */}
			<aside
				className={`sidebar ${sidebarCollapsed ? "sidebarCollapsed" : ""}`}
			>
				{/* Drag layer only catches clicks on truly empty sidebar space */}
				<div
					aria-hidden="true"
					className="sidebarDragLayer"
					data-tauri-drag-region
					onMouseDown={onWindowDragMouseDown}
				/>
				<div
					className="sidebarHeader"
					data-tauri-drag-region
					onMouseDown={onWindowDragMouseDown}
				>
					{!sidebarCollapsed && (
						<div className="sidebarActions">
							<MotionIconButton
								type="button"
								onClick={() => setShowSearch(!showSearch)}
								title="Search"
								active={showSearch}
							>
								<Search size={16} />
							</MotionIconButton>
							<MotionIconButton
								type="button"
								onClick={onCreateVault}
								title="Create vault"
							>
								<FolderPlus size={16} />
							</MotionIconButton>
							<MotionIconButton
								type="button"
								onClick={onOpenVault}
								title="Open vault"
							>
								<FolderOpen size={16} />
							</MotionIconButton>
						</div>
					)}
					<MotionIconButton
						type="button"
						onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
						title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
					>
						{sidebarCollapsed ? (
							<PanelLeftOpen size={16} />
						) : (
							<PanelLeftClose size={16} />
						)}
					</MotionIconButton>
				</div>

				{!sidebarCollapsed && (
					<>
						{/* Search Panel (collapsible) */}
						{showSearch && (
							<div className="sidebarSection">
								<SearchPane
									query={searchQuery}
									results={searchResults}
									isSearching={isSearching}
									error={searchError}
									onChangeQuery={setSearchQuery}
									onOpenAsCanvas={(q) => void loadAndBuildSearchView(q)}
									onSelectNote={(id) => {
										void openMarkdownFileInCanvas(id);
									}}
								/>
							</div>
						)}

						{/* Vault Info */}
						{vaultPath && (
							<div className="sidebarSection vaultInfo">
								<div className="vaultPath mono">
									{vaultPath.split("/").pop()}
								</div>
								<div className="vaultMeta">
									{vaultSchemaVersion ? `v${vaultSchemaVersion}` : ""}
								</div>
							</div>
						)}

						{/* File Tree / Tags Toggle */}
						<div className="sidebarSection sidebarSectionGrow">
							<div className="sidebarSectionHeader">
								<div className="sidebarSectionToggle">
									<button
										type="button"
										className={
											sidebarViewMode === "files" ? "segBtn active" : "segBtn"
										}
										onClick={() => setSidebarViewMode("files")}
										title="Files"
									>
										<Files size={14} />
									</button>
									<button
										type="button"
										className={
											sidebarViewMode === "tags" ? "segBtn active" : "segBtn"
										}
										onClick={() => setSidebarViewMode("tags")}
										title="Tags"
									>
										<Tags size={14} />
									</button>
								</div>
							</div>

							<AnimatePresence mode="wait">
								{sidebarViewMode === "files" ? (
									<motion.div
										key="files"
										initial={{ opacity: 0, x: -20 }}
										animate={{ opacity: 1, x: 0 }}
										exit={{ opacity: 0, x: -20 }}
										transition={{ duration: 0.2 }}
										className="sidebarSectionContent"
									>
										<FileTreePane
											rootEntries={rootEntries}
											childrenByDir={childrenByDir}
											expandedDirs={expandedDirs}
											activeFilePath={activeFilePath}
											onToggleDir={toggleDir}
											onSelectDir={(p) => void loadAndBuildFolderView(p)}
											onOpenFile={(p) => void openFile(p)}
											onNewFile={onNewFile}
											summariesByParentDir={dirSummariesByParent}
										/>
									</motion.div>
								) : (
									<motion.div
										key="tags"
										initial={{ opacity: 0, x: 20 }}
										animate={{ opacity: 1, x: 0 }}
										exit={{ opacity: 0, x: 20 }}
										transition={{ duration: 0.2 }}
										className="sidebarSectionContent"
									>
										{tagsError ? (
											<div className="searchError">{tagsError}</div>
										) : null}
										<TagsPane
											tags={tags}
											onSelectTag={(t) => void loadAndBuildTagView(t)}
											onRefresh={() => void refreshTags()}
										/>
									</motion.div>
								)}
							</AnimatePresence>
						</div>
					</>
				)}
			</aside>

			{/* Main Canvas Area */}
			<main className="mainArea">
				{/* Main Toolbar */}
				<div
					className="mainToolbar"
					data-tauri-drag-region
					onMouseDown={onWindowDragMouseDown}
				>
					<div className="mainToolbarLeft">
						{activeViewDoc?.kind === "folder" ? (
							<FolderBreadcrumb
								dir={activeViewDoc.selector || ""}
								onOpenFolder={(d) => void loadAndBuildFolderView(d)}
							/>
						) : (
							<span className="canvasTitle">
								{activeViewDoc?.title || "Canvas"}
							</span>
						)}
					</div>
					<div className="mainToolbarRight">
						<MotionIconButton
							type="button"
							active={showAiPanel}
							onClick={() => setShowAiPanel(!showAiPanel)}
							title="Toggle AI assistant"
						>
							<Sparkles size={16} />
						</MotionIconButton>
					</div>
				</div>

				{activeViewDoc?.kind === "folder" ? (
					<FolderShelf
						subfolders={folderShelfSubfolders}
						summaries={folderShelfSummaries}
						recents={folderShelfRecents}
						onOpenFolder={(d) => void loadAndBuildFolderView(d)}
						onOpenMarkdown={(p) => void openMarkdownFileInCanvas(p)}
						onOpenNonMarkdown={(p) => {
							setActiveFilePath(p);
							void openNonMarkdownExternally(p);
						}}
						onFocusNode={(nodeId) => {
							setCanvasCommand({
								id: crypto.randomUUID(),
								kind: "focus_node",
								nodeId,
							});
						}}
					/>
				) : null}

				{/* Main Content */}
				<div className="canvasWrapper">
					<Suspense
						fallback={<div className="canvasEmpty">Loading canvas…</div>}
					>
						<CanvasPane
							doc={activeViewDoc ? asCanvasDocLike(activeViewDoc) : null}
							onSave={onSaveView}
							onOpenNote={(p) => void openFile(p)}
							onOpenFolder={(dir) => void loadAndBuildFolderView(dir)}
							activeNoteId={activeNoteId}
							activeNoteTitle={activeNoteTitle}
							vaultPath={vaultPath}
							onSelectionChange={onCanvasSelectionChange}
							externalCommand={canvasCommand}
							onExternalCommandHandled={(id) => {
								setCanvasCommand((prev) => (prev?.id === id ? null : prev));
							}}
						/>
					</Suspense>

					{/* Floating AI Panel */}
					<MotionFloatingPanel
						isOpen={showAiPanel}
						className="floatingPanel aiPanel"
					>
						<div className="floatingPanelHeader">
							<div className="floatingPanelTitle">
								<Sparkles size={14} />
								AI Assistant
							</div>
							<MotionIconButton
								type="button"
								size="sm"
								onClick={() => setShowAiPanel(false)}
								title="Close"
							>
								<X size={14} />
							</MotionIconButton>
						</div>
						<div className="floatingPanelBody">
							<AIPane
								activeNoteId={activeNoteId}
								activeNoteTitle={activeNoteTitle}
								activeNoteMarkdown={null}
								selectedCanvasNodes={selectedCanvasNodes}
								canvasDoc={
									activeViewDoc ? asCanvasDocLike(activeViewDoc) : null
								}
								onApplyToActiveNote={async (markdown) => {
									if (!activeNoteId) return;
									setCanvasCommand({
										id: crypto.randomUUID(),
										kind: "apply_note_markdown",
										noteId: activeNoteId,
										markdown,
									});
								}}
								onCreateNoteFromMarkdown={createFileFromMarkdown}
								onAddCanvasNoteNode={addCanvasNoteNode}
								onAddCanvasTextNode={addCanvasTextNode}
							/>
						</div>
					</MotionFloatingPanel>
				</div>
			</main>

			{/* Error Toast */}
			<AnimatePresence>
				{error && <div className="appError">{error}</div>}
			</AnimatePresence>
		</div>
	);
}

export default App;
