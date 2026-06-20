import { emit } from "@tauri-apps/api/event";
import { type Dispatch, type SetStateAction, useCallback } from "react";
import { boardCreateValue } from "../../lib/database/board";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invalidateDatabasePrefetch } from "../../lib/navigationPrefetch";
import type {
	DatabaseCellValue,
	DatabaseColumn,
	DatabaseCreateRowInitialValue,
	DatabaseRow,
	WorkspaceDatabaseDocument,
} from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import type { PaneErrorHandlers } from "./types";

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

export interface UseDatabaseRowActionsOptions extends PaneErrorHandlers {
	document: WorkspaceDatabaseDocument | null;
	selectedViewId: string | null;
	activeColumns: DatabaseColumn[];
	onRenameNotePath?: (
		notePath: string,
		nextName: string,
	) => Promise<string | null>;
	setRows: Dispatch<SetStateAction<DatabaseRow[]>>;
	setSelectedRowPath: Dispatch<SetStateAction<string | null>>;
}

export function useDatabaseRowActions({
	document,
	selectedViewId,
	activeColumns,
	onRenameNotePath,
	setRows,
	setSelectedRowPath,
	setError,
	clearError,
}: UseDatabaseRowActionsOptions) {
	const handleUpdateCell = useCallback(
		async (
			notePath: string,
			column: DatabaseColumn,
			value: DatabaseCellValue,
		) => {
			try {
				const updatedRow = await invoke("databases_update_cell", {
					note_path: notePath,
					column,
					value,
				});
				clearError();
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
				}
				void emit("notes:external_changed", {
					rel_path: notePath,
					removed: false,
				});
			} catch (cause) {
				setError(extractErrorMessage(cause));
				throw cause;
			}
		},
		[clearError, document, selectedViewId, setError, setRows],
	);

	const handleRenameRowTitle = useCallback(
		async (notePath: string, nextTitle: string): Promise<boolean> => {
			const title = nextTitle.trim();
			if (!title) return false;
			const titleColumn = activeColumns.find(
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
		[
			activeColumns,
			handleUpdateCell,
			onRenameNotePath,
			setError,
			setRows,
			setSelectedRowPath,
		],
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
				clearError();
				invalidateDatabasePrefetch(document.database.id);
				setSelectedRowPath(created.note_path);
				setRows((current) =>
					current.some((row) => row.note_path === created.note_path)
						? current.map((row) =>
								row.note_path === created.note_path ? created.row : row,
							)
						: [created.row, ...current],
				);
			} catch (cause) {
				setError(extractErrorMessage(cause));
			}
		},
		[clearError, document, setError, setRows, setSelectedRowPath],
	);

	return {
		handleUpdateCell,
		handleRenameRowTitle,
		handleCreateRow,
	};
}
