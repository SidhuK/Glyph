import {
	LibraryIcon,
	MoreVerticalIcon,
	NoteIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { emit } from "@tauri-apps/api/event";
import {
	type MouseEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useStatusPropertyColors } from "../../hooks/useStatusPropertyColors";
import { boardCreateValue } from "../../lib/database/board";
import { defaultDatabaseColumnIconName } from "../../lib/database/columnIcons";
import {
	readStoredSelectedDatabaseId,
	readStoredSelectedViewId,
	writeStoredSelectedDatabaseId,
	writeStoredSelectedViewId,
} from "../../lib/database/selectedViewStorage";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type NativeContextMenuItem,
	isNativeContextMenuAvailable,
	showNativePopupMenu,
} from "../../lib/nativeContextMenu";
import {
	getPrefetchedDatabaseRows,
	getPrefetchedDatabaseSummaries,
	invalidateDatabasePrefetch,
	invalidateDatabaseRowsPrefetch,
	invalidateDatabaseSummariesPrefetch,
	prefetchDatabaseDocument,
	prefetchDatabaseRows,
	prefetchDatabaseSummaries,
	setPrefetchedDatabaseDocument,
	setPrefetchedDatabaseRows,
} from "../../lib/navigationPrefetch";
import { loadSettings } from "../../lib/settings";
import {
	type DatabaseColumn,
	type DatabaseConfig,
	type DatabaseCreateRowInitialValue,
	type DatabaseRow,
	type DatabaseSort,
	type WorkspaceDatabaseDefinition,
	type WorkspaceDatabaseDocument,
	type WorkspaceDatabaseQueryResult,
	type WorkspaceDatabaseSummary,
	invoke,
} from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { ChevronDown, Edit, Kanban, Plus, Table, Trash2 } from "../Icons";
import { CanvasPaneAwait } from "../app/CanvasPaneAwait";
import { DatabaseBoard } from "../database/DatabaseBoard";
import { DatabaseTable } from "../database/DatabaseTable";
import { DatabaseToolbar } from "../database/DatabaseToolbar";
import { Button } from "../ui/shadcn/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { Input } from "../ui/shadcn/input";

interface DatabasesPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
	onRenameNotePath?: (
		notePath: string,
		nextName: string,
	) => Promise<string | null>;
	initialDatabaseId?: string | null;
	openRequestNonce?: number;
	initialDocument?: WorkspaceDatabaseDocument | null;
	initialRows?: WorkspaceDatabaseQueryResult | null;
}

const EMPTY_BOARD_LANE_COLORS: Record<string, string> = {};
const EMPTY_BOARD_LANE_ORDER: Record<string, string[]> = {};
const EMPTY_BOARD_CARD_ORDER: Record<string, Record<string, string[]>> = {};
const EMPTY_BOARD_CARD_FIELDS: string[] = [];
const MIN_DATABASE_COLUMN_WIDTH = 120;
const MAX_DATABASE_COLUMN_WIDTH = 900;

function fileNameFromTitle(notePath: string, nextTitle: string): string {
	const currentName = notePath.split("/").pop()?.trim() || "Untitled.md";
	const trimmedTitle = nextTitle.trim();
	const fallbackDotIndex = currentName.lastIndexOf(".");
	if (fallbackDotIndex <= 0 || fallbackDotIndex === currentName.length - 1) {
		return trimmedTitle || currentName;
	}
	const ext = currentName.slice(fallbackDotIndex);
	const fallbackStem = currentName.slice(0, fallbackDotIndex).trim();
	const stem = trimmedTitle || fallbackStem || "Untitled";
	return `${stem}${ext}`;
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
			search: view.search ?? "",
			board_group_by: view.grouping?.column_id ?? null,
			board_lane_colors: view.board_lane_colors ?? EMPTY_BOARD_LANE_COLORS,
			board_lane_order: view.board_lane_order ?? EMPTY_BOARD_LANE_ORDER,
			board_card_order: view.board_card_order ?? EMPTY_BOARD_CARD_ORDER,
			board_card_fields: view.board_card_fields ?? EMPTY_BOARD_CARD_FIELDS,
		},
		columns: view.columns,
		sorts: view.sorts,
		filters: view.filters,
	};
}

function initialSelectedViewId(
	databaseId: string | null,
	document: WorkspaceDatabaseDocument | null,
): string | null {
	if (!databaseId || !document || document.database.id !== databaseId) {
		return null;
	}
	const storedViewId = readStoredSelectedViewId(databaseId);
	if (
		storedViewId &&
		document.database.views.some((view) => view.id === storedViewId)
	) {
		return storedViewId;
	}
	return document.database.views[0]?.id ?? null;
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
						search: config.view.search ?? "",
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
						board_card_order:
							config.view.board_card_order ?? EMPTY_BOARD_CARD_ORDER,
						board_card_fields:
							config.view.board_card_fields ?? EMPTY_BOARD_CARD_FIELDS,
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

function DatabasesPaneContent({
	onOpenFile,
	onRenameNotePath,
	initialDatabaseId = null,
	openRequestNonce,
	initialDocument = null,
	initialRows = null,
}: DatabasesPaneProps) {
	const [summaries, setSummaries] = useState<WorkspaceDatabaseSummary[]>(
		() => getPrefetchedDatabaseSummaries() ?? [],
	);
	const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(
		() => initialDatabaseId ?? readStoredSelectedDatabaseId(),
	);
	const [selectedViewId, setSelectedViewId] = useState<string | null>(() => {
		const databaseId =
			initialDocument?.database.id ?? initialDatabaseId ?? null;
		return initialSelectedViewId(databaseId, initialDocument);
	});
	const [document, setDocument] = useState<WorkspaceDatabaseDocument | null>(
		initialDocument,
	);
	const [rows, setRows] = useState<DatabaseRow[]>(
		() => initialRows?.rows ?? [],
	);
	const [rowsTruncated, setRowsTruncated] = useState(
		() => initialRows?.truncated ?? false,
	);
	const [loading, setLoading] = useState(() => !initialDocument);
	const [error, setError] = useState("");
	const [selectedRowPath, setSelectedRowPath] = useState<string | null>(null);
	const [nameDraft, setNameDraft] = useState("");
	const [renamingViewId, setRenamingViewId] = useState<string | null>(null);
	const [viewNameDraft, setViewNameDraft] = useState("");
	const viewNameInputRef = useRef<HTMLInputElement | null>(null);
	const skipNextViewMenuAutoFocusRef = useRef(false);
	const [viewOptionsOpen, setViewOptionsOpen] = useState(false);
	const rowRequestTokenRef = useRef(0);
	const fsRowsRefreshTimerRef = useRef<number | null>(null);
	const previousOpenRequestRef = useRef({
		databaseId: initialDatabaseId,
		nonce: openRequestNonce ?? null,
	});
	const [showDatabaseColumnColor, setShowDatabaseColumnColor] = useState(true);
	const { colors: statusColors, setStatusColor } = useStatusPropertyColors();

	useEffect(() => {
		const nextOpenRequest = {
			databaseId: initialDatabaseId,
			nonce: openRequestNonce ?? null,
		};
		const previousOpenRequest = previousOpenRequestRef.current;
		const requestChanged =
			previousOpenRequest.databaseId !== nextOpenRequest.databaseId ||
			previousOpenRequest.nonce !== nextOpenRequest.nonce;
		previousOpenRequestRef.current = nextOpenRequest;

		if (!initialDatabaseId || !requestChanged) {
			return;
		}

		setSelectedDatabaseId(initialDatabaseId);
		setSelectedViewId(
			initialSelectedViewId(initialDatabaseId, initialDocument),
		);
	}, [initialDatabaseId, initialDocument, openRequestNonce]);

	const loadSummaries = useCallback(async () => {
		const next = await prefetchDatabaseSummaries();
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
	});

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
		const cachedDocument = prefetchDatabaseDocument(selectedDatabaseId);
		setLoading(document?.database.id !== selectedDatabaseId);
		setError("");
		if (document?.database.id !== selectedDatabaseId) {
			setRows([]);
		}
		void cachedDocument
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
	}, [document?.database.id, selectedDatabaseId]);

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

	const activeGroupColumn = useMemo(
		() =>
			groupColumns.find(
				(column) => column.id === activeConfig?.view.board_group_by,
			) ?? null,
		[groupColumns, activeConfig?.view.board_group_by],
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
				setRowsTruncated(false);
			}
			return;
		}
		try {
			const next = await prefetchDatabaseRows(
				selectedDatabaseId,
				selectedViewId,
			);
			if (rowRequestTokenRef.current !== requestToken) {
				return;
			}
			setRows(next.rows);
			setRowsTruncated(next.truncated);
			setPrefetchedDatabaseRows(selectedDatabaseId, selectedViewId, next);
		} catch (cause) {
			if (rowRequestTokenRef.current !== requestToken) {
				return;
			}
			setError(extractErrorMessage(cause));
		}
	}, [document, selectedDatabaseId, selectedViewId]);

	useEffect(() => {
		if (!selectedDatabaseId || !selectedViewId) return;
		const cachedRows = getPrefetchedDatabaseRows(
			selectedDatabaseId,
			selectedViewId,
		);
		if (cachedRows) {
			setRows(cachedRows.rows);
			setRowsTruncated(cachedRows.truncated);
			void loadRows();
			return;
		}
		void loadRows();
	}, [loadRows, selectedDatabaseId, selectedViewId]);

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

	const scheduleRowsRefreshForNoteChange = useCallback(
		(payload: { rel_path: string; removed: boolean }) => {
			if (!payload.rel_path.toLowerCase().endsWith(".md")) return;
			rowRequestTokenRef.current += 1;
			if (fsRowsRefreshTimerRef.current !== null) {
				window.clearTimeout(fsRowsRefreshTimerRef.current);
			}
			fsRowsRefreshTimerRef.current = window.setTimeout(() => {
				fsRowsRefreshTimerRef.current = null;
				if (selectedDatabaseId) {
					invalidateDatabaseRowsPrefetch(selectedDatabaseId);
				}
				void loadRows();
			}, 150);
		},
		[loadRows, selectedDatabaseId],
	);

	useTauriEvent("space:fs_changed", scheduleRowsRefreshForNoteChange);
	useTauriEvent("notes:external_changed", scheduleRowsRefreshForNoteChange);

	const saveDatabase = useCallback(
		async (nextDatabase: WorkspaceDatabaseDefinition) => {
			try {
				const saved = await invoke("databases_update", {
					database: nextDatabase,
				});
				setError("");
				setDocument(saved);
				setNameDraft(saved.database.name);
				invalidateDatabasePrefetch(saved.database.id);
				setPrefetchedDatabaseDocument(saved.database.id, saved);
				invalidateDatabaseSummariesPrefetch();
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

	const handleResizeColumn = useCallback(
		(columnId: string, width: number) => {
			if (!activeConfig) return;
			const nextWidth = Math.min(
				MAX_DATABASE_COLUMN_WIDTH,
				Math.max(MIN_DATABASE_COLUMN_WIDTH, Math.round(width)),
			);
			const currentWidth =
				activeConfig.columns.find((column) => column.id === columnId)?.width ??
				null;
			if (currentWidth != null && Math.round(currentWidth) === nextWidth)
				return;
			void handleSaveConfig({
				...activeConfig,
				columns: activeConfig.columns.map((column) =>
					column.id === columnId ? { ...column, width: nextWidth } : column,
				),
			});
		},
		[activeConfig, handleSaveConfig],
	);

	const handleChangeColumnIcon = useCallback(
		(columnId: string, iconName: string | null) => {
			if (!activeConfig) return;
			const nextIcon = iconName?.trim() || null;
			const currentIcon =
				activeConfig.columns.find((column) => column.id === columnId)?.icon ??
				null;
			if (currentIcon === nextIcon) return;
			void handleSaveConfig({
				...activeConfig,
				columns: activeConfig.columns.map((column) =>
					column.id === columnId ? { ...column, icon: nextIcon } : column,
				),
			});
		},
		[activeConfig, handleSaveConfig],
	);

	const handleCreateDatabase = useCallback(async () => {
		try {
			const created = await invoke("databases_create", {
				name: nextDatabaseName(summaries),
			});
			setError("");
			invalidateDatabaseSummariesPrefetch();
			setPrefetchedDatabaseDocument(created.database.id, created);
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
			invalidateDatabasePrefetch(document.database.id);
			invalidateDatabaseSummariesPrefetch();
			setDocument(null);
			setRows([]);
			setRowsTruncated(false);
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
				if (document && selectedViewId) {
					invalidateDatabasePrefetch(document.database.id);
					setPrefetchedDatabaseDocument(document.database.id, document);
				}
				void loadRows();
				void emit("notes:external_changed", {
					rel_path: notePath,
					removed: false,
				});
			} catch (cause) {
				setError(extractErrorMessage(cause));
				throw cause;
			}
		},
		[document, loadRows, selectedViewId],
	);

	const handleRenameRowTitle = useCallback(
		async (notePath: string, nextTitle: string): Promise<boolean> => {
			const title = nextTitle.trim();
			if (!title) return false;
			const titleColumn = activeConfig?.columns.find(
				(column) => column.type === "title",
			);
			if (!titleColumn) return false;
			const originalName = notePath.split("/").pop()?.trim() || "Untitled.md";
			let renamedPath: string | null = null;
			try {
				let targetPath = notePath;
				if (onRenameNotePath) {
					const nextName = fileNameFromTitle(notePath, title);
					renamedPath = await onRenameNotePath(notePath, nextName);
					if (!renamedPath) return false;
					targetPath = renamedPath;
				}
				await handleUpdateCell(targetPath, titleColumn, {
					kind: "text",
					value_text: title,
					value_list: [],
				});
				if (renamedPath && renamedPath !== notePath) {
					setRows((current) =>
						current.filter((row) => row.note_path !== notePath),
					);
					setSelectedRowPath((current) =>
						current === notePath ? renamedPath : current,
					);
				}
				return true;
			} catch (cause) {
				if (onRenameNotePath && renamedPath && renamedPath !== notePath) {
					try {
						await onRenameNotePath(renamedPath, originalName);
					} catch {
						// Keep the original error path; rollback is best effort.
					}
				}
				setError(extractErrorMessage(cause));
				return false;
			}
		},
		[activeConfig?.columns, handleUpdateCell, onRenameNotePath],
	);

	const handleCreateRow = useCallback(
		async (
			initialValue?: { column: DatabaseColumn; laneId: string } | null,
		) => {
			if (!document) return;
			const createdValue =
				initialValue != null
					? boardCreateValue(initialValue.column, initialValue.laneId)
					: null;
			const initialValues: DatabaseCreateRowInitialValue[] =
				initialValue != null && createdValue != null
					? [{ column: initialValue.column, value: createdValue }]
					: [];
			try {
				const created = await invoke("databases_create_row", {
					database_id: document.database.id,
					initial_values: initialValues,
				});
				setError("");
				invalidateDatabasePrefetch(document.database.id);
				setPrefetchedDatabaseDocument(document.database.id, document);
				setSelectedRowPath(created.note_path);
				setRows((current) =>
					current.some((row) => row.note_path === created.note_path)
						? current.map((row) =>
								row.note_path === created.note_path ? created.row : row,
							)
						: [created.row, ...current],
				);
				void loadRows();
			} catch (cause) {
				setError(extractErrorMessage(cause));
			}
		},
		[document, loadRows],
	);

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
					search: "",
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
					board_card_order: {},
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

	useEffect(() => {
		if (!renamingViewId) return;
		const frame = requestAnimationFrame(() => {
			viewNameInputRef.current?.focus({ preventScroll: true });
			viewNameInputRef.current?.select();
		});
		return () => cancelAnimationFrame(frame);
	}, [renamingViewId]);

	const startViewRename = useCallback(
		(viewId: string) => {
			const view = document?.database.views.find((v) => v.id === viewId);
			if (!view) return;
			skipNextViewMenuAutoFocusRef.current = true;
			setViewNameDraft(view.name);
			setRenamingViewId(viewId);
		},
		[document],
	);

	const commitViewRename = useCallback(() => {
		skipNextViewMenuAutoFocusRef.current = false;
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

	const handleSelectViewLayout = useCallback(
		(layout: DatabaseConfig["view"]["layout"]) => {
			if (!activeConfig || activeView?.layout === layout) return;
			void handleSaveConfig({
				...activeConfig,
				view: {
					...activeConfig.view,
					layout,
				},
			});
		},
		[activeConfig, activeView?.layout, handleSaveConfig],
	);

	const handleRenameActiveView = useCallback(() => {
		if (!activeView) return;
		startViewRename(activeView.id);
	}, [activeView, startViewRename]);

	const handleDeleteActiveView = useCallback(() => {
		if (!activeView) return;
		void handleDeleteView(activeView.id);
	}, [activeView, handleDeleteView]);

	const collectionMenuItems = useMemo<NativeContextMenuItem[]>(() => {
		const items: NativeContextMenuItem[] = summaries.map((summary) => ({
			label: summary.name,
			checked: summary.id === selectedDatabaseId,
			action: () => setSelectedDatabaseId(summary.id),
		}));

		if (summaries.length > 0) {
			items.push({ type: "separator" });
		}

		items.push({
			label: "New collection",
			action: () => void handleCreateDatabase(),
		});

		return items;
	}, [handleCreateDatabase, selectedDatabaseId, summaries]);

	const viewActionMenuItems = useMemo<NativeContextMenuItem[]>(() => {
		if (!activeView) return [];

		return [
			{
				label: "Table",
				checked: activeView.layout === "table",
				action: () => handleSelectViewLayout("table"),
			},
			{
				label: "Board",
				checked: activeView.layout === "board",
				action: () => handleSelectViewLayout("board"),
			},
			{ type: "separator" },
			{
				label: "Rename",
				action: handleRenameActiveView,
			},
			{ type: "separator" },
			{
				label: "Delete view",
				enabled: (document?.database.views.length ?? 0) > 1,
				action: handleDeleteActiveView,
			},
		];
	}, [
		activeView,
		document?.database.views.length,
		handleDeleteActiveView,
		handleRenameActiveView,
		handleSelectViewLayout,
	]);

	const handleCollectionNativeMenu = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			void showNativePopupMenu(event, collectionMenuItems).catch(
				(error: unknown) => {
					console.error("Failed to show collection menu", error);
				},
			);
		},
		[collectionMenuItems],
	);

	const handleViewNativeMenu = useCallback(
		(event: MouseEvent<HTMLButtonElement>) => {
			void showNativePopupMenu(event, viewActionMenuItems).catch(
				(error: unknown) => {
					console.error("Failed to show view options menu", error);
				},
			);
		},
		[viewActionMenuItems],
	);

	const nativeActionMenusEnabled = isNativeContextMenuAvailable();

	if (loading) {
		return <CanvasPaneAwait variant="databases" />;
	}

	return (
		<div className="databaseHostPane">
			<div className="databasesTopBar">
				<div className="databasesTopBarLeft">
					{nativeActionMenusEnabled ? (
						<button
							type="button"
							className="databasesDropdownTrigger"
							onClick={handleCollectionNativeMenu}
						>
							<HugeiconsIcon
								icon={LibraryIcon}
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
							<span className="databasesDropdownTriggerLabel">
								{document?.database.name ?? "Select collection"}
							</span>
							<ChevronDown size="var(--icon-sm)" />
						</button>
					) : (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button type="button" className="databasesDropdownTrigger">
									<HugeiconsIcon
										icon={LibraryIcon}
										size="var(--icon-md)"
										strokeWidth={0.9}
									/>
									<span className="databasesDropdownTriggerLabel">
										{document?.database.name ?? "Select collection"}
									</span>
									<ChevronDown size="var(--icon-sm)" />
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
											size="var(--icon-sm)"
											strokeWidth={0.9}
										/>
										<span>{summary.name}</span>
									</DropdownMenuItem>
								))}
								{summaries.length > 0 ? <DropdownMenuSeparator /> : null}
								<DropdownMenuItem
									onSelect={() => void handleCreateDatabase()}
									className="databasesDropdownItem databasesCollectionMenuItem"
								>
									<Plus size="var(--icon-sm)" />
									<span>New collection</span>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					{document && activeConfig ? (
						<>
							<Input
								value={nameDraft}
								className="plainTextInput databasesInlineNameInput"
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
						</>
					) : null}
				</div>

				{document ? (
					<div className="databasesTopBarRight">
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
							<Trash2 size="var(--icon-md)" />
						</Button>
						<button
							type="button"
							className="databaseToolbarChip is-accent"
							onClick={() => void handleCreateRow()}
							title="New note"
						>
							<HugeiconsIcon
								icon={NoteIcon}
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
							New Note
						</button>
					</div>
				) : null}
			</div>

			{document && activeConfig && activeView ? (
				<>
					<div className="databasesViewBar">
						{renamingViewId === activeView.id ? (
							<input
								ref={viewNameInputRef}
								type="text"
								className="plainTextInput databasesViewTabRenameInput"
								value={viewNameDraft}
								aria-label="View name"
								onChange={(event) => setViewNameDraft(event.target.value)}
								onBlur={commitViewRename}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										commitViewRename();
									}
									if (event.key === "Escape") {
										event.preventDefault();
										skipNextViewMenuAutoFocusRef.current = false;
										setRenamingViewId(null);
									}
								}}
							/>
						) : (
							<select
								aria-label="Database view"
								className="databasesViewSelect"
								value={activeView.id}
								onChange={(event) =>
									setSelectedViewId(event.currentTarget.value)
								}
							>
								{document.database.views.map((view) => (
									<option key={view.id} value={view.id}>
										{view.name}
									</option>
								))}
							</select>
						)}
						{nativeActionMenusEnabled ? (
							<button
								type="button"
								className="databasesViewTabMenu databaseToolbarChip"
								title="View options"
								aria-label={`View options for ${activeView.name}`}
								onClick={handleViewNativeMenu}
							>
								<HugeiconsIcon
									icon={MoreVerticalIcon}
									className="databasesViewTabMenuIcon"
									size="var(--icon-md)"
									strokeWidth={0.9}
									color="currentColor"
									aria-hidden
								/>
							</button>
						) : (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										className="databasesViewTabMenu databaseToolbarChip"
										title="View options"
										aria-label={`View options for ${activeView.name}`}
									>
										<HugeiconsIcon
											icon={MoreVerticalIcon}
											className="databasesViewTabMenuIcon"
											size="var(--icon-md)"
											strokeWidth={0.9}
											color="currentColor"
											aria-hidden
										/>
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="start"
									className="databasesDropdownContent databasesViewTabMenuContent"
									onCloseAutoFocus={(event) => {
										if (skipNextViewMenuAutoFocusRef.current) {
											event.preventDefault();
											skipNextViewMenuAutoFocusRef.current = false;
										}
									}}
								>
									<DropdownMenuLabel className="databasesViewTabMenuLabel">
										View type
									</DropdownMenuLabel>
									<DropdownMenuItem
										onSelect={() => handleSelectViewLayout("table")}
										className="databasesDropdownItem databasesViewTabMenuItem"
									>
										<Table size="var(--icon-sm)" />
										<span>Table</span>
									</DropdownMenuItem>
									<DropdownMenuItem
										onSelect={() => handleSelectViewLayout("board")}
										className="databasesDropdownItem databasesViewTabMenuItem"
									>
										<Kanban size="var(--icon-sm)" />
										<span>Board</span>
									</DropdownMenuItem>
									<DropdownMenuSeparator className="databasesViewTabMenuSeparator" />
									<DropdownMenuItem
										onSelect={handleRenameActiveView}
										className="databasesDropdownItem databasesViewTabMenuItem"
									>
										<Edit size="var(--icon-sm)" />
										<span>Rename</span>
									</DropdownMenuItem>
									<DropdownMenuSeparator className="databasesViewTabMenuSeparator" />
									<DropdownMenuItem
										disabled={document.database.views.length <= 1}
										onSelect={handleDeleteActiveView}
										className="databasesDropdownItem databasesDropdownItemDanger databasesViewTabMenuItem"
									>
										<Trash2 size="var(--icon-sm)" />
										<span>Delete view</span>
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
						<button
							type="button"
							className="databasesViewTabCreate databaseToolbarChip"
							onClick={() => void handleCreateView()}
							title="Add view"
							aria-label="Add view"
						>
							<Plus size="var(--icon-sm)" />
						</button>
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
							onChangeConfig={handleSaveConfig}
							viewOptionsOpen={viewOptionsOpen}
							onViewOptionsOpenChange={setViewOptionsOpen}
						/>
					</div>
					{error ? (
						<div className="databaseNotice databaseNoticeError">{error}</div>
					) : null}
					{rowsTruncated ? (
						<div className="databaseNotice">
							Limited to the first 200 notes.
						</div>
					) : null}
					{activeConfig.view.layout === "board" ? (
						<DatabaseBoard
							rows={rows}
							columns={activeConfig.columns}
							groupColumnId={activeConfig.view.board_group_by ?? null}
							laneOrderByGroup={
								activeConfig.view.board_lane_order ?? EMPTY_BOARD_LANE_ORDER
							}
							cardOrderByGroup={
								activeConfig.view.board_card_order ?? EMPTY_BOARD_CARD_ORDER
							}
							laneColors={activeConfig.view.board_lane_colors ?? {}}
							statusColors={statusColors}
							showColumnColor={showDatabaseColumnColor}
							selectedRowPath={selectedRowPath}
							onSelectRow={setSelectedRowPath}
							onOpenRow={(notePath) => void onOpenFile(notePath)}
							onCreateRow={handleCreateRow}
							onOpenColumns={() => setViewOptionsOpen(true)}
							boardCardFields={
								activeConfig.view.board_card_fields ?? EMPTY_BOARD_CARD_FIELDS
							}
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
							onCardOrderChange={(groupColumnId, cardOrder) =>
								void handleSaveConfig({
									...activeConfig,
									view: {
										...activeConfig.view,
										board_card_order: {
											...(activeConfig.view.board_card_order ?? {}),
											[groupColumnId]: cardOrder,
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
							onStatusColorChange={setStatusColor}
							onSaveCell={handleUpdateCell}
						/>
					) : (
						<DatabaseTable
							rows={rows}
							columns={visibleColumns}
							laneColors={activeConfig.view.board_lane_colors ?? {}}
							statusColors={statusColors}
							onStatusColorChange={setStatusColor}
							selectedRowPath={selectedRowPath}
							activeSort={
								(activeConfig.sorts[0] as DatabaseSort | null) ?? null
							}
							groupColumn={activeGroupColumn}
							onSelectRow={setSelectedRowPath}
							onOpenRow={(notePath) => void onOpenFile(notePath)}
							onCreateRow={handleCreateRow}
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
							onChangeColumnIcon={handleChangeColumnIcon}
							onSaveCell={handleUpdateCell}
							onRenameTitle={handleRenameRowTitle}
							onResizeColumn={handleResizeColumn}
						/>
					)}
				</>
			) : (
				<div className="databasesEmptyState">
					<HugeiconsIcon
						icon={LibraryIcon}
						size="var(--icon-3xl)"
						strokeWidth={0.9}
					/>
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
							<Plus size="var(--icon-sm)" />
							Create Collection
						</Button>
					) : null}
				</div>
			)}
		</div>
	);
}

export function DatabasesPane(props: DatabasesPaneProps) {
	return (
		<DatabasesPaneContent key={props.initialDatabaseId ?? ""} {...props} />
	);
}
