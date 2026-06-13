import { useCallback, useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	getPrefetchedDatabaseRows,
	invalidateDatabaseRowsPrefetch,
	prefetchDatabaseRows,
	setPrefetchedDatabaseRows,
} from "../../lib/navigationPrefetch";
import type {
	DatabaseRow,
	WorkspaceDatabaseDocument,
	WorkspaceDatabaseQueryResult,
} from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import type { PaneErrorHandlers } from "./types";

export interface UseDatabaseRowsOptions extends PaneErrorHandlers {
	selectedDatabaseId: string | null;
	selectedViewId: string | null;
	document: WorkspaceDatabaseDocument | null;
	initialRows?: WorkspaceDatabaseQueryResult | null;
}

export function useDatabaseRows({
	selectedDatabaseId,
	selectedViewId,
	document,
	initialRows = null,
	setError,
}: UseDatabaseRowsOptions) {
	const [rows, setRows] = useState<DatabaseRow[]>(
		() => initialRows?.rows ?? [],
	);
	const [rowsTruncated, setRowsTruncated] = useState(
		() => initialRows?.truncated ?? false,
	);
	const [selectedRowPath, setSelectedRowPath] = useState<string | null>(null);
	const rowRequestTokenRef = useRef(0);
	const fsRowsRefreshTimerRef = useRef<number | null>(null);
	const previousSelectionRef = useRef<{
		databaseId: string | null;
		viewId: string | null;
	} | null>(null);

	const clearRows = useCallback(() => {
		rowRequestTokenRef.current += 1;
		setRows([]);
		setRowsTruncated(false);
		setSelectedRowPath(null);
	}, []);

	useEffect(() => {
		const previous = previousSelectionRef.current;
		if (
			previous?.databaseId === selectedDatabaseId &&
			previous.viewId === selectedViewId
		) {
			return;
		}
		previousSelectionRef.current = {
			databaseId: selectedDatabaseId,
			viewId: selectedViewId,
		};
		clearRows();
	}, [clearRows, selectedDatabaseId, selectedViewId]);

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
				setSelectedRowPath(null);
			}
			return;
		}
		try {
			const next = await prefetchDatabaseRows(
				selectedDatabaseId,
				selectedViewId,
			);
			if (rowRequestTokenRef.current !== requestToken) return;
			setRows(next.rows);
			setRowsTruncated(next.truncated);
			setPrefetchedDatabaseRows(selectedDatabaseId, selectedViewId, next);
		} catch (cause) {
			if (rowRequestTokenRef.current !== requestToken) return;
			setError(extractErrorMessage(cause));
		}
	}, [document, selectedDatabaseId, selectedViewId, setError]);

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

	return {
		rows,
		setRows,
		rowsTruncated,
		selectedRowPath,
		setSelectedRowPath,
		loadRows,
		clearRows,
	};
}
