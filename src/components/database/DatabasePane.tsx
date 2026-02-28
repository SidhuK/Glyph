import {
	Suspense,
	lazy,
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useDatabaseNote } from "../../hooks/database/useDatabaseNote";
import { useDatabaseTable } from "../../hooks/database/useDatabaseTable";
import { defaultDatabaseColumnIconName } from "../../lib/database/columnIcons";
import { isDatabaseNote } from "../../lib/database/isDatabaseNote";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabaseSort,
} from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { isMarkdownPath, normalizeRelPath, parentDir } from "../../utils/path";
import { Button } from "../ui/shadcn/button";
import { DatabaseBoard } from "./DatabaseBoard";
import { DatabaseColumnDialog } from "./DatabaseColumnDialog";
import { DatabaseFilterDialog } from "./DatabaseFilterDialog";
import { DatabaseSourceDialog } from "./DatabaseSourceDialog";
import { DatabaseTable } from "./DatabaseTable";
import { DatabaseToolbar } from "./DatabaseToolbar";

const LazyMarkdownEditorPane = lazy(() =>
	import("../preview/MarkdownEditorPane").then((module) => ({
		default: module.MarkdownEditorPane,
	})),
);

interface DatabasePaneProps {
	relPath: string;
	onOpenFile: (relPath: string) => Promise<void>;
	onDirtyChange?: (dirty: boolean) => void;
}

export function DatabasePane({
	relPath,
	onOpenFile,
	onDirtyChange,
}: DatabasePaneProps) {
	const localMutationTimestampsRef = useRef(new Map<string, number>());
	const [noteKind, setNoteKind] = useState<"loading" | "markdown" | "database">(
		"loading",
	);
	const [mode, setMode] = useState<"database" | "markdown">("database");
	const [databaseView, setDatabaseView] = useState<"table" | "board">("table");
	const [detectError, setDetectError] = useState("");
	const [columnsOpen, setColumnsOpen] = useState(false);
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [sourceOpen, setSourceOpen] = useState(false);
	const [actionError, setActionError] = useState("");
	const { data, loading, error, reload, saveConfig, updateCell, createRow } =
		useDatabaseNote(relPath, noteKind === "database");
	const currentConfig = data?.config;
	const normalizedRelPath = normalizeRelPath(relPath);

	const markLocalMutation = useCallback((notePath: string) => {
		localMutationTimestampsRef.current.set(notePath, Date.now());
	}, []);

	const isRecentLocalMutation = useCallback((notePath: string) => {
		const timestamp = localMutationTimestampsRef.current.get(notePath);
		if (!timestamp) return false;
		if (Date.now() - timestamp < 1500) {
			return true;
		}
		localMutationTimestampsRef.current.delete(notePath);
		return false;
	}, []);

	const detectNoteKind = useCallback(async () => {
		try {
			setDetectError("");
			const doc = await invoke("vault_read_text", { path: relPath });
			const isDatabase = isDatabaseNote(doc.text);
			setNoteKind(isDatabase ? "database" : "markdown");
			setMode((current) => (isDatabase ? current : "markdown"));
		} catch (error) {
			setDetectError(extractErrorMessage(error));
			setNoteKind("markdown");
		}
	}, [relPath]);

	useEffect(() => {
		setNoteKind("loading");
		setMode("database");
		setDatabaseView("table");
		void detectNoteKind();
	}, [detectNoteKind]);

	useEffect(() => {
		const persistedLayout = currentConfig?.view.layout;
		if (persistedLayout !== "table" && persistedLayout !== "board") return;
		setDatabaseView((current) =>
			current === persistedLayout ? current : persistedLayout,
		);
	}, [currentConfig?.view.layout]);

	useEffect(() => {
		onDirtyChange?.(false);
	}, [onDirtyChange]);

	const tableState = useDatabaseTable({
		rows: data?.rows ?? [],
		config:
			data?.config ??
			({
				source: { kind: "folder", value: "", recursive: true },
				new_note: { folder: "", title_prefix: "Untitled" },
				view: { layout: "table", board_group_by: null },
				columns: [],
				sorts: [],
				filters: [],
			} satisfies DatabaseConfig),
	});

	const activeSort = data?.config.sorts[0] ?? null;

	const shouldReloadForPath = useCallback(
		(changedPath: string) => {
			if (
				!currentConfig ||
				noteKind !== "database" ||
				!isMarkdownPath(changedPath)
			) {
				return false;
			}

			switch (currentConfig.source.kind) {
				case "folder": {
					const sourceDir = normalizeRelPath(currentConfig.source.value);
					if (!sourceDir) {
						return (
							currentConfig.source.recursive || parentDir(changedPath) === ""
						);
					}
					if (currentConfig.source.recursive) {
						return changedPath.startsWith(`${sourceDir}/`);
					}
					return parentDir(changedPath) === sourceDir;
				}
				case "tag":
				case "search":
					return true;
			}
		},
		[currentConfig, noteKind],
	);

	useTauriEvent("vault:fs_changed", (payload) => {
		const changedPath = normalizeRelPath(payload.rel_path);
		if (!changedPath) return;
		if (isRecentLocalMutation(changedPath)) {
			return;
		}
		if (changedPath === normalizedRelPath) {
			void detectNoteKind();
			return;
		}
		if (shouldReloadForPath(changedPath)) {
			void reload();
		}
	});

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
			markLocalMutation(notePath);
			try {
				await updateCell(notePath, column, value);
			} catch (error) {
				setActionError(extractErrorMessage(error));
			}
		},
		[markLocalMutation, updateCell],
	);

	const handleSaveConfig = useCallback(
		async (nextConfig: DatabaseConfig) => {
			try {
				setActionError("");
				await saveConfig(nextConfig);
			} catch (error) {
				setActionError(extractErrorMessage(error));
			}
		},
		[saveConfig],
	);

	const handleDatabaseViewChange = useCallback(
		(nextView: "table" | "board") => {
			startTransition(() => setDatabaseView(nextView));
			if (!currentConfig || currentConfig.view.layout === nextView) {
				return;
			}
			void handleSaveConfig({
				...currentConfig,
				view: {
					...currentConfig.view,
					layout: nextView,
				},
			});
		},
		[currentConfig, handleSaveConfig],
	);

	const handleBoardGroupByChange = useCallback(
		(nextGroupColumnId: string | null) => {
			if (!currentConfig) return;
			if ((currentConfig.view.board_group_by ?? null) === nextGroupColumnId) {
				return;
			}
			void handleSaveConfig({
				...currentConfig,
				view: {
					...currentConfig.view,
					board_group_by: nextGroupColumnId,
				},
			});
		},
		[currentConfig, handleSaveConfig],
	);

	const handleToggleSort = useCallback(
		async (column: DatabaseColumn) => {
			if (!data) return;
			const current = data.config.sorts[0];
			let nextSorts: DatabaseSort[] = [];
			if (!current || current.column_id !== column.id) {
				nextSorts = [{ column_id: column.id, direction: "asc" }];
			} else if (current.direction === "asc") {
				nextSorts = [{ column_id: column.id, direction: "desc" }];
			}
			await handleSaveConfig({
				...data.config,
				sorts: nextSorts,
			});
		},
		[data, handleSaveConfig],
	);

	const handleCreateDefaultBoardGroupField = useCallback(async () => {
		if (!currentConfig) return;
		const existingStatus = currentConfig.columns.find(
			(column) =>
				column.type === "property" && column.property_key === "status",
		);
		if (existingStatus) {
			void handleBoardGroupByChange(existingStatus.id);
			setColumnsOpen(true);
			return;
		}
		await handleSaveConfig({
			...currentConfig,
			view: {
				...currentConfig.view,
				board_group_by: "property:status",
			},
			columns: [
				...currentConfig.columns,
				{
					id: "property:status",
					type: "property",
					label: "Status",
					icon: defaultDatabaseColumnIconName({
						type: "property",
						property_kind: "text",
					}),
					width: 180,
					visible: true,
					property_key: "status",
					property_kind: "text",
				},
			],
		});
	}, [currentConfig, handleBoardGroupByChange, handleSaveConfig]);

	const selectedRow = useMemo(
		() =>
			tableState.rows.find(
				(row) => row.note_path === tableState.selectedRowPath,
			) ?? null,
		[tableState.rows, tableState.selectedRowPath],
	);

	if (noteKind === "loading") {
		return <div className="databaseLoadingState">Loading note…</div>;
	}

	if (noteKind === "markdown") {
		return (
			<div className="databaseHostPane">
				{detectError ? (
					<div className="databaseNotice databaseNoticeError">
						{detectError}
					</div>
				) : null}
				<Suspense
					fallback={<div className="databaseLoadingState">Loading note…</div>}
				>
					<LazyMarkdownEditorPane
						relPath={relPath}
						onDirtyChange={onDirtyChange}
					/>
				</Suspense>
			</div>
		);
	}

	return (
		<div className="databaseHostPane">
			{currentConfig ? (
				<>
					<DatabaseToolbar
						mode={mode}
						databaseView={databaseView}
						config={currentConfig}
						rowCount={tableState.rows.length}
						truncated={Boolean(data?.truncated)}
						selectedRowPath={tableState.selectedRowPath}
						onModeChange={setMode}
						onDatabaseViewChange={handleDatabaseViewChange}
						onAddRow={() =>
							void (async () => {
								try {
									setActionError("");
									const createdPath = await createRow();
									if (createdPath) {
										tableState.setSelectedRowPath(createdPath);
									}
								} catch (error) {
									setActionError(extractErrorMessage(error));
								}
							})()
						}
						onOpenSelected={() =>
							void (selectedRow
								? onOpenFile(selectedRow.note_path)
								: Promise.resolve())
						}
						onReload={() => void reload()}
						onOpenSource={() => setSourceOpen(true)}
						onOpenColumns={() => setColumnsOpen(true)}
						onOpenFilters={() => setFiltersOpen(true)}
					/>
					{mode === "markdown" ? (
						<Suspense
							fallback={
								<div className="databaseLoadingState">Loading note…</div>
							}
						>
							<LazyMarkdownEditorPane
								relPath={relPath}
								onDirtyChange={onDirtyChange}
							/>
						</Suspense>
					) : (
						<>
							{actionError || error ? (
								<div className="databaseNotice databaseNoticeError">
									{actionError || error}
								</div>
							) : null}
							{loading ? (
								<div className="databaseLoadingState">Loading database…</div>
							) : (
								<>
									{databaseView === "table" ? (
										<DatabaseTable
											rows={tableState.rows}
											columns={tableState.visibleColumns}
											selectedRowPath={tableState.selectedRowPath}
											activeSort={activeSort}
											onSelectRow={tableState.setSelectedRowPath}
											onOpenRow={(notePath) => void onOpenFile(notePath)}
											onToggleSort={(column) => void handleToggleSort(column)}
											onSaveCell={handleUpdateCell}
										/>
									) : (
										<DatabaseBoard
											rows={tableState.rows}
											columns={currentConfig.columns}
											visibleColumns={tableState.visibleColumns}
											groupColumnId={currentConfig.view.board_group_by ?? null}
											selectedRowPath={tableState.selectedRowPath}
											onSelectRow={tableState.setSelectedRowPath}
											onOpenRow={(notePath) => void onOpenFile(notePath)}
											onOpenColumns={() => setColumnsOpen(true)}
											onCreateDefaultGroupField={() =>
												void handleCreateDefaultBoardGroupField()
											}
											onGroupColumnIdChange={handleBoardGroupByChange}
											onSaveCell={handleUpdateCell}
										/>
									)}
								</>
							)}
						</>
					)}
					<DatabaseColumnDialog
						open={columnsOpen}
						config={currentConfig}
						availableProperties={data?.available_properties ?? []}
						onOpenChange={setColumnsOpen}
						onChangeConfig={handleSaveConfig}
					/>
					<DatabaseSourceDialog
						open={sourceOpen}
						config={currentConfig}
						onOpenChange={setSourceOpen}
						onChangeConfig={handleSaveConfig}
					/>
					<DatabaseFilterDialog
						open={filtersOpen}
						config={currentConfig}
						onOpenChange={setFiltersOpen}
						onChangeConfig={handleSaveConfig}
					/>
				</>
			) : (
				<div className="databaseLoadingState">Loading database…</div>
			)}
			{mode === "database" && selectedRow ? (
				<div className="databaseFooter">
					<div className="databaseFooterMeta">
						<div className="databaseFooterTitle">{selectedRow.title}</div>
						<div className="databaseFooterPath">{selectedRow.note_path}</div>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => void onOpenFile(selectedRow.note_path)}
					>
						Open note
					</Button>
				</div>
			) : null}
		</div>
	);
}
