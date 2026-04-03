import {
	ClipboardIcon,
	LibraryIcon,
	MoreVerticalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultDatabaseColumnIconName } from "../../lib/database/columnIcons";
import { extractErrorMessage } from "../../lib/errorUtils";
import { loadSettings } from "../../lib/settings";
import {
	type DatabaseColumn,
	type DatabaseConfig,
	type DatabaseRow,
	type DatabaseSort,
	type WorkspaceDatabaseDefinition,
	type WorkspaceDatabaseDocument,
	type WorkspaceDatabaseSummary,
	invoke,
} from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { ChevronDown, Edit, Kanban, Plus, Table, Trash2 } from "../Icons";
import { DatabaseBoard } from "../database/DatabaseBoard";
import { DatabaseTable } from "../database/DatabaseTable";
import { DatabaseToolbar } from "../database/DatabaseToolbar";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { Input } from "../ui/shadcn/input";

interface DatabasesPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
	initialDatabaseId?: string | null;
	openRequestNonce?: number;
}

const DATABASES_SELECTED_DATABASE_STORAGE_KEY =
	"glyph.databases.selectedDatabaseId";
const DATABASES_SELECTED_VIEWS_STORAGE_KEY = "glyph.databases.selectedViews";
const EMPTY_BOARD_LANE_COLORS: Record<string, string> = {};
const EMPTY_BOARD_LANE_ORDER: Record<string, string[]> = {};

function readStoredSelectedDatabaseId(): string | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(
			DATABASES_SELECTED_DATABASE_STORAGE_KEY,
		);
		return raw?.trim() ? raw : null;
	} catch {
		return null;
	}
}

function writeStoredSelectedDatabaseId(databaseId: string | null) {
	if (typeof window === "undefined") return;
	try {
		if (databaseId) {
			window.localStorage.setItem(
				DATABASES_SELECTED_DATABASE_STORAGE_KEY,
				databaseId,
			);
			return;
		}
		window.localStorage.removeItem(DATABASES_SELECTED_DATABASE_STORAGE_KEY);
	} catch {
		// Best-effort UI persistence.
	}
}

function readStoredSelectedViews(): Record<string, string> {
	if (typeof window === "undefined") return {};
	try {
		const raw = window.localStorage.getItem(
			DATABASES_SELECTED_VIEWS_STORAGE_KEY,
		);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return {};
		const next: Record<string, string> = {};
		for (const [databaseId, viewId] of Object.entries(parsed)) {
			if (typeof viewId === "string") {
				next[databaseId] = viewId;
			}
		}
		return next;
	} catch {
		return {};
	}
}

function readStoredSelectedViewId(databaseId: string | null): string | null {
	if (!databaseId) return null;
	const selectedViews = readStoredSelectedViews();
	return selectedViews[databaseId] ?? null;
}

function writeStoredSelectedViewId(
	databaseId: string | null,
	viewId: string | null,
) {
	if (typeof window === "undefined" || !databaseId) return;
	try {
		const selectedViews = readStoredSelectedViews();
		if (viewId) {
			selectedViews[databaseId] = viewId;
		} else {
			delete selectedViews[databaseId];
		}
		window.localStorage.setItem(
			DATABASES_SELECTED_VIEWS_STORAGE_KEY,
			JSON.stringify(selectedViews),
		);
	} catch {
		// Best-effort UI persistence.
	}
}

function currentConfig(
	database: WorkspaceDatabaseDefinition,
	viewId: string,
): DatabaseConfig | null {
	const view = database.views.find((entry) => entry.id === viewId);
	if (!view) return null;
	return {
		source: database.source,
		new_note: database.new_note,
		view: {
			layout: view.layout,
			board_group_by: view.grouping?.column_id ?? null,
			board_lane_colors: view.board_lane_colors ?? EMPTY_BOARD_LANE_COLORS,
			board_lane_order: view.board_lane_order ?? EMPTY_BOARD_LANE_ORDER,
		},
		columns: view.columns,
		sorts: view.sorts,
		filters: view.filters,
	};
}

function replaceCurrentView(
	database: WorkspaceDatabaseDefinition,
	viewId: string,
	config: DatabaseConfig,
): WorkspaceDatabaseDefinition {
	return {
		...database,
		source: config.source,
		new_note: config.new_note,
		views: database.views.map((view) =>
			view.id === viewId
				? {
						...view,
						layout: config.view.layout,
						grouping: config.view.board_group_by
							? {
									column_id: config.view.board_group_by,
									ascending: true,
								}
							: null,
						board_lane_colors:
							config.view.board_lane_colors ?? EMPTY_BOARD_LANE_COLORS,
						board_lane_order:
							config.view.board_lane_order ?? EMPTY_BOARD_LANE_ORDER,
						columns: config.columns,
						sorts: config.sorts,
						filters: config.filters,
					}
				: view,
		),
	};
}

function nextDatabaseName(summaries: WorkspaceDatabaseSummary[]): string {
	const existing = new Set(
		summaries.map((entry) => entry.name.trim().toLowerCase()),
	);
	if (!existing.has("new database")) return "New Database";
	let suffix = 2;
	while (existing.has(`new database ${suffix}`)) {
		suffix += 1;
	}
	return `New Database ${suffix}`;
}

function ViewLayoutIcon({ layout }: { layout: string }) {
	if (layout === "board") return <Kanban size={13} />;
	return <Table size={13} />;
}

export function DatabasesPane({
	onOpenFile,
	initialDatabaseId = null,
	openRequestNonce = 0,
}: DatabasesPaneProps) {
	const [summaries, setSummaries] = useState<WorkspaceDatabaseSummary[]>([]);
	const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(
		() => initialDatabaseId ?? readStoredSelectedDatabaseId(),
	);
	const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
	const [document, setDocument] = useState<WorkspaceDatabaseDocument | null>(
		null,
	);
	const [rows, setRows] = useState<DatabaseRow[]>([]);
	const [totalCount, setTotalCount] = useState(0);
	const [isTruncated, setIsTruncated] = useState(false);
	const [loading, setLoading] = useState(true);
	const [rowsLoading, setRowsLoading] = useState(false);
	const [error, setError] = useState("");
	const [selectedRowPath, setSelectedRowPath] = useState<string | null>(null);
	const [nameDraft, setNameDraft] = useState("");
	const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
	const [viewNameDraft, setViewNameDraft] = useState("");
	const viewNameInputRef = useRef<HTMLInputElement | null>(null);
	const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
	const rowRequestTokenRef = useRef(0);
	const fsRowsRefreshTimerRef = useRef<number | null>(null);
	const [showDatabaseColumnColor, setShowDatabaseColumnColor] = useState(true);
	const [showDatabaseNoteCount, setShowDatabaseNoteCount] = useState(false);

	const loadSummaries = useCallback(async () => {
		const next = await invoke("databases_list");
		const storedDatabaseId = readStoredSelectedDatabaseId();
		setSummaries(next);
		setSelectedDatabaseId((current) =>
			current && next.some((entry) => entry.id === current)
				? current
				: initialDatabaseId &&
						next.some((entry) => entry.id === initialDatabaseId)
					? initialDatabaseId
					: storedDatabaseId &&
							next.some((entry) => entry.id === storedDatabaseId)
						? storedDatabaseId
						: (next[0]?.id ?? null),
		);
	}, [initialDatabaseId]);

	useEffect(() => {
		void loadSummaries().catch((cause) => setError(extractErrorMessage(cause)));
	}, [loadSummaries]);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (!cancelled) {
					setShowDatabaseColumnColor(settings.database.showColumnColor);
					setShowDatabaseNoteCount(settings.database.showNoteCount);
				}
			})
			.catch(() => {
				// Preserve the existing default if settings cannot be loaded.
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.database?.showColumnColor === "boolean") {
			setShowDatabaseColumnColor(payload.database.showColumnColor);
		}
		if (typeof payload.database?.showNoteCount === "boolean") {
			setShowDatabaseNoteCount(payload.database.showNoteCount);
		}
	});

	useEffect(() => {
		if (openRequestNonce === 0) return;
		if (initialDatabaseId) {
			setSelectedDatabaseId(initialDatabaseId);
		}
	}, [initialDatabaseId, openRequestNonce]);

	useEffect(() => {
		writeStoredSelectedDatabaseId(selectedDatabaseId);
	}, [selectedDatabaseId]);

	useEffect(() => {
		if (!selectedDatabaseId) {
			setDocument(null);
			setSelectedViewId(null);
			setRows([]);
			setLoading(false);
			return;
		}
		let cancelled = false;
		setLoading(true);
		setError("");
		setRows([]);
		void invoke("databases_get", { database_id: selectedDatabaseId })
			.then((next) => {
				if (cancelled) return;
				setDocument(next);
				setNameDraft(next.database.name);
				if (next.database.views.length === 0) {
					return;
				}
				const storedViewId = readStoredSelectedViewId(next.database.id);
				setSelectedViewId((current) => {
					if (
						current &&
						next.database.views.some((view) => view.id === current)
					) {
						return current;
					}
					if (
						storedViewId &&
						next.database.views.some((view) => view.id === storedViewId)
					) {
						return storedViewId;
					}
					return next.database.views[0]?.id ?? null;
				});
			})
			.catch((cause) => {
				if (cancelled) return;
				setError(extractErrorMessage(cause));
				setDocument(null);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [selectedDatabaseId]);

	useEffect(() => {
		if (
			!selectedDatabaseId ||
			!selectedViewId ||
			!document ||
			document.database.id !== selectedDatabaseId ||
			document.database.views.length === 0 ||
			!document.database.views.some((view) => view.id === selectedViewId)
		) {
			return;
		}
		writeStoredSelectedViewId(selectedDatabaseId, selectedViewId);
	}, [document, selectedDatabaseId, selectedViewId]);

	const activeConfig = useMemo(
		() =>
			document && selectedViewId
				? currentConfig(document.database, selectedViewId)
				: null,
		[document, selectedViewId],
	);

	const activeView = useMemo(
		() =>
			document?.database.views.find((view) => view.id === selectedViewId) ??
			null,
		[document, selectedViewId],
	);

	const groupColumns = useMemo(
		() =>
			(activeConfig?.columns ?? []).filter(
				(column) => column.type === "tags" || column.type === "property",
			),
		[activeConfig?.columns],
	);

	const visibleColumns = useMemo(
		() => activeConfig?.columns.filter((column) => column.visible) ?? [],
		[activeConfig?.columns],
	);

	const loadRows = useCallback(
		async (options?: { background?: boolean }) => {
			const requestToken = rowRequestTokenRef.current + 1;
			rowRequestTokenRef.current = requestToken;
			if (
				!selectedDatabaseId ||
				!selectedViewId ||
				!document ||
				document.database.id !== selectedDatabaseId ||
				!document.database.views.some((view) => view.id === selectedViewId)
			) {
				if (rowRequestTokenRef.current === requestToken) {
					setRows([]);
					setTotalCount(0);
					setIsTruncated(false);
				}
				return;
			}
			const shouldShowLoading = !options?.background;
			if (shouldShowLoading) {
				setRowsLoading(true);
			}
			try {
				let offset = 0;
				let totalCount = 0;
				let isTruncated = false;
				const allRows: DatabaseRow[] = [];

				while (true) {
					const next = await invoke("databases_query_rows", {
						database_id: selectedDatabaseId,
						view_id: selectedViewId,
						offset,
						limit: 200,
					});
					if (rowRequestTokenRef.current !== requestToken) {
						return;
					}
					allRows.push(...next.rows);
					totalCount = next.total_count;
					isTruncated = next.truncated;
					if (next.next_offset == null) {
						break;
					}
					offset = next.next_offset;
				}
				if (rowRequestTokenRef.current !== requestToken) {
					return;
				}
				setRows(allRows);
				setTotalCount(totalCount);
				setIsTruncated(isTruncated);
			} catch (cause) {
				if (rowRequestTokenRef.current !== requestToken) {
					return;
				}
				setError(extractErrorMessage(cause));
			} finally {
				if (shouldShowLoading && rowRequestTokenRef.current === requestToken) {
					setRowsLoading(false);
				}
			}
		},
		[document, selectedDatabaseId, selectedViewId],
	);

	useEffect(() => {
		void loadRows();
	}, [loadRows]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: clear pending background reloads when the row loader changes.
	useEffect(
		() => () => {
			if (fsRowsRefreshTimerRef.current !== null) {
				window.clearTimeout(fsRowsRefreshTimerRef.current);
				fsRowsRefreshTimerRef.current = null;
			}
		},
		[loadRows],
	);

	useTauriEvent("space:fs_changed", (payload) => {
		if (!payload.rel_path.toLowerCase().endsWith(".md")) return;
		if (fsRowsRefreshTimerRef.current !== null) {
			window.clearTimeout(fsRowsRefreshTimerRef.current);
		}
		fsRowsRefreshTimerRef.current = window.setTimeout(() => {
			fsRowsRefreshTimerRef.current = null;
			void loadRows({ background: true });
		}, 150);
	});

	const saveDatabase = useCallback(
		async (nextDatabase: WorkspaceDatabaseDefinition) => {
			try {
				const saved = await invoke("databases_update", {
					database: nextDatabase,
				});
				setError("");
				setDocument(saved);
				setNameDraft(saved.database.name);
				await loadSummaries();
				return saved;
			} catch (cause) {
				const message = extractErrorMessage(cause);
				setError(message);
				throw cause instanceof Error ? cause : new Error(message);
			}
		},
		[loadSummaries],
	);

	const handleSaveConfig = useCallback(
		async (nextConfig: DatabaseConfig) => {
			if (!document || !selectedViewId) return;
			await saveDatabase(
				replaceCurrentView(document.database, selectedViewId, nextConfig),
			);
		},
		[document, saveDatabase, selectedViewId],
	);

	const handleCreateDatabase = useCallback(async () => {
		try {
			const created = await invoke("databases_create", {
				name: nextDatabaseName(summaries),
			});
			setError("");
			setSelectedDatabaseId(created.database.id);
			setDocument(created);
			setSelectedViewId(created.database.views[0]?.id ?? null);
			setNameDraft(created.database.name);
			await loadSummaries();
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, [loadSummaries, summaries]);

	const handleDeleteDatabase = useCallback(async () => {
		if (!document || document.database.is_system) return;
		try {
			await invoke("databases_delete", { database_id: document.database.id });
			setError("");
			setDocument(null);
			setRows([]);
			await loadSummaries();
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, [document, loadSummaries]);

	const handleDuplicateDatabase = useCallback(async () => {
		if (!document) return;
		try {
			const duplicated = await invoke("databases_duplicate", {
				database_id: document.database.id,
			});
			setError("");
			setSelectedDatabaseId(duplicated.database.id);
			setDocument(duplicated);
			setSelectedViewId(duplicated.database.views[0]?.id ?? null);
			setNameDraft(duplicated.database.name);
			await loadSummaries();
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, [document, loadSummaries]);

	const handleUpdateCell = useCallback(
		async (
			notePath: string,
			column: DatabaseColumn,
			value: {
				kind: string;
				value_text?: string | null;
				value_bool?: boolean | null;
				value_list: string[];
			},
		) => {
			try {
				const updatedRow = await invoke("databases_update_cell", {
					note_path: notePath,
					column,
					value,
				});
				setError("");
				setRows((current) => {
					const existingIndex = current.findIndex(
						(row) => row.note_path === notePath,
					);
					if (existingIndex === -1) {
						return [...current, updatedRow];
					}
					const next = [...current];
					next[existingIndex] = updatedRow;
					return next;
				});
				void loadRows({ background: true });
			} catch (cause) {
				setError(extractErrorMessage(cause));
				throw cause;
			}
		},
		[loadRows],
	);

	const handleCreateRow = useCallback(async () => {
		if (!document) return;
		try {
			const created = await invoke("databases_create_row", {
				database_id: document.database.id,
			});
			setError("");
			setSelectedRowPath(created.note_path);
			await loadRows();
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, [document, loadRows]);

	const handleCreateView = useCallback(async () => {
		if (!document) return;
		const nextName = `View ${document.database.views.length + 1}`;
		const now = new Date().toISOString();
		const nextViewId = crypto.randomUUID();
		const saved = await saveDatabase({
			...document.database,
			views: [
				...document.database.views,
				{
					id: nextViewId,
					name: nextName,
					layout: "table",
					icon: null,
					color: null,
					columns: document.database.views[0]?.columns ?? [
						{
							id: "title",
							type: "title",
							label: "Title",
							icon: defaultDatabaseColumnIconName({
								type: "title",
								property_kind: null,
							}),
							width: 320,
							visible: true,
						},
					],
					sorts: [],
					filters: [],
					grouping: null,
					board_lane_colors: {},
					board_lane_order: {},
					created_at: now,
					updated_at: now,
				},
			],
		});
		if (!saved) {
			return;
		}
		setError("");
		setSelectedViewId(nextViewId);
	}, [document, saveDatabase]);

	const commitDatabaseRename = useCallback(() => {
		if (!document || !nameDraft.trim() || nameDraft === document.database.name)
			return;
		void saveDatabase({ ...document.database, name: nameDraft.trim() });
	}, [document, nameDraft, saveDatabase]);

	const startViewRename = useCallback(
		(viewId: string) => {
			const view = document?.database.views.find((v) => v.id === viewId);
			if (!view) return;
			setViewNameDraft(view.name);
			setRenamingViewId(viewId);
			requestAnimationFrame(() => viewNameInputRef.current?.select());
		},
		[document],
	);

	const commitViewRename = useCallback(() => {
		if (!document || !renamingViewId || !viewNameDraft.trim()) {
			setRenamingViewId(null);
			return;
		}
		const current = document.database.views.find(
			(v) => v.id === renamingViewId,
		);
		if (!current || viewNameDraft.trim() === current.name) {
			setRenamingViewId(null);
			return;
		}
		void saveDatabase({
			...document.database,
			views: document.database.views.map((v) =>
				v.id === renamingViewId ? { ...v, name: viewNameDraft.trim() } : v,
			),
		});
		setRenamingViewId(null);
	}, [document, renamingViewId, saveDatabase, viewNameDraft]);

	const handleDeleteView = useCallback(
		async (viewId: string) => {
			if (!document || document.database.views.length <= 1) return;
			const saved = await saveDatabase({
				...document.database,
				views: document.database.views.filter((v) => v.id !== viewId),
			});
			if (!saved) {
				return;
			}
			if (selectedViewId === viewId) {
				const remaining = document.database.views.filter(
					(v) => v.id !== viewId,
				);
				setSelectedViewId(remaining[0]?.id ?? null);
			}
		},
		[document, saveDatabase, selectedViewId],
	);

	if (loading) {
		return <div className="databaseLoadingState">Loading collections…</div>;
	}

	return (
		<div className="databaseHostPane">
			<div className="databasesTopBar">
				<div className="databasesTopBarLeft">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button type="button" className="databasesDropdownTrigger">
								<HugeiconsIcon icon={LibraryIcon} size={14} strokeWidth={1.8} />
								<span className="databasesDropdownTriggerLabel">
									{document?.database.name ?? "Select collection"}
								</span>
								<ChevronDown size={12} />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="start"
							className="databasesDropdownContent databasesCollectionMenu"
						>
							{summaries.map((summary) => (
								<DropdownMenuItem
									key={summary.id}
									className={`databasesDropdownItem databasesCollectionMenuItem${summary.id === selectedDatabaseId ? " is-selected" : ""}`}
									onSelect={() => setSelectedDatabaseId(summary.id)}
								>
									<HugeiconsIcon
										icon={LibraryIcon}
										size={13}
										strokeWidth={1.8}
									/>
									<span>{summary.name}</span>
								</DropdownMenuItem>
							))}
							{summaries.length > 0 ? <DropdownMenuSeparator /> : null}
							<DropdownMenuItem
								onSelect={() => void handleCreateDatabase()}
								className="databasesDropdownItem databasesCollectionMenuItem"
							>
								<Plus size={13} />
								<span>New collection</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					{document && activeConfig ? (
						<>
							<Input
								value={nameDraft}
								className="databasesInlineNameInput"
								aria-label="Collection name"
								style={{
									width: `${Math.min(Math.max(nameDraft.trim().length + 2, 10), 24)}ch`,
								}}
								onChange={(event) => setNameDraft(event.target.value)}
								onBlur={commitDatabaseRename}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										commitDatabaseRename();
										(event.target as HTMLInputElement).blur();
									}
								}}
							/>
							<DatabaseToolbar
								className="databaseToolbarInline"
								databaseView={activeConfig.view.layout}
								groupColumns={groupColumns}
								groupColumnId={activeConfig.view.board_group_by ?? null}
								config={activeConfig}
								availableProperties={document.available_properties}
								onGroupColumnIdChange={(groupColumnId) => {
									if (!activeConfig) return;
									void handleSaveConfig({
										...activeConfig,
										view: {
											...activeConfig.view,
											board_group_by: groupColumnId,
										},
									});
								}}
								onAddRow={() => void handleCreateRow()}
								onReload={() => void loadRows()}
								onChangeConfig={handleSaveConfig}
								columnsMenuOpen={columnsMenuOpen}
								onColumnsMenuOpenChange={setColumnsMenuOpen}
							/>
						</>
					) : null}
				</div>

				{document ? (
					<div className="databasesTopBarRight">
						{showDatabaseNoteCount ? (
							<span className="databasesHeaderSource">
								{totalCount > rows.length
									? `Showing ${rows.length} of ${totalCount} notes`
									: `${rows.length} note${rows.length === 1 ? "" : "s"}`}
							</span>
						) : null}
						{isTruncated ? (
							<span className="databasesHeaderSource">
								Limited to the first 200 notes
							</span>
						) : null}
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="databasesTopActionButton"
							onClick={() => void handleDuplicateDatabase()}
							title="Duplicate collection"
							aria-label="Duplicate collection"
						>
							<HugeiconsIcon icon={ClipboardIcon} size={14} />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="databasesTopActionButton databasesTopActionButtonDanger"
							onClick={() => {
								if (
									!window.confirm(
										`Delete collection "${document.database.name}"? This cannot be undone.`,
									)
								) {
									return;
								}
								void handleDeleteDatabase();
							}}
							disabled={document.database.is_system}
							title="Delete collection"
						>
							<Trash2 size={14} />
						</Button>
					</div>
				) : null}
			</div>

			{document && activeConfig && activeView ? (
				<>
					<div className="databasesViewBar">
						<div className="databasesViewTabs">
							{document.database.views.map((view) => {
								const isActive = view.id === selectedViewId;
								return (
									<div
										key={view.id}
										className={`databasesViewTabWrapper${isActive ? " is-active" : ""}`}
									>
										{renamingViewId === view.id ? (
											<input
												ref={viewNameInputRef}
												type="text"
												className="databasesViewTabRenameInput"
												value={viewNameDraft}
												aria-label="View name"
												onChange={(event) =>
													setViewNameDraft(event.target.value)
												}
												onBlur={commitViewRename}
												onKeyDown={(event) => {
													if (event.key === "Enter") {
														event.preventDefault();
														commitViewRename();
													}
													if (event.key === "Escape") {
														event.preventDefault();
														setRenamingViewId(null);
													}
												}}
											/>
										) : (
											<>
												<button
													type="button"
													className="databasesViewTab"
													data-active={isActive}
													onClick={() => setSelectedViewId(view.id)}
												>
													{isActive ? (
														<m.span
															className="databasesViewTabBg"
															layoutId="databasesViewActive"
															transition={springPresets.snappy}
														/>
													) : null}
													<ViewLayoutIcon layout={view.layout} />
													<span className="databasesViewTabName">
														{view.name}
													</span>
												</button>
												{isActive ? (
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<button
																type="button"
																className="databasesViewTabMenu"
																title="View options"
																aria-label={`View options for ${view.name}`}
															>
																<HugeiconsIcon
																	icon={MoreVerticalIcon}
																	className="databasesViewTabMenuIcon"
																	size={14}
																	color="currentColor"
																	strokeWidth={1.8}
																	aria-hidden
																/>
															</button>
														</DropdownMenuTrigger>
														<DropdownMenuContent
															align="start"
															className="databasesDropdownContent databasesViewTabMenuContent"
														>
															<DropdownMenuLabel className="databasesViewTabMenuLabel">
																View type
															</DropdownMenuLabel>
															<DropdownMenuRadioGroup
																value={view.layout}
																onValueChange={(layout) => {
																	if (
																		!activeConfig ||
																		(layout !== "table" && layout !== "board") ||
																		view.layout === layout
																	) {
																		return;
																	}
																	void handleSaveConfig({
																		...activeConfig,
																		view: {
																			...activeConfig.view,
																			layout,
																		},
																	});
																}}
															>
																<DropdownMenuRadioItem
																	value="table"
																	className="databasesDropdownItem databasesViewTabMenuItem"
																>
																	<Table size={13} />
																	<span>Table</span>
																</DropdownMenuRadioItem>
																<DropdownMenuRadioItem
																	value="board"
																	className="databasesDropdownItem databasesViewTabMenuItem"
																>
																	<Kanban size={13} />
																	<span>Board</span>
																</DropdownMenuRadioItem>
															</DropdownMenuRadioGroup>
															<DropdownMenuSeparator className="databasesViewTabMenuSeparator" />
															<DropdownMenuItem
																onSelect={() => startViewRename(view.id)}
																className="databasesDropdownItem databasesViewTabMenuItem"
															>
																<Edit size={13} />
																<span>Rename</span>
															</DropdownMenuItem>
															<DropdownMenuSeparator className="databasesViewTabMenuSeparator" />
															<DropdownMenuItem
																disabled={document.database.views.length <= 1}
																onSelect={() => void handleDeleteView(view.id)}
																className="databasesDropdownItem databasesDropdownItemDanger databasesViewTabMenuItem"
															>
																<Trash2 size={13} />
																<span>Delete view</span>
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												) : null}
											</>
										)}
									</div>
								);
							})}
							<button
								type="button"
								className="databasesViewTab databasesViewTabCreate"
								onClick={() => void handleCreateView()}
								title="Add view"
							>
								<Plus size={12} />
							</button>
						</div>
					</div>
					{error ? (
						<div className="databaseNotice databaseNoticeError">{error}</div>
					) : null}
					{rowsLoading ? (
						<div className="databaseLoadingState">Loading rows…</div>
					) : activeConfig.view.layout === "board" ? (
						<DatabaseBoard
							rows={rows}
							columns={activeConfig.columns}
							groupColumnId={activeConfig.view.board_group_by ?? null}
							laneOrderByGroup={
								activeConfig.view.board_lane_order ?? EMPTY_BOARD_LANE_ORDER
							}
							laneColors={activeConfig.view.board_lane_colors ?? {}}
							showColumnColor={showDatabaseColumnColor}
							selectedRowPath={selectedRowPath}
							onSelectRow={setSelectedRowPath}
							onOpenRow={(notePath) => void onOpenFile(notePath)}
							onOpenColumns={() => setColumnsMenuOpen(true)}
							onCreateDefaultGroupField={null}
							onGroupColumnIdChange={(groupColumnId) =>
								void handleSaveConfig({
									...activeConfig,
									view: {
										...activeConfig.view,
										board_group_by: groupColumnId,
									},
								})
							}
							onLaneOrderChange={(groupColumnId, laneOrder) =>
								void handleSaveConfig({
									...activeConfig,
									view: {
										...activeConfig.view,
										board_lane_order: {
											...(activeConfig.view.board_lane_order ?? {}),
											[groupColumnId]: laneOrder,
										},
									},
								})
							}
							onLaneColorChange={(laneId, color) =>
								void handleSaveConfig({
									...activeConfig,
									view: {
										...activeConfig.view,
										board_lane_colors: color
											? {
													...(activeConfig.view.board_lane_colors ?? {}),
													[laneId]: color,
												}
											: Object.fromEntries(
													Object.entries(
														activeConfig.view.board_lane_colors ?? {},
													).filter(([entryLaneId]) => entryLaneId !== laneId),
												),
									},
								})
							}
							onSaveCell={handleUpdateCell}
						/>
					) : (
						<DatabaseTable
							rows={rows}
							columns={visibleColumns}
							laneColors={activeConfig.view.board_lane_colors ?? {}}
							selectedRowPath={selectedRowPath}
							activeSort={
								(activeConfig.sorts[0] as DatabaseSort | null) ?? null
							}
							onSelectRow={setSelectedRowPath}
							onOpenRow={(notePath) => void onOpenFile(notePath)}
							onToggleSort={(column) =>
								void handleSaveConfig({
									...activeConfig,
									sorts:
										activeConfig.sorts[0]?.column_id === column.id
											? activeConfig.sorts[0]?.direction === "asc"
												? [{ column_id: column.id, direction: "desc" }]
												: []
											: [{ column_id: column.id, direction: "asc" }],
								})
							}
							onSaveCell={handleUpdateCell}
						/>
					)}
				</>
			) : (
				<div className="databasesEmptyState">
					<HugeiconsIcon icon={LibraryIcon} size={32} strokeWidth={1.2} />
					<div className="databasesEmptyTitle">
						{summaries.length === 0
							? "Create your first collection"
							: "Select a collection"}
					</div>
					<div className="databasesEmptyText">
						{summaries.length === 0
							? "Collections let you organize notes with custom views, filters, and properties."
							: "Choose a collection from the dropdown to get started."}
					</div>
					{summaries.length === 0 ? (
						<Button
							type="button"
							size="sm"
							onClick={() => void handleCreateDatabase()}
						>
							<Plus size={13} />
							Create Collection
						</Button>
					) : null}
				</div>
			)}
		</div>
	);
}
