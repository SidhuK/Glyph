import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collectionFolderBreadcrumbParts } from "../../lib/database/collection";
import type { DatabasesOpenRequest } from "../../lib/database/openDatabasesRequest";
import {
	readStoredSelectedDatabaseId,
	resolveSelectedDatabaseId,
	resolveSelectedViewId,
	writeStoredSelectedDatabaseId,
	writeStoredSelectedViewId,
} from "../../lib/database/selectedViewStorage";
import { shouldReloadSummaries } from "../../lib/database/summaries";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	getPrefetchedDatabaseSummaries,
	invalidateDatabasePrefetch,
	invalidateDatabaseSummariesPrefetch,
	prefetchDatabaseDocument,
	prefetchDatabaseSummaries,
	setPrefetchedDatabaseDocument,
} from "../../lib/navigationPrefetch";
import type {
	WorkspaceDatabaseDefinition,
	WorkspaceDatabaseDocument,
	WorkspaceDatabaseSummary,
} from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import type { PaneErrorHandlers, SaveDatabaseInput } from "./types";

export interface UseCollectionWorkspaceOptions extends PaneErrorHandlers {
	databasesOpenRequest: DatabasesOpenRequest;
	onConsumeOpenRequest?: () => void;
	initialDocument?: WorkspaceDatabaseDocument | null;
}

function resolveInitialViewId(
	databasesOpenRequest: DatabasesOpenRequest,
	initialDocument: WorkspaceDatabaseDocument | null,
): string | null {
	const databaseId =
		initialDocument?.database.id ?? databasesOpenRequest.databaseId ?? null;
	if (
		!databaseId ||
		!initialDocument ||
		initialDocument.database.id !== databaseId
	) {
		return null;
	}
	return resolveSelectedViewId(databaseId, initialDocument.database.views);
}

export function useCollectionWorkspace({
	databasesOpenRequest,
	onConsumeOpenRequest,
	setError,
	clearError,
	initialDocument = null,
}: UseCollectionWorkspaceOptions) {
	const [summaries, setSummaries] = useState<WorkspaceDatabaseSummary[]>(
		() => getPrefetchedDatabaseSummaries() ?? [],
	);
	const [selectedDatabaseId, setSelectedDatabaseIdState] = useState<
		string | null
	>(() => databasesOpenRequest.databaseId ?? readStoredSelectedDatabaseId());
	const [document, setDocument] = useState<WorkspaceDatabaseDocument | null>(
		initialDocument,
	);
	const [loading, setLoading] = useState(() => !initialDocument);
	const [nameDraft, setNameDraft] = useState(
		() => initialDocument?.database.name ?? "",
	);
	const [selectedViewId, setSelectedViewIdState] = useState<string | null>(() =>
		resolveInitialViewId(databasesOpenRequest, initialDocument),
	);
	const [createCollectionOpen, setCreateCollectionOpen] = useState(false);

	const previousOpenRequestRef = useRef(databasesOpenRequest);
	const previousDatabaseIdRef = useRef(selectedDatabaseId);
	const documentIdRef = useRef(document?.database.id ?? null);
	const documentRef = useRef(document);
	const saveQueueRef = useRef(Promise.resolve());
	documentIdRef.current = document?.database.id ?? null;
	documentRef.current = document;

	const loadSummaries = useCallback(async () => {
		const next = await prefetchDatabaseSummaries();
		const storedDatabaseId = readStoredSelectedDatabaseId();
		setSummaries(next);
		setSelectedDatabaseIdState((current) =>
			resolveSelectedDatabaseId(next, {
				current,
				openRequestId: databasesOpenRequest.databaseId,
				storedId: storedDatabaseId,
			}),
		);
	}, [databasesOpenRequest.databaseId]);

	useEffect(() => {
		const previousOpenRequest = previousOpenRequestRef.current;
		const requestChanged =
			previousOpenRequest.databaseId !== databasesOpenRequest.databaseId ||
			previousOpenRequest.nonce !== databasesOpenRequest.nonce;
		previousOpenRequestRef.current = databasesOpenRequest;

		if (!requestChanged) return;

		if (databasesOpenRequest.databaseId) {
			setSelectedDatabaseIdState(databasesOpenRequest.databaseId);
			setSelectedViewIdState(null);
		}

		if (databasesOpenRequest.openCreateDialog) {
			setCreateCollectionOpen(true);
			onConsumeOpenRequest?.();
		}
	}, [databasesOpenRequest, onConsumeOpenRequest]);

	useEffect(() => {
		void loadSummaries().catch((cause) => setError(extractErrorMessage(cause)));
	}, [loadSummaries, setError]);

	useEffect(() => {
		writeStoredSelectedDatabaseId(selectedDatabaseId);
	}, [selectedDatabaseId]);

	useEffect(() => {
		const databaseChanged =
			previousDatabaseIdRef.current !== selectedDatabaseId;
		previousDatabaseIdRef.current = selectedDatabaseId;

		if (!selectedDatabaseId || databaseChanged) {
			setSelectedViewIdState(null);
		}
	}, [selectedDatabaseId]);

	useEffect(() => {
		if (!selectedDatabaseId) {
			setDocument(null);
			setNameDraft("");
			setLoading(false);
			return;
		}

		let cancelled = false;
		const needsFetch = documentIdRef.current !== selectedDatabaseId;
		setLoading(needsFetch);
		clearError();
		if (needsFetch) {
			setDocument(null);
			setNameDraft("");
		}

		void prefetchDatabaseDocument(selectedDatabaseId)
			.then((next) => {
				if (cancelled) return;
				setDocument(next);
				setNameDraft(next.database.name);
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
	}, [clearError, selectedDatabaseId, setError]);

	useEffect(() => {
		if (
			!selectedDatabaseId ||
			!document ||
			document.database.id !== selectedDatabaseId ||
			document.database.views.length === 0
		) {
			return;
		}
		setSelectedViewIdState((current) =>
			resolveSelectedViewId(
				selectedDatabaseId,
				document.database.views,
				current,
			),
		);
	}, [document, selectedDatabaseId]);

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

	const setSelectedDatabaseId = useCallback((databaseId: string) => {
		setSelectedDatabaseIdState(databaseId);
		setSelectedViewIdState(null);
	}, []);

	const setSelectedViewId = useCallback((viewId: string | null) => {
		setSelectedViewIdState(viewId);
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
					setDocument(saved);
					setNameDraft(saved.database.name);
					invalidateDatabasePrefetch(saved.database.id);
					setPrefetchedDatabaseDocument(saved.database.id, saved);
					if (
						!prevDatabase ||
						shouldReloadSummaries(prevDatabase, saved.database)
					) {
						invalidateDatabaseSummariesPrefetch();
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
		try {
			await invoke("databases_delete", { database_id: document.database.id });
			clearError();
			invalidateDatabasePrefetch(document.database.id);
			invalidateDatabaseSummariesPrefetch();
			setDocument(null);
			await loadSummaries();
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, [clearError, document, loadSummaries, setError]);

	const selectCollection = useCallback(
		async (created: WorkspaceDatabaseDocument) => {
			clearError();
			invalidateDatabaseSummariesPrefetch();
			setPrefetchedDatabaseDocument(created.database.id, created);
			setSelectedDatabaseIdState(created.database.id);
			setDocument(created);
			setNameDraft(created.database.name);
			setLoading(false);
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

	return {
		summaries,
		selectedDatabaseId,
		setSelectedDatabaseId,
		loadSummaries,
		createCollectionOpen,
		setCreateCollectionOpen,
		openCreateCollectionDialog,
		document,
		loading,
		nameDraft,
		setNameDraft,
		saveDatabase,
		commitDatabaseRename,
		handleDeleteDatabase,
		collectionFolderBreadcrumb,
		selectCollection,
		selectedViewId,
		setSelectedViewId,
	};
}
