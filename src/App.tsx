import { open, save } from "@tauri-apps/plugin-dialog";
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
import { listen } from "@tauri-apps/api/event";
import { AIPane, type SelectedCanvasNode } from "./components/AIPane";
import type {
	CanvasExternalCommand,
	CanvasNode,
} from "./components/CanvasPane";
import { CanvasesPane } from "./components/CanvasesPane";
import { FileTreePane } from "./components/FileTreePane";
import {
	FolderOpen,
	FolderPlus,
	PanelLeftClose,
	PanelLeftOpen,
	PanelRightClose,
	PanelRightOpen,
	Search,
	Sparkles,
	X,
} from "./components/Icons";
import {
	AnimatePresence,
	MotionFloatingPanel,
	MotionIconButton,
} from "./components/MotionUI";
import { MarkdownFileEditor } from "./components/MarkdownFileEditor";
import { SearchPane } from "./components/SearchPane";
import { loadSettings, setCurrentVaultPath } from "./lib/settings";
import {
	type AppInfo,
	type CanvasDoc,
	type CanvasMeta,
	type FsEntry,
	type TextFileDoc,
	type SearchResult,
	TauriInvokeError,
	invoke,
} from "./lib/tauri";

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
	const [canvases, setCanvases] = useState<CanvasMeta[]>([]);
	const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
	const [activeCanvasDoc, setActiveCanvasDoc] = useState<CanvasDoc | null>(
		null,
	);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState("");
	const [selectedCanvasNodes, setSelectedCanvasNodes] = useState<
		SelectedCanvasNode[]
	>([]);
	const [canvasCommand, setCanvasCommand] =
		useState<CanvasExternalCommand | null>(null);
	const [showAiPanel, setShowAiPanel] = useState(false);
	const [showSearch, setShowSearch] = useState(false);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const fileLoadSeq = useRef(0);
	const canvasLoadSeq = useRef(0);

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
						const opened = await invoke("vault_open", {
							path: settings.currentVaultPath,
						});
						if (!cancelled) setVaultSchemaVersion(opened.schema_version);
						try {
							const entries = await invoke("vault_list_dir", {});
							if (!cancelled) setRootEntries(entries);
						} catch {
							// ignore
						}
						try {
							await invoke("index_rebuild");
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

				setCanvases([]);
				setActiveCanvasId(null);
				setActiveCanvasDoc(null);
				setSearchQuery("");
				setSearchResults([]);
				setSearchError("");

				const [entries, canvasesList] = await Promise.all([
					invoke("vault_list_dir", {}),
					invoke("canvas_list"),
				]);
				setRootEntries(entries);
				setCanvases(canvasesList);
				if (canvasesList[0]?.id) setActiveCanvasId(canvasesList[0].id);

				try {
					await invoke("index_rebuild");
				} catch {
					// Index is derived; search UI can still function as "empty" until rebuilt.
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				setError(message);
			}
		},
		[],
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

	const refreshNotes = useCallback(async () => {
		if (!vaultPath) return;
		const list = await invoke("notes_list");
		setNotes(list);
	}, [vaultPath]);

	useEffect(() => {
		activeNoteIdRef.current = activeNoteId;
	}, [activeNoteId]);

	useEffect(() => {
		notesRef.current = notes;
	}, [notes]);

	useEffect(() => {
		if (!vaultPath) return;
		let cancelled = false;
		(async () => {
			try {
				const list = await invoke("notes_list");
				if (cancelled) return;
				setNotes(list);
				if (!activeNoteIdRef.current && list[0]?.id)
					setActiveNoteId(list[0].id);
			} catch (e) {
				if (!cancelled) setError(e instanceof Error ? e.message : String(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [vaultPath]);

	useEffect(() => {
		if (!vaultPath) return;
		let cancelled = false;
		(async () => {
			try {
				const list = await invoke("canvas_list");
				if (cancelled) return;
				setCanvases(list);
				if (!activeCanvasId && list[0]?.id) setActiveCanvasId(list[0].id);
			} catch (e) {
				if (!cancelled) setError(e instanceof Error ? e.message : String(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [activeCanvasId, vaultPath]);

	useEffect(() => {
		if (!activeNoteId) {
			setActiveDoc(null);
			setBacklinks([]);
			return;
		}
		const seq = ++noteLoadSeq.current;
		setActiveDoc(null);
		(async () => {
			try {
				const doc = await invoke("note_read", { id: activeNoteId });
				if (seq !== noteLoadSeq.current) return;
				setActiveDoc(doc);
			} catch (e) {
				if (seq !== noteLoadSeq.current) return;
				setError(e instanceof Error ? e.message : String(e));
			}
		})();
	}, [activeNoteId]);

	useEffect(() => {
		if (!vaultPath || !activeNoteId) return;
		let cancelled = false;
		setBacklinksError("");
		(async () => {
			try {
				const list = await invoke("backlinks", { note_id: activeNoteId });
				if (!cancelled) setBacklinks(list);
			} catch (e) {
				if (!cancelled)
					setBacklinksError(e instanceof Error ? e.message : String(e));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [activeNoteId, vaultPath]);

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

	useEffect(() => {
		let unlisten: (() => void) | null = null;
		(async () => {
			try {
				unlisten = await listen<{ id: string }>(
					"notes:external_changed",
					(evt) => {
						if (evt.payload.id !== activeNoteIdRef.current) return;
						if (
							lastSavedNoteIdRef.current === evt.payload.id &&
							Date.now() - lastSavedAtMsRef.current < 1500
						)
							return;
						setError(
							"Note changed on disk (external edit detected). Save may conflict.",
						);
					},
				);
			} catch {
				// ignore
			}
		})();
		return () => {
			unlisten?.();
		};
	}, []);

	useEffect(() => {
		if (!activeCanvasId) {
			setActiveCanvasDoc(null);
			return;
		}
		const seq = ++canvasLoadSeq.current;
		setActiveCanvasDoc(null);
		(async () => {
			try {
				const doc = await invoke("canvas_read", { id: activeCanvasId });
				if (seq !== canvasLoadSeq.current) return;
				setActiveCanvasDoc(doc);
			} catch (e) {
				if (seq !== canvasLoadSeq.current) return;
				setError(e instanceof Error ? e.message : String(e));
			}
		})();
	}, [activeCanvasId]);

	const onCreateNote = useCallback(async () => {
		try {
			const meta = await invoke("note_create", { title: "Untitled" });
			setNotes((prev) => [meta, ...prev]);
			setActiveNoteId(meta.id);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	const createNoteFromMarkdown = useCallback(
		async (title: string, markdown: string): Promise<NoteMeta | null> => {
			if (!vaultPath) return null;
			const meta = await invoke("note_create", { title: title || "Untitled" });
			await invoke("note_write", { id: meta.id, markdown, base_etag: null });
			await refreshNotes();
			setActiveNoteId(meta.id);
			return meta;
		},
		[refreshNotes, vaultPath],
	);

	const onDeleteNote = useCallback(async (id: string) => {
		if (!window.confirm("Delete this note?")) return;
		try {
			await invoke("note_delete", { id });
			const nextNotes = notesRef.current.filter((n) => n.id !== id);
			setNotes(nextNotes);
			if (activeNoteIdRef.current === id) {
				setActiveNoteId(nextNotes[0]?.id ?? null);
				setActiveDoc(null);
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	const onChangeMarkdown = useCallback((markdown: string) => {
		setActiveDoc((prev) => (prev ? { ...prev, markdown } : prev));
	}, []);

	const onSaveMarkdown = useCallback(
		async (markdown: string) => {
			if (!activeNoteId) return;
			const baseEtag = activeDoc?.etag ?? null;
			const res = await invoke("note_write", {
				id: activeNoteId,
				markdown,
				base_etag: baseEtag,
			});
			setNotes((prev) =>
				prev.map((n) => (n.id === activeNoteId ? { ...n, ...res.meta } : n)),
			);
			setActiveDoc((prev) =>
				prev
					? { ...prev, etag: res.etag, mtime_ms: res.mtime_ms, meta: res.meta }
					: prev,
			);
			lastSavedNoteIdRef.current = activeNoteId;
			lastSavedAtMsRef.current = Date.now();
		},
		[activeDoc?.etag, activeNoteId],
	);

	const onForceSaveMarkdown = useCallback(
		async (markdown: string) => {
			if (!activeNoteId) return;
			const res = await invoke("note_write", {
				id: activeNoteId,
				markdown,
				base_etag: null,
			});
			setNotes((prev) =>
				prev.map((n) => (n.id === activeNoteId ? { ...n, ...res.meta } : n)),
			);
			setActiveDoc((prev) =>
				prev
					? { ...prev, etag: res.etag, mtime_ms: res.mtime_ms, meta: res.meta }
					: prev,
			);
			lastSavedNoteIdRef.current = activeNoteId;
			lastSavedAtMsRef.current = Date.now();
		},
		[activeNoteId],
	);

	const onReloadNoteFromDisk = useCallback(async () => {
		if (!activeNoteId) return;
		const doc = await invoke("note_read", { id: activeNoteId });
		setActiveDoc(doc);
		setNotes((prev) =>
			prev.map((n) => (n.id === activeNoteId ? { ...n, ...doc.meta } : n)),
		);
	}, [activeNoteId]);

	const onAttachFile = useCallback(async (): Promise<string | null> => {
		if (!activeNoteId) return null;
		const selection = await open({
			title: "Attach a file",
			directory: false,
			multiple: false,
		});
		const path = Array.isArray(selection) ? (selection[0] ?? null) : selection;
		if (!path) return null;

		const res = await invoke("note_attach_file", {
			note_id: activeNoteId,
			source_path: path,
		});
		await refreshNotes();
		return res.markdown;
	}, [activeNoteId, refreshNotes]);

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

	const onCreateCanvas = useCallback(async () => {
		try {
			const created = await invoke("canvas_create", { title: "Canvas" });
			setCanvases((prev) => [created, ...prev]);
			setActiveCanvasId(created.id);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	const onSaveCanvas = useCallback(
		async (doc: {
			version: number;
			id: string;
			title: string;
			nodes: CanvasDoc["nodes"];
			edges: CanvasDoc["edges"];
		}) => {
			const saved = await invoke("canvas_write", { doc });
			setActiveCanvasDoc(saved);
			setCanvases((prev) =>
				prev.map((c) =>
					c.id === saved.id
						? { ...c, title: saved.title, updated: saved.updated }
						: c,
				),
			);
		},
		[],
	);

	return (
		<div className="appShell">
			{/* Left Sidebar - Project Navigation */}
			<aside className={`sidebar ${sidebarCollapsed ? "sidebarCollapsed" : ""}`}>
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
									onSelectNote={(id) => {
										setActiveNoteId(id);
										setShowNoteEditor(true);
									}}
								/>
							</div>
						)}

						{/* Vault Info */}
						{vaultPath && (
							<div className="sidebarSection vaultInfo">
								<div className="vaultPath mono">{vaultPath.split("/").pop()}</div>
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

						{/* Canvases List */}
						<div className="sidebarSection sidebarSectionGrow">
							<CanvasesPane
								canvases={canvases}
								activeCanvasId={activeCanvasId}
								onSelectCanvas={setActiveCanvasId}
								onCreateCanvas={onCreateCanvas}
							/>
						</div>

						{/* Notes List */}
						<div className="sidebarSection sidebarSectionGrow">
							<NotesPane
								notes={notes}
								activeNoteId={activeNoteId}
								onSelectNote={(id) => {
									setActiveNoteId(id);
									setShowNoteEditor(true);
								}}
								onCreateNote={onCreateNote}
								onDeleteNote={onDeleteNote}
							/>
						</div>
					</>
				)}
			</aside>

			{/* Main Canvas Area */}
			<main className="mainArea">
				{/* Canvas Toolbar */}
				<div className="mainToolbar" data-tauri-drag-region>
					<div className="mainToolbarLeft">
						<span className="canvasTitle">
							{activeCanvasDoc?.title || "No canvas selected"}
						</span>
					</div>
					<div className="mainToolbarRight">
						<MotionIconButton
							type="button"
							active={showNoteEditor}
							onClick={() => setShowNoteEditor(!showNoteEditor)}
							title="Toggle note editor"
						>
							{showNoteEditor ? (
								<PanelRightClose size={16} />
							) : (
								<PanelRightOpen size={16} />
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

				{/* Canvas Content */}
				<div className="canvasWrapper">
					<Suspense
						fallback={<div className="canvasEmpty">Loading canvas…</div>}
					>
						<CanvasPane
							doc={
								activeCanvasDoc
									? {
											version: activeCanvasDoc.version,
											id: activeCanvasDoc.id,
											title: activeCanvasDoc.title,
											nodes: activeCanvasDoc.nodes,
											edges: activeCanvasDoc.edges,
										}
									: null
							}
							onSave={onSaveCanvas}
							onOpenNote={(id) => {
								setActiveNoteId(id);
								setShowNoteEditor(true);
							}}
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
								activeNoteMarkdown={activeDoc?.markdown ?? null}
								selectedCanvasNodes={selectedCanvasNodes}
								canvasDoc={activeCanvasDoc}
								onApplyToActiveNote={onForceSaveMarkdown}
								onCreateNoteFromMarkdown={createNoteFromMarkdown}
								onAddCanvasNoteNode={addCanvasNoteNode}
								onAddCanvasTextNode={addCanvasTextNode}
							/>
						</div>
					</MotionFloatingPanel>
				</div>
			</main>

			{/* Right Panel - Note Editor */}
			<MotionEditorPanel isOpen={showNoteEditor} className="editorPanel">
				<NoteEditor
					doc={activeDoc}
					backlinks={backlinks}
					backlinksError={backlinksError}
					onOpenBacklink={(id) => setActiveNoteId(id)}
					onChangeMarkdown={onChangeMarkdown}
					onSave={onSaveMarkdown}
					onForceSave={onForceSaveMarkdown}
					onReloadFromDisk={onReloadNoteFromDisk}
					onAttachFile={onAttachFile}
					onClose={() => setShowNoteEditor(false)}
				/>
			</MotionEditorPanel>

			{/* Error Toast */}
			<AnimatePresence>
				{error && <div className="appError">{error}</div>}
			</AnimatePresence>
		</div>
	);
}

export default App;
