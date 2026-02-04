import { join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
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
import type { SelectedCanvasNode } from "./components/AIPane";
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
	Settings,
	Sparkles,
	Tags,
} from "./components/Icons";
import { MotionIconButton } from "./components/MotionUI";
import { SearchPane } from "./components/SearchPane";
import { TagsPane } from "./components/TagsPane";
import { AISidebar } from "./components/ai/AISidebar";
import {
	clearCurrentVaultPath,
	loadSettings,
	setAiSidebarWidth as persistAiSidebarWidth,
	setCurrentVaultPath,
} from "./lib/settings";
import {
	type AppInfo,
	type DirChildSummary,
	type FsEntry,
	type RecentEntry,
	type SearchResult,
	type TagCount,
	TauriInvokeError,
	invoke,
} from "./lib/tauri";
import {
	NeedsIndexRebuildError,
	type ViewDoc,
	type ViewRef,
	asCanvasDocLike,
	buildFolderViewDoc,
	buildSearchViewDoc,
	buildTagViewDoc,
	loadViewDoc,
	saveViewDoc,
} from "./lib/views";
import { openSettingsWindow } from "./lib/windows";

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
	const [recentVaults, setRecentVaults] = useState<string[]>([]);
	const [rootEntries, setRootEntries] = useState<FsEntry[]>([]);
	const [childrenByDir, setChildrenByDir] = useState<
		Record<string, FsEntry[] | undefined>
	>({});
	const [dirSummariesByParent, setDirSummariesByParent] = useState<
		Record<string, DirChildSummary[] | undefined>
	>({});
	const dirSummariesInFlightRef = useRef(new Set<string>());
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
	const [aiSidebarOpen, setAiSidebarOpen] = useState(false);
	const [aiSidebarWidth, setAiSidebarWidth] = useState(420);
	const aiSidebarWidthRef = useRef(420);
	const aiSidebarResizingRef = useRef(false);
	const aiSidebarResizeStartRef = useRef<{ x: number; width: number } | null>(
		null,
	);
	const [showSearch, setShowSearch] = useState(false);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [sidebarViewMode, setSidebarViewMode] = useState<"files" | "tags">(
		"files",
	);

	const [folderShelfSubfolders, setFolderShelfSubfolders] = useState<FsEntry[]>(
		[],
	);
	const [folderShelfRecents, setFolderShelfRecents] = useState<RecentEntry[]>(
		[],
	);
	const folderShelfCacheRef = useRef(
		new Map<
			string,
			{
				subfolders: FsEntry[];
				recents: RecentEntry[];
			}
		>(),
	);

	const [canvasLoadingMessage, setCanvasLoadingMessage] = useState<string>("");
	const [isIndexing, setIsIndexing] = useState(false);
	const indexRebuildPromiseRef = useRef<Promise<void> | null>(null);
	const vaultSessionRef = useRef(0);

	const activeViewDocRef = useRef<ViewDoc | null>(null);
	const activeViewPathRef = useRef<string | null>(null);

	useEffect(() => {
		aiSidebarWidthRef.current = aiSidebarWidth;
	}, [aiSidebarWidth]);

	useEffect(() => {
		activeViewDocRef.current = activeViewDoc;
	}, [activeViewDoc]);

	useEffect(() => {
		activeViewPathRef.current = activeViewPath;
	}, [activeViewPath]);

	useEffect(() => {
		void vaultPath;
		vaultSessionRef.current += 1;
		indexRebuildPromiseRef.current = null;
		setCanvasLoadingMessage("");
		setIsIndexing(false);
	}, [vaultPath]);

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
				setAiSidebarWidth(settings.ui.aiSidebarWidth ?? 420);
				setFolderShelfSubfolders([]);
				setFolderShelfRecents([]);
				setDirSummariesByParent({});
				setRecentVaults(settings.recentVaults);
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
							void (async () => {
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
							})();
						} catch {
							// ignore
						}
						try {
							// Kick indexing in the background; the UI can still render cached views.
							void startIndexRebuild();
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
							if (!cancelled) await loadAndBuildFolderView(onlyDir);
						} catch {
							// ignore
						}
					} catch {
						if (!cancelled) {
							setVaultSchemaVersion(null);
							setVaultPath(null);
						}
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

	const startIndexRebuild = useCallback(async (): Promise<void> => {
		if (indexRebuildPromiseRef.current) return indexRebuildPromiseRef.current;

		const session = vaultSessionRef.current;
		setIsIndexing(true);
		const p = (async () => {
			try {
				await invoke("index_rebuild");
			} catch {
				// Index is derived; navigation can proceed without it.
			} finally {
				indexRebuildPromiseRef.current = null;
				if (vaultSessionRef.current === session) setIsIndexing(false);
			}
		})();
		indexRebuildPromiseRef.current = p;

		void p.then(() => {
			if (vaultSessionRef.current === session) void refreshTags();
		});

		return p;
	}, [refreshTags]);

	const loadAndBuildFolderView = useCallback(
		async (dir: string) => {
			setError("");
			setCanvasLoadingMessage("");
			try {
				const view: ViewRef = { kind: "folder", dir };

				const loaded = await loadViewDoc(view);
				if (loaded.doc) {
					setActiveViewPath(loaded.path);
					setActiveViewDoc(loaded.doc);
				}

				let existingDoc = loaded.doc;
				const buildAndSet = async () => {
					const built = await buildFolderViewDoc(
						dir,
						{ recursive: false, limit: 500 },
						existingDoc,
					);
					if (!existingDoc || built.changed) {
						await saveViewDoc(loaded.path, built.doc);
					}
					existingDoc = built.doc;
					setActiveViewPath(loaded.path);
					setActiveViewDoc(built.doc);
				};

				try {
					await buildAndSet();
				} catch (e) {
					if (e instanceof NeedsIndexRebuildError) {
						if (loaded.doc) {
							void (async () => {
								await startIndexRebuild();
								try {
									await buildAndSet();
								} catch {
									// ignore
								}
							})();
							return;
						}
						setCanvasLoadingMessage("Indexing vault…");
						await startIndexRebuild();
						setCanvasLoadingMessage("");
						await buildAndSet();
						return;
					}
					throw e;
				}
			} catch (e) {
				setCanvasLoadingMessage("");
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[startIndexRebuild],
	);

	const loadAndBuildSearchView = useCallback(
		async (query: string) => {
			setError("");
			setCanvasLoadingMessage("");
			try {
				const q = query.trim();
				if (!q) return;
				const view: ViewRef = { kind: "search", query: q };

				const loaded = await loadViewDoc(view);
				if (loaded.doc) {
					setActiveViewPath(loaded.path);
					setActiveViewDoc(loaded.doc);
				}

				let existingDoc = loaded.doc;
				const buildAndSet = async () => {
					const built = await buildSearchViewDoc(
						q,
						{ limit: 200 },
						existingDoc,
					);
					if (!existingDoc || built.changed) {
						await saveViewDoc(loaded.path, built.doc);
					}
					existingDoc = built.doc;
					setActiveViewPath(loaded.path);
					setActiveViewDoc(built.doc);
				};

				try {
					await buildAndSet();
				} catch (e) {
					if (e instanceof NeedsIndexRebuildError) {
						if (loaded.doc) {
							void (async () => {
								await startIndexRebuild();
								try {
									await buildAndSet();
								} catch {
									// ignore
								}
							})();
							return;
						}
						setCanvasLoadingMessage("Indexing vault…");
						await startIndexRebuild();
						setCanvasLoadingMessage("");
						await buildAndSet();
						return;
					}
					throw e;
				}
			} catch (e) {
				setCanvasLoadingMessage("");
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[startIndexRebuild],
	);

	const loadAndBuildTagView = useCallback(
		async (tag: string) => {
			setError("");
			setCanvasLoadingMessage("");
			try {
				const t = tag.trim();
				if (!t) return;
				const view: ViewRef = { kind: "tag", tag: t };

				const loaded = await loadViewDoc(view);
				if (loaded.doc) {
					setActiveViewPath(loaded.path);
					setActiveViewDoc(loaded.doc);
				}

				let existingDoc = loaded.doc;
				const buildAndSet = async () => {
					const built = await buildTagViewDoc(t, { limit: 500 }, existingDoc);
					if (!existingDoc || built.changed) {
						await saveViewDoc(loaded.path, built.doc);
					}
					existingDoc = built.doc;
					setActiveViewPath(loaded.path);
					setActiveViewDoc(built.doc);
				};

				try {
					await buildAndSet();
				} catch (e) {
					if (e instanceof NeedsIndexRebuildError) {
						if (loaded.doc) {
							void (async () => {
								await startIndexRebuild();
								try {
									await buildAndSet();
								} catch {
									// ignore
								}
							})();
							return;
						}
						setCanvasLoadingMessage("Indexing vault…");
						await startIndexRebuild();
						setCanvasLoadingMessage("");
						await buildAndSet();
						return;
					}
					throw e;
				}
			} catch (e) {
				setCanvasLoadingMessage("");
				setError(e instanceof Error ? e.message : String(e));
			}
		},
		[startIndexRebuild],
	);

	const resetVaultUiState = useCallback(() => {
		setRootEntries([]);
		setChildrenByDir({});
		setDirSummariesByParent({});
		setExpandedDirs(new Set());
		setActiveFilePath(null);

		setActiveViewPath(null);
		setActiveViewDoc(null);
		setShowSearch(false);
		setSearchQuery("");
		setSearchResults([]);
		setSearchError("");
		setTags([]);
		setTagsError("");

		folderShelfCacheRef.current.clear();
		setFolderShelfSubfolders([]);
		setFolderShelfRecents([]);
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
				setRecentVaults((prev) => {
					const next = [info.root, ...prev.filter((p) => p !== info.root)];
					return next.slice(0, 20);
				});
				setVaultPath(info.root);
				setVaultSchemaVersion(info.schema_version);

				resetVaultUiState();

				const entries = await invoke("vault_list_dir", {});
				setRootEntries(entries);
				try {
					void (async () => {
						try {
							const summaries = await invoke("vault_dir_children_summary", {
								dir: null,
								preview_limit: 1,
							});
							setDirSummariesByParent((prev) => ({ ...prev, "": summaries }));
						} catch {
							// ignore
						}
					})();
				} catch {
					// ignore
				}
				const onlyDir =
					entries.filter((e) => e.kind === "dir").length === 1 &&
					entries.filter((e) => e.kind === "file").length === 0
						? (entries.find((e) => e.kind === "dir")?.rel_path ?? "")
						: "";
				await loadAndBuildFolderView(onlyDir);

				void startIndexRebuild();
				void refreshTags();
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				setError(message);
			}
		},
		[loadAndBuildFolderView, refreshTags, resetVaultUiState, startIndexRebuild],
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
			setFolderShelfRecents(cached.recents);
		} else {
			setFolderShelfSubfolders([]);
			setFolderShelfRecents([]);
		}

		let cancelled = false;
		(async () => {
			try {
				const [entries, recents] = await Promise.all([
					invoke("vault_list_dir", { dir: dir || null }),
					invoke("vault_dir_recent_entries", { dir: dir || null, limit: 5 }),
				]);
				if (cancelled) return;
				const subfolders = entries
					.filter((e) => e.kind === "dir")
					.sort((a, b) =>
						a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
					);
				const next = { subfolders, recents };
				folderShelfCacheRef.current.set(dir, next);
				setFolderShelfSubfolders(next.subfolders);
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

	const closeVault = useCallback(async () => {
		setError("");
		try {
			await invoke("vault_close");
			await clearCurrentVaultPath();
			setVaultPath(null);
			setVaultSchemaVersion(null);
			setAiSidebarOpen(false);
			resetVaultUiState();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(message);
		}
	}, [resetVaultUiState]);

	useEffect(() => {
		let unlistenOpen: (() => void) | null = null;
		let unlistenCreate: (() => void) | null = null;
		let unlistenClose: (() => void) | null = null;

		void (async () => {
			unlistenOpen = await listen("menu:open_vault", () => {
				void onOpenVault();
			});
			unlistenCreate = await listen("menu:create_vault", () => {
				void onCreateVault();
			});
			unlistenClose = await listen("menu:close_vault", () => {
				void closeVault();
			});
		})();

		return () => {
			unlistenOpen?.();
			unlistenCreate?.();
			unlistenClose?.();
		};
	}, [closeVault, onCreateVault, onOpenVault]);

	const loadDir = useCallback(async (dirPath: string) => {
		const entries = await invoke(
			"vault_list_dir",
			dirPath ? { dir: dirPath } : {},
		);
		setChildrenByDir((prev) => ({ ...prev, [dirPath]: entries }));

		if (dirSummariesInFlightRef.current.has(dirPath)) return;
		dirSummariesInFlightRef.current.add(dirPath);

		void (async () => {
			try {
				const summaries = await invoke("vault_dir_children_summary", {
					dir: dirPath || null,
					preview_limit: 1,
				});
				setDirSummariesByParent((prev) => ({ ...prev, [dirPath]: summaries }));
			} catch {
				// ignore: counts are convenience UI
			} finally {
				dirSummariesInFlightRef.current.delete(dirPath);
			}
		})();
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
		<div className={`appShell ${aiSidebarOpen ? "aiSidebarOpen" : ""}`}>
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
							{vaultPath && (
								<MotionIconButton
									type="button"
									size="sm"
									onClick={() => setShowSearch(!showSearch)}
									title="Search"
									active={showSearch}
								>
									<Search size={14} />
								</MotionIconButton>
							)}
							<MotionIconButton
								type="button"
								size="sm"
								onClick={onCreateVault}
								title="Create vault"
							>
								<FolderPlus size={14} />
							</MotionIconButton>
							<MotionIconButton
								type="button"
								size="sm"
								onClick={onOpenVault}
								title="Open vault"
							>
								<FolderOpen size={14} />
							</MotionIconButton>
							<MotionIconButton
								type="button"
								size="sm"
								onClick={() => void openSettingsWindow("general")}
								title="Settings"
							>
								<Settings size={14} />
							</MotionIconButton>
						</div>
					)}
					<MotionIconButton
						type="button"
						size="sm"
						onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
						title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
					>
						{sidebarCollapsed ? (
							<PanelLeftOpen size={14} />
						) : (
							<PanelLeftClose size={14} />
						)}
					</MotionIconButton>
				</div>

				{!sidebarCollapsed && (
					<>
						{vaultPath ? (
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
								<div className="sidebarSection vaultInfo">
									<div className="vaultPath mono">
										{vaultPath.split("/").pop()}
									</div>
									<div className="vaultMeta">
										{vaultSchemaVersion ? `v${vaultSchemaVersion}` : ""}
										{isIndexing ? " • indexing" : ""}
									</div>
								</div>

								{/* File Tree / Tags Toggle */}
								<div className="sidebarSection sidebarSectionGrow">
									<div className="sidebarSectionHeader">
										<div className="sidebarSectionToggle">
											<button
												type="button"
												className={
													sidebarViewMode === "files"
														? "segBtn active"
														: "segBtn"
												}
												onClick={() => setSidebarViewMode("files")}
												title="Files"
											>
												<Files size={14} />
											</button>
											<button
												type="button"
												className={
													sidebarViewMode === "tags"
														? "segBtn active"
														: "segBtn"
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
												initial={{ x: -20 }}
												animate={{ x: 0 }}
												exit={{ x: -20 }}
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
												initial={{ x: 20 }}
												animate={{ x: 0 }}
												exit={{ x: 20 }}
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
						) : (
							<div className="sidebarSection sidebarEmpty">
								<div className="sidebarEmptyTitle">No vault open</div>
								<div className="sidebarEmptyHint">
									Open or create a vault to get started.
								</div>
							</div>
						)}

						<div className="sidebarFooter">
							<button
								type="button"
								className="sidebarFooterBtn"
								onClick={() => void openSettingsWindow("general")}
							>
								<Settings size={16} />
								<span>Settings</span>
							</button>
						</div>
					</>
				)}
			</aside>

			{/* Main Canvas Area */}
			<main className={`mainArea ${vaultPath ? "" : "mainAreaWelcome"}`}>
				{vaultPath ? (
					<>
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
									active={aiSidebarOpen}
									onClick={() => setAiSidebarOpen(!aiSidebarOpen)}
									title="Toggle AI assistant"
								>
									<Sparkles size={16} />
								</MotionIconButton>
							</div>
						</div>

						{activeViewDoc?.kind === "folder" ? (
							<FolderShelf
								subfolders={folderShelfSubfolders}
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
							<div className="canvasPaneHost">
								<Suspense
									fallback={<div className="canvasEmpty">Loading canvas…</div>}
								>
									{canvasLoadingMessage ? (
										<div className="canvasEmpty">{canvasLoadingMessage}</div>
									) : (
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
												setCanvasCommand((prev) =>
													prev?.id === id ? null : prev,
												);
											}}
										/>
									)}
								</Suspense>
							</div>
						</div>
					</>
				) : (
					<>
						<div
							className="mainToolbar"
							data-tauri-drag-region
							onMouseDown={onWindowDragMouseDown}
						>
							<div className="mainToolbarLeft">
								<span className="canvasTitle">Welcome</span>
							</div>
						</div>
						<div className="welcomeScreen">
							<div className="welcomeHero">
								<div className="welcomeTitle">
									{info?.name ?? "Tether"}
								</div>
								<div className="welcomeSubtitle">
									Open or create a vault to start building your workspace.
								</div>
							</div>
							<div className="welcomeActions">
								<button type="button" className="primary" onClick={onOpenVault}>
									Open Vault
								</button>
								<button type="button" className="ghost" onClick={onCreateVault}>
									Create Vault
								</button>
							</div>
							<div className="welcomeRecents">
								<div className="welcomeSectionTitle">Recent vaults</div>
								{recentVaults.length ? (
									<div className="welcomeRecentList">
										{recentVaults.map((p) => (
											<button
												key={p}
												type="button"
												className="welcomeRecentItem"
												onClick={() => void applyVaultSelection(p, "open")}
											>
												<span className="welcomeRecentName">
													{p.split("/").pop() ?? p}
												</span>
												<span className="welcomeRecentPath mono">{p}</span>
											</button>
										))}
									</div>
								) : (
									<div className="welcomeEmpty">No recent vaults yet.</div>
								)}
							</div>
						</div>
					</>
				)}
			</main>

			{vaultPath && (
				<>
					<div
						className="rightSidebarResizer"
						aria-hidden={!aiSidebarOpen}
						data-window-drag-ignore
						onMouseDown={(e) => {
							if (!aiSidebarOpen) return;
							if (e.button !== 0) return;
							e.preventDefault();
							aiSidebarResizingRef.current = true;
							aiSidebarResizeStartRef.current = {
								x: e.clientX,
								width: aiSidebarWidth,
							};

							const onMove = (evt: globalThis.MouseEvent) => {
								const start = aiSidebarResizeStartRef.current;
								if (!aiSidebarResizingRef.current || !start) return;
								const delta = start.x - evt.clientX;
								const next = Math.max(340, Math.min(520, start.width + delta));
								setAiSidebarWidth(next);
							};

							const onUp = () => {
								if (!aiSidebarResizingRef.current) return;
								aiSidebarResizingRef.current = false;
								aiSidebarResizeStartRef.current = null;
								window.removeEventListener("mousemove", onMove);
								window.removeEventListener("mouseup", onUp);
								void persistAiSidebarWidth(aiSidebarWidthRef.current);
							};

							window.addEventListener("mousemove", onMove);
							window.addEventListener("mouseup", onUp, { once: true });
						}}
					/>

					<AISidebar
						isOpen={aiSidebarOpen}
						width={aiSidebarWidth}
						onClose={() => setAiSidebarOpen(false)}
						onOpenSettings={() => {
							// wired in a later step
							setAiSidebarOpen(true);
						}}
						activeNoteId={activeNoteId}
						activeNoteTitle={activeNoteTitle}
						activeNoteMarkdown={null}
						selectedCanvasNodes={selectedCanvasNodes}
						canvasDoc={activeViewDoc ? asCanvasDocLike(activeViewDoc) : null}
					/>
				</>
			)}

			{/* Error Toast */}
			<AnimatePresence>
				{error && <div className="appError">{error}</div>}
			</AnimatePresence>
		</div>
	);
}

export default App;
