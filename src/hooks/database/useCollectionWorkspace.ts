import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	collectionFolderBreadcrumbParts,
	normalizeCollectionFolderPath,
} from "../../lib/database/collection";
import type { DatabasesOpenRequest } from "../../lib/database/openDatabasesRequest";
import {
	readStoredSelectedDatabaseId,
	readStoredSelectedViewId,
	resolveSelectedDatabaseId,
	resolveSelectedViewId,
	writeStoredSelectedDatabaseId,
	writeStoredSelectedViewId,
} from "../../lib/database/selectedViewStorage";
import { shouldReloadSummaries } from "../../lib/database/summaries";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	databaseDocumentQueryOptions,
	databaseSummariesQueryOptions,
	getPrefetchedDatabaseSummaries,
	invalidateDatabasePrefetch,
	invalidateDatabaseSummariesPrefetch,
	setPrefetchedDatabaseDocument,
} from "../../lib/navigationPrefetch";
import type { SpaceChange } from "../../lib/spaceChange";
import type {
	WorkspaceDatabaseDefinition,
	WorkspaceDatabaseDocument,
} from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { normalizeRelPath, parentDir } from "../../utils/path";
import type { PaneErrorHandlers, SaveDatabaseInput } from "./types";

export interface UseCollectionWorkspaceOptions extends PaneErrorHandlers {
	databasesOpenRequest: DatabasesOpenRequest;
	initialDocument?: WorkspaceDatabaseDocument | null;
}

const COLLECTION_DOCUMENT_REFRESH_MS = 200;

function changedRelPaths(change: SpaceChange): string[] {
	if (change.kind === "batch") {
		return change.changes.flatMap(changedRelPaths);
	}
	if (change.kind === "rename") {
		return [change.from_path, change.to_path];
	}
	return [change.rel_path];
}

function pathTouchesFolder(
	relPath: string,
	folder: string,
	recursive: boolean,
): boolean {
	const rel = normalizeRelPath(relPath);
	const root = normalizeCollectionFolderPath(folder);
	if (!root) return true;
	if (rel === root || root.startsWith(`${rel}/`)) return true;
	if (!rel.startsWith(`${root}/`)) return false;
	return recursive || parentDir(rel) === root;
}

function collectionChangeIsRelevant(
	change: SpaceChange,
	source: WorkspaceDatabaseDefinition["source"],
): boolean {
	if (source.kind !== "folder") return true;
	return changedRelPaths(change).some((relPath) =>
		pathTouchesFolder(relPath, source.value, source.recursive),
	);
}

function requestKey(request: DatabasesOpenRequest) {
	return `${request.databaseId ?? ""}:${request.nonce}`;
}

export function useCollectionWorkspace({
	databasesOpenRequest,
	setError,
	clearError,
	initialDocument = null,
}: UseCollectionWorkspaceOptions) {
	const queryClient = useQueryClient();
	const [selectedDatabaseIdState, setSelectedDatabaseIdState] = useState<
		string | null
	>(() => databasesOpenRequest.databaseId ?? readStoredSelectedDatabaseId());
	const [selectedViewIdState, setSelectedViewIdState] = useState<string | null>(
		null,
	);
	const [nameDraft, setNameDraft] = useState(
		() => initialDocument?.database.name ?? "",
	);
	const [namedDocumentId, setNamedDocumentId] = useState<string | null>(
		() => initialDocument?.database.id ?? null,
	);
	const [createCollectionOpen, setCreateCollectionOpen] = useState(false);
	const [seenRequestKey, setSeenRequestKey] = useState(() =>
		requestKey(databasesOpenRequest),
	);

	const saveQueueRef = useRef(Promise.resolve());
	const collectionRefreshTimerRef = useRef<number | null>(null);
	const selectedDatabaseIdRef = useRef(selectedDatabaseIdState);
	const documentRef = useRef<WorkspaceDatabaseDocument | null>(initialDocument);

	const summariesQuery = useQuery({
		...databaseSummariesQueryOptions(),
		initialData: getPrefetchedDatabaseSummaries() ?? undefined,
	});
	const summaries = summariesQuery.data ?? [];
	const summariesReady = !summariesQuery.isPending || summaries.length > 0;
	const nextRequestKey = requestKey(databasesOpenRequest);
	const requestChanged = seenRequestKey !== nextRequestKey;
	const currentSelection =
		requestChanged && databasesOpenRequest.databaseId
			? databasesOpenRequest.databaseId
			: selectedDatabaseIdState;
	const selectedDatabaseId = summariesReady
		? resolveSelectedDatabaseId(summaries, {
				current: currentSelection,
				openRequestId: databasesOpenRequest.databaseId,
				storedId: readStoredSelectedDatabaseId(),
			})
		: currentSelection;
	selectedDatabaseIdRef.current = selectedDatabaseId;

	if (requestChanged) {
		setSeenRequestKey(nextRequestKey);
		if (databasesOpenRequest.databaseId) {
			setSelectedDatabaseIdState(databasesOpenRequest.databaseId);
			setSelectedViewIdState(null);
		}
		if (databasesOpenRequest.openCreateDialog) {
			setCreateCollectionOpen(true);
		}
	} else if (summariesReady && selectedDatabaseId !== selectedDatabaseIdState) {
		setSelectedDatabaseIdState(selectedDatabaseId);
		setSelectedViewIdState(null);
	}
	if (summariesReady && selectedDatabaseId !== readStoredSelectedDatabaseId()) {
		writeStoredSelectedDatabaseId(selectedDatabaseId);
	}

	const documentQuery = useQuery({
		...databaseDocumentQueryOptions(selectedDatabaseId ?? ""),
		initialData:
			initialDocument && selectedDatabaseId === initialDocument.database.id
				? initialDocument
				: undefined,
	});
	const document = selectedDatabaseId ? (documentQuery.data ?? null) : null;
	documentRef.current = document;

	if (document && document.database.id !== namedDocumentId) {
		setNamedDocumentId(document.database.id);
		setNameDraft(document.database.name);
	} else if (!document && namedDocumentId) {
		setNamedDocumentId(null);
		setNameDraft("");
	}

	const selectedViewId =
		selectedDatabaseId &&
		document &&
		document.database.id === selectedDatabaseId
			? resolveSelectedViewId(
					selectedDatabaseId,
					document.database.views,
					selectedViewIdState,
				)
			: selectedViewIdState;
	if (
		selectedDatabaseId &&
		selectedViewId &&
		document &&
		document.database.id === selectedDatabaseId &&
		document.database.views.some((view) => view.id === selectedViewId) &&
		readStoredSelectedViewId(selectedDatabaseId) !== selectedViewId
	) {
		writeStoredSelectedViewId(selectedDatabaseId, selectedViewId);
	}

	useTauriEvent("space:fs_changed", (change) => {
		const activeDatabaseId = selectedDatabaseIdRef.current;
		if (!activeDatabaseId) return;
		const activeDocument = documentRef.current;
		if (
			activeDocument &&
			!collectionChangeIsRelevant(change, activeDocument.database.source)
		) {
			return;
		}
		if (collectionRefreshTimerRef.current !== null) {
			window.clearTimeout(collectionRefreshTimerRef.current);
		}
		collectionRefreshTimerRef.current = window.setTimeout(() => {
			collectionRefreshTimerRef.current = null;
			invalidateDatabasePrefetch(activeDatabaseId);
		}, COLLECTION_DOCUMENT_REFRESH_MS);
	});

	const loadSummaries = useCallback(async () => {
		invalidateDatabaseSummariesPrefetch();
		await queryClient.refetchQueries({
			queryKey: databaseSummariesQueryOptions().queryKey,
		});
	}, [queryClient]);

	const setSelectedDatabaseId = useCallback((databaseId: string) => {
		setSelectedDatabaseIdState(databaseId);
		setSelectedViewIdState(null);
	}, []);

	const openCreateCollectionDialog = useCallback(() => {
		setCreateCollectionOpen(true);
	}, []);

	const saveDatabase = useCallback(
		(nextDatabaseOrUpdater: SaveDatabaseInput) => {
			const run = async () => {
				const currentDocument = documentRef.current;
				const prevDatabase = currentDocument?.database ?? null;
				if (!prevDatabase && typeof nextDatabaseOrUpdater === "function") {
					throw new Error("database not loaded");
				}
				const nextDatabase =
					typeof nextDatabaseOrUpdater === "function"
						? nextDatabaseOrUpdater(prevDatabase as WorkspaceDatabaseDefinition)
						: nextDatabaseOrUpdater;
				if (nextDatabase === prevDatabase && currentDocument) {
					return currentDocument;
				}
				try {
					const savedDatabaseId = currentDocument?.database.id;
					const saved = await invoke("databases_update", {
						database: nextDatabase,
					});
					if (savedDatabaseId && saved.database.id !== savedDatabaseId) {
						return saved;
					}
					clearError();
					documentRef.current = saved;
					setPrefetchedDatabaseDocument(saved.database.id, saved);
					setNameDraft(saved.database.name);
					invalidateDatabasePrefetch(saved.database.id);
					if (
						!prevDatabase ||
						shouldReloadSummaries(prevDatabase, saved.database)
					) {
						await loadSummaries();
					}
					return saved;
				} catch (cause) {
					const message = extractErrorMessage(cause);
					setError(message);
					throw cause instanceof Error ? cause : new Error(message);
				}
			};
			const pending = saveQueueRef.current.then(run, run);
			saveQueueRef.current = pending.then(
				() => undefined,
				() => undefined,
			);
			return pending;
		},
		[clearError, loadSummaries, setError],
	);

	const commitDatabaseRename = useCallback(() => {
		if (
			!document ||
			!nameDraft.trim() ||
			nameDraft === document.database.name
		) {
			return;
		}
		void saveDatabase({ ...document.database, name: nameDraft.trim() });
	}, [document, nameDraft, saveDatabase]);

	const setDatabasePinned = useCallback(
		async (pinned: boolean) => {
			if (!document) return;
			try {
				const saved = await invoke("databases_set_pinned", {
					database_id: document.database.id,
					pinned,
				});
				clearError();
				documentRef.current = saved;
				setPrefetchedDatabaseDocument(saved.database.id, saved);
				await loadSummaries();
			} catch (cause) {
				setError(extractErrorMessage(cause));
			}
		},
		[clearError, document, loadSummaries, setError],
	);

	const handleDeleteDatabase = useCallback(async () => {
		if (!document) return;
		const { confirm } = await import("@tauri-apps/plugin-dialog");
		const confirmed = await confirm(
			`Delete collection "${document.database.name}"? This cannot be undone.`,
			{
				title: "Delete collection",
				okLabel: "Delete",
				cancelLabel: "Cancel",
			},
		);
		if (!confirmed) return;
		const deletedId = document.database.id;
		try {
			await invoke("databases_delete", { database_id: deletedId });
			clearError();
			queryClient.setQueryData(
				databaseSummariesQueryOptions().queryKey,
				(getPrefetchedDatabaseSummaries() ?? []).filter(
					(summary) => summary.id !== deletedId,
				),
			);
			await loadSummaries();
			queryClient.removeQueries({
				queryKey: databaseDocumentQueryOptions(deletedId).queryKey,
			});
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, [clearError, document, loadSummaries, queryClient, setError]);

	const selectCollection = useCallback(
		async (created: WorkspaceDatabaseDocument) => {
			clearError();
			setPrefetchedDatabaseDocument(created.database.id, created);
			setSelectedDatabaseIdState(created.database.id);
			setNamedDocumentId(created.database.id);
			setNameDraft(created.database.name);
			setSelectedViewIdState(
				resolveSelectedViewId(created.database.id, created.database.views),
			);
			await loadSummaries();
		},
		[clearError, loadSummaries],
	);

	const collectionFolderBreadcrumb = useMemo(() => {
		if (!document || document.database.source.kind !== "folder") {
			return [];
		}
		return collectionFolderBreadcrumbParts(document.database.source.value);
	}, [document]);

	const loadError =
		(summariesQuery.error && extractErrorMessage(summariesQuery.error)) ||
		(documentQuery.error && extractErrorMessage(documentQuery.error)) ||
		"";

	return {
		summaries,
		selectedDatabaseId,
		setSelectedDatabaseId,
		loadSummaries,
		createCollectionOpen,
		setCreateCollectionOpen,
		openCreateCollectionDialog,
		document,
		loading: Boolean(selectedDatabaseId) && documentQuery.isPending,
		nameDraft,
		setNameDraft,
		saveDatabase,
		setDatabasePinned,
		commitDatabaseRename,
		handleDeleteDatabase,
		collectionFolderBreadcrumb,
		selectCollection,
		selectedViewId,
		setSelectedViewId: setSelectedViewIdState,
		loadError,
	};
}
