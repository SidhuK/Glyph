import { open, save } from "@tauri-apps/plugin-dialog";
import { AnimatePresence, motion } from "motion/react";
import {
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
import { FilePreviewPane } from "./components/FilePreviewPane";
import { FileTreePane } from "./components/FileTreePane";
import {
	FileText,
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
import { MarkdownFileEditor } from "./components/MarkdownFileEditor";
import { MotionFloatingPanel, MotionIconButton } from "./components/MotionUI";
import { SearchPane } from "./components/SearchPane";
import { TagsPane } from "./components/TagsPane";
import { loadSettings, setCurrentVaultPath } from "./lib/settings";
import {
	type AppInfo,
	type FsEntry,
	type NoteMeta,
	type SearchResult,
	type TagCount,
	TauriInvokeError,
	type TextFileDoc,
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
	const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
		() => new Set(),
	);
	const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
	const [activeFileDoc, setActiveFileDoc] = useState<TextFileDoc | null>(null);
	const [editorValue, setEditorValue] = useState<string>("");
	const [isEditorDirty, setIsEditorDirty] = useState(false);
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
	const [mainView, setMainView] = useState<"files" | "canvas">("files");
	const fileLoadSeq = useRef(0);
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

	const activeFileTitle = useMemo(() => {
		if (!activeFilePath) return null;
		const name = activeFilePath.split("/").pop();
		return name || activeFilePath;
	}, [activeFilePath]);

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
				setVaultPath(settings.currentVaultPath);
				setRecentVaults(settings.recentVaultPaths);

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
								setMainView("canvas");
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
			setMainView("canvas");

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
			setMainView("canvas");

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
			setMainView("canvas");

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
				setRecentVaults((prev) =>
					[info.root, ...prev.filter((p) => p !== info.root)].slice(0, 20),
				);

				setRootEntries([]);
				setChildrenByDir({});
				setExpandedDirs(new Set());
				setActiveFilePath(null);
				setActiveFileDoc(null);
				setEditorValue("");
				setIsEditorDirty(false);

				setActiveViewPath(null);
				setActiveViewDoc(null);
				setSearchQuery("");
				setSearchResults([]);
				setSearchError("");
				setTags([]);
				setTagsError("");

				const entries = await invoke("vault_list_dir", {});
				setRootEntries(entries);
				setMainView("canvas");
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
		const entries = await invoke(
			"vault_list_dir",
			dirPath ? { dir: dirPath } : {},
		);
		setChildrenByDir((prev) => ({ ...prev, [dirPath]: entries }));
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

	const saveActiveFile = useCallback(async () => {
		if (!activeFilePath) return;
		const baseMtime = activeFileDoc?.mtime_ms ?? null;
		const res = await invoke("vault_write_text", {
			path: activeFilePath,
			text: editorValue,
			base_mtime_ms: baseMtime,
		});
		setActiveFileDoc((prev) =>
			prev ? { ...prev, etag: res.etag, mtime_ms: res.mtime_ms } : prev,
		);
		setIsEditorDirty(false);
	}, [activeFileDoc?.mtime_ms, activeFilePath, editorValue]);

	const openFile = useCallback(
		async (relPath: string) => {
			if (relPath === activeFilePath) return;
			if (isEditorDirty) {
				const shouldSave = window.confirm(
					"Save changes before opening another file?",
				);
				if (shouldSave) {
					try {
						await saveActiveFile();
					} catch (e) {
						setError(e instanceof Error ? e.message : String(e));
						return;
					}
				} else {
					const discard = window.confirm("Discard unsaved changes?");
					if (!discard) return;
				}
			}
			setActiveFilePath(relPath);
			setMainView("files");
		},
		[activeFilePath, isEditorDirty, saveActiveFile],
	);

	useEffect(() => {
		if (!activeFilePath) {
			setActiveFileDoc(null);
			setEditorValue("");
			setIsEditorDirty(false);
			return;
		}
		const ext = activeFilePath.split(".").pop()?.toLowerCase() ?? "";
		const isText =
			ext === "md" ||
			ext === "txt" ||
			ext === "json" ||
			ext === "yaml" ||
			ext === "yml" ||
			ext === "html" ||
			ext === "css" ||
			ext === "ts" ||
			ext === "tsx" ||
			ext === "js";
		if (!isText) {
			setActiveFileDoc(null);
			setEditorValue("");
			setIsEditorDirty(false);
			return;
		}
		const seq = ++fileLoadSeq.current;
		setActiveFileDoc(null);
		(async () => {
			try {
				const doc = await invoke("vault_read_text", { path: activeFilePath });
				if (seq !== fileLoadSeq.current) return;
				setActiveFileDoc(doc);
				setEditorValue(doc.text);
				setIsEditorDirty(false);
			} catch (e) {
				if (seq !== fileLoadSeq.current) return;
				setError(e instanceof Error ? e.message : String(e));
			}
		})();
	}, [activeFilePath]);

	const reloadActiveFileFromDisk = useCallback(async () => {
		if (!activeFilePath) return;
		const doc = await invoke("vault_read_text", { path: activeFilePath });
		setActiveFileDoc(doc);
		setEditorValue(doc.text);
		setIsEditorDirty(false);
	}, [activeFilePath]);

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
			setActiveFilePath(rel);
			setMainView("files");
			const now = new Date().toISOString();
			return {
				id: rel,
				title: title || rel.split("/").pop() || "Untitled",
				created: now,
				updated: now,
			};
		},
		[vaultPath],
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
		setActiveFilePath(rel);
		setMainView("files");
	}, [vaultPath]);

	const onChangeEditorValue = useCallback((next: string) => {
		setEditorValue(next);
		setIsEditorDirty(true);
	}, []);

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
			{/* Left Sidebar - Project Navigation */}
			<aside
				className={`sidebar ${sidebarCollapsed ? "sidebarCollapsed" : ""}`}
			>
				<div className="sidebarHeader" data-tauri-drag-region>
					{!sidebarCollapsed && (
						<>
							<div className="sidebarBrand">
								<span className="brandIcon">◈</span>
								<span className="brandName">Tether</span>
							</div>
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
						</>
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
										void openFile(id);
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

						{/* Recent vaults - collapsed by default */}
						{recentVaults.length > 0 && (
							<details className="sidebarSection recentVaults">
								<summary className="recentVaultsSummary">Recent vaults</summary>
								<ul className="recentVaultsList">
									{recentVaults.slice(0, 5).map((p) => (
										<li key={p} className="recentVaultsItem mono">
											{p.split("/").pop()}
										</li>
									))}
								</ul>
							</details>
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
				<div className="mainToolbar" data-tauri-drag-region>
					<div className="mainToolbarLeft">
						<span className="canvasTitle">
							{mainView === "canvas"
								? activeViewDoc?.title || "Canvas"
								: activeFileTitle || "No file selected"}
						</span>
					</div>
					<div className="mainToolbarRight">
						<MotionIconButton
							type="button"
							active={mainView === "canvas"}
							onClick={() =>
								setMainView((v) => (v === "canvas" ? "files" : "canvas"))
							}
							title={mainView === "canvas" ? "Show file editor" : "Show canvas"}
						>
							{mainView === "canvas" ? (
								<FileText size={16} />
							) : (
								<span className="brandIcon">◈</span>
							)}
						</MotionIconButton>
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

				{/* Main Content */}
				<div className="canvasWrapper">
					{mainView === "canvas" ? (
						<Suspense
							fallback={<div className="canvasEmpty">Loading canvas…</div>}
						>
							<CanvasPane
								doc={activeViewDoc ? asCanvasDocLike(activeViewDoc) : null}
								onSave={onSaveView}
								onOpenNote={(p) => void openFile(p)}
								onOpenFolder={(dir) => void loadAndBuildFolderView(dir)}
								activeNoteId={activeFilePath}
								activeNoteTitle={activeFileTitle}
								vaultPath={vaultPath}
								onSelectionChange={onCanvasSelectionChange}
								externalCommand={canvasCommand}
								onExternalCommandHandled={(id) => {
									setCanvasCommand((prev) => (prev?.id === id ? null : prev));
								}}
							/>
						</Suspense>
					) : (
						<>
							{activeFileDoc ? (
								<MarkdownFileEditor
									doc={activeFileDoc}
									value={editorValue}
									isDirty={isEditorDirty}
									onChange={onChangeEditorValue}
									onSave={saveActiveFile}
									onReloadFromDisk={reloadActiveFileFromDisk}
								/>
							) : (
								<FilePreviewPane
									vaultPath={vaultPath}
									relPath={activeFilePath}
								/>
							)}
						</>
					)}

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
								activeNoteId={activeFilePath}
								activeNoteTitle={activeFileTitle}
								activeNoteMarkdown={activeFileDoc ? editorValue : null}
								selectedCanvasNodes={selectedCanvasNodes}
								canvasDoc={
									activeViewDoc ? asCanvasDocLike(activeViewDoc) : null
								}
								onApplyToActiveNote={async (markdown) => {
									setEditorValue(markdown);
									setIsEditorDirty(true);
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
