import { DashboardSquare03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultDatabaseColumnIconName } from "../../lib/database/columnIcons";
import { extractErrorMessage } from "../../lib/errorUtils";
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
import {
	ChevronDown,
	Edit,
	Kanban,
	MoreHorizontal,
	Plus,
	Table,
	Trash2,
} from "../Icons";
import { DatabaseBoard } from "../database/DatabaseBoard";
import { DatabaseColumnDialog } from "../database/DatabaseColumnDialog";
import { DatabaseSourceDialog } from "../database/DatabaseSourceDialog";
import { DatabaseTable } from "../database/DatabaseTable";
import { DatabaseToolbar } from "../database/DatabaseToolbar";
import { Button } from "../ui/shadcn/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { Input } from "../ui/shadcn/input";

interface DatabasesPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
	initialDatabaseId?: string | null;
	openRequestNonce?: number;
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
		null,
	);
	const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
	const [document, setDocument] = useState<WorkspaceDatabaseDocument | null>(
		null,
	);
	const [rows, setRows] = useState<DatabaseRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [rowsLoading, setRowsLoading] = useState(false);
	const [error, setError] = useState("");
	const [selectedRowPath, setSelectedRowPath] = useState<string | null>(null);
	const [columnsOpen, setColumnsOpen] = useState(false);
	const [sourceOpen, setSourceOpen] = useState(false);
	const [nameDraft, setNameDraft] = useState("");
	const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
	const [viewNameDraft, setViewNameDraft] = useState("");
	const viewNameInputRef = useRef<HTMLInputElement | null>(null);
	const rowRequestTokenRef = useRef(0);

	const loadSummaries = useCallback(async () => {
		const next = await invoke("databases_list");
		setSummaries(next);
		setSelectedDatabaseId((current) =>
			current && next.some((entry) => entry.id === current)
				? current
				: (next[0]?.id ?? null),
		);
	}, []);

	useEffect(() => {
		void loadSummaries().catch((cause) => setError(extractErrorMessage(cause)));
	}, [loadSummaries]);

	useEffect(() => {
		if (openRequestNonce === 0) return;
		if (initialDatabaseId) {
			setSelectedDatabaseId(initialDatabaseId);
		}
	}, [initialDatabaseId, openRequestNonce]);

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
		setSelectedViewId(null);
		setRows([]);
		void invoke("databases_get", { database_id: selectedDatabaseId })
			.then((next) => {
				if (cancelled) return;
				setDocument(next);
				setNameDraft(next.database.name);
				setSelectedViewId((current) =>
					current && next.database.views.some((view) => view.id === current)
						? current
						: (next.database.views[0]?.id ?? null),
				);
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

	const loadRows = useCallback(async () => {
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
			}
			return;
		}
		setRowsLoading(true);
		try {
			const next = await invoke("databases_query_rows", {
				database_id: selectedDatabaseId,
				view_id: selectedViewId,
				limit: 200,
			});
			if (rowRequestTokenRef.current !== requestToken) {
				return;
			}
			setRows(next.rows);
		} catch (cause) {
			if (rowRequestTokenRef.current !== requestToken) {
				return;
			}
			setError(extractErrorMessage(cause));
		} finally {
			if (rowRequestTokenRef.current === requestToken) {
				setRowsLoading(false);
			}
		}
	}, [document, selectedDatabaseId, selectedViewId]);

	useEffect(() => {
		void loadRows();
	}, [loadRows]);

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
				setError(extractErrorMessage(cause));
				return null;
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
				await invoke("databases_update_cell", {
					note_path: notePath,
					column,
					value,
				});
				setError("");
				await loadRows();
			} catch (cause) {
				setError(extractErrorMessage(cause));
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
		try {
			await saveDatabase({
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
						created_at: now,
						updated_at: now,
					},
				],
			});
			setError("");
			setSelectedViewId(nextViewId);
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
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
		(viewId: string) => {
			if (!document || document.database.views.length <= 1) return;
			void saveDatabase({
				...document.database,
				views: document.database.views.filter((v) => v.id !== viewId),
			});
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
		return <div className="databaseLoadingState">Loading databases…</div>;
	}

	return (
		<div className="databaseHostPane">
			<div className="databasesTopBar">
				<div className="databasesTopBarLeft">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button type="button" className="databasesDropdownTrigger">
								<HugeiconsIcon
									icon={DashboardSquare03Icon}
									size={14}
									strokeWidth={1.8}
								/>
								<span className="databasesDropdownTriggerLabel">
									{document?.database.name ?? "Select database"}
								</span>
								<ChevronDown size={12} />
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="start"
							className="databasesDropdownContent"
						>
							{summaries.map((summary) => (
								<DropdownMenuItem
									key={summary.id}
									className={`databasesDropdownItem${summary.id === selectedDatabaseId ? " is-selected" : ""}`}
									onSelect={() => setSelectedDatabaseId(summary.id)}
								>
									<HugeiconsIcon
										icon={DashboardSquare03Icon}
										size={13}
										strokeWidth={1.8}
									/>
									<span>{summary.name}</span>
								</DropdownMenuItem>
							))}
							{summaries.length > 0 ? <DropdownMenuSeparator /> : null}
							<DropdownMenuItem
								onSelect={() => void handleCreateDatabase()}
								className="databasesDropdownItem"
							>
								<Plus size={13} />
								<span>New database</span>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>

					{document ? (
						<>
							<span className="databasesTopBarDivider" />
							<Input
								value={nameDraft}
								className="databasesInlineNameInput"
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
						</>
					) : null}
				</div>

				{document ? (
					<div className="databasesTopBarRight">
						<span className="databasesHeaderSource">
							{rows.length} row{rows.length === 1 ? "" : "s"}
						</span>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => void handleDuplicateDatabase()}
						>
							Duplicate
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							onClick={() => {
								if (
									!window.confirm(
										`Delete database "${document.database.name}"? This cannot be undone.`,
									)
								) {
									return;
								}
								void handleDeleteDatabase();
							}}
							disabled={document.database.is_system}
							title="Delete database"
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
													className={`databasesViewTab${isActive ? " is-active" : ""}`}
													onClick={() => setSelectedViewId(view.id)}
												>
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
															>
																<MoreHorizontal size={14} />
															</button>
														</DropdownMenuTrigger>
														<DropdownMenuContent
															align="start"
															className="databasesDropdownContent"
														>
															<DropdownMenuItem
																onSelect={() => startViewRename(view.id)}
																className="databasesDropdownItem"
															>
																<Edit size={13} />
																<span>Rename</span>
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem
																disabled={document.database.views.length <= 1}
																onSelect={() => handleDeleteView(view.id)}
																className="databasesDropdownItem databasesDropdownItemDanger"
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
					<DatabaseToolbar
						databaseView={activeConfig.view.layout}
						groupColumns={groupColumns}
						groupColumnId={activeConfig.view.board_group_by ?? null}
						onGroupColumnIdChange={(groupColumnId) =>
							void handleSaveConfig({
								...activeConfig,
								view: {
									...activeConfig.view,
									board_group_by: groupColumnId,
								},
							})
						}
						onDatabaseViewChange={(view) =>
							void handleSaveConfig({
								...activeConfig,
								view: {
									...activeConfig.view,
									layout: view,
								},
							})
						}
						onAddRow={() => void handleCreateRow()}
						onReload={() => void loadRows()}
						onOpenSource={() => setSourceOpen(true)}
						onOpenColumns={() => setColumnsOpen(true)}
					/>
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
							selectedRowPath={selectedRowPath}
							onSelectRow={setSelectedRowPath}
							onOpenRow={(notePath) => void onOpenFile(notePath)}
							onOpenColumns={() => setColumnsOpen(true)}
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
							onSaveCell={handleUpdateCell}
						/>
					) : (
						<DatabaseTable
							rows={rows}
							columns={visibleColumns}
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
					<DatabaseColumnDialog
						open={columnsOpen}
						config={activeConfig}
						availableProperties={document.available_properties}
						onOpenChange={setColumnsOpen}
						onChangeConfig={handleSaveConfig}
					/>
					<DatabaseSourceDialog
						open={sourceOpen}
						config={activeConfig}
						onOpenChange={setSourceOpen}
						onChangeConfig={handleSaveConfig}
					/>
				</>
			) : (
				<div className="databasesEmptyState">
					<HugeiconsIcon
						icon={DashboardSquare03Icon}
						size={32}
						strokeWidth={1.2}
					/>
					<div className="databasesEmptyTitle">
						{summaries.length === 0
							? "Create your first database"
							: "Select a database"}
					</div>
					<div className="databasesEmptyText">
						{summaries.length === 0
							? "Databases let you organize notes with custom views, filters, and properties."
							: "Choose a database from the dropdown to get started."}
					</div>
					{summaries.length === 0 ? (
						<Button
							type="button"
							size="sm"
							onClick={() => void handleCreateDatabase()}
						>
							<Plus size={13} />
							Create Database
						</Button>
					) : null}
				</div>
			)}
		</div>
	);
}
