import { useCallback, useMemo, useState } from "react";
import {
	buildTagsCellValue,
	findBulkEligibleColumns,
	mergeTagLists,
	removeTagsFromList,
	tagsCellValueForRow,
} from "../../lib/database/bulkActions";
import type {
	DatabaseCellValue,
	DatabaseColumn,
	DatabaseRow,
} from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import type { PaneErrorHandlers } from "./types";

export interface UseDatabaseBulkActionsOptions extends PaneErrorHandlers {
	rows: DatabaseRow[];
	columns: DatabaseColumn[];
	selectedRowPaths: string[];
	clearRowSelection: () => void;
	handleUpdateCell: (
		notePath: string,
		column: DatabaseColumn,
		value: DatabaseCellValue,
	) => Promise<void>;
}

export function useDatabaseBulkActions({
	rows,
	columns,
	selectedRowPaths,
	clearRowSelection,
	handleUpdateCell,
	setError,
	clearError,
}: UseDatabaseBulkActionsOptions) {
	const [isApplying, setIsApplying] = useState(false);
	const bulkEligible = useMemo(
		() => findBulkEligibleColumns(columns),
		[columns],
	);
	const rowByPath = useMemo(
		() => new Map(rows.map((row) => [row.note_path, row])),
		[rows],
	);

	const applyToSelected = useCallback(
		async (
			column: DatabaseColumn,
			getValue: (row: DatabaseRow) => DatabaseCellValue,
		) => {
			if (selectedRowPaths.length === 0) return;
			setIsApplying(true);
			clearError();
			let success = 0;
			let failed = 0;
			for (const notePath of selectedRowPaths) {
				const row = rowByPath.get(notePath);
				if (!row) continue;
				try {
					await handleUpdateCell(notePath, column, getValue(row));
					success += 1;
				} catch {
					failed += 1;
				}
			}
			setIsApplying(false);
			if (failed > 0) {
				setError(
					success > 0
						? `Updated ${success} notes. ${failed} failed.`
						: `Failed to update ${failed} notes.`,
				);
				return;
			}
			if (success > 0) {
				clearRowSelection();
			}
		},
		[
			clearError,
			clearRowSelection,
			handleUpdateCell,
			rowByPath,
			selectedRowPaths,
			setError,
		],
	);

	const bulkSetStatus = useCallback(
		async (status: string) => {
			const column = bulkEligible.statusColumn;
			if (!column) return;
			await applyToSelected(column, () => ({
				kind: "status",
				value_text: status,
				value_list: [],
			}));
		},
		[applyToSelected, bulkEligible.statusColumn],
	);

	const bulkSetPriority = useCallback(
		async (priority: string) => {
			const column = bulkEligible.priorityColumn;
			if (!column) return;
			await applyToSelected(column, () => ({
				kind: "priority",
				value_text: priority,
				value_list: [],
			}));
		},
		[applyToSelected, bulkEligible.priorityColumn],
	);

	const bulkSetCheckbox = useCallback(
		async (column: DatabaseColumn, checked: boolean) => {
			await applyToSelected(column, () => ({
				kind: "checkbox",
				value_bool: checked,
				value_list: [],
			}));
		},
		[applyToSelected],
	);

	const bulkAddTags = useCallback(
		async (column: DatabaseColumn, tagsToAdd: string[]) => {
			if (tagsToAdd.length === 0) return;
			await applyToSelected(column, (row) =>
				buildTagsCellValue(
					row,
					column,
					mergeTagLists(tagsCellValueForRow(row, column).value_list, tagsToAdd),
				),
			);
		},
		[applyToSelected],
	);

	const bulkRemoveTags = useCallback(
		async (column: DatabaseColumn, tagsToRemove: string[]) => {
			if (tagsToRemove.length === 0) return;
			await applyToSelected(column, (row) =>
				buildTagsCellValue(
					row,
					column,
					removeTagsFromList(
						tagsCellValueForRow(row, column).value_list,
						tagsToRemove,
					),
				),
			);
		},
		[applyToSelected],
	);

	const runWithError = useCallback(
		async (action: () => Promise<void>) => {
			try {
				await action();
			} catch (cause) {
				setError(extractErrorMessage(cause));
			}
		},
		[setError],
	);

	return {
		bulkEligible,
		isApplying,
		bulkSetStatus: (status: string) =>
			runWithError(() => bulkSetStatus(status)),
		bulkSetPriority: (priority: string) =>
			runWithError(() => bulkSetPriority(priority)),
		bulkSetCheckbox: (column: DatabaseColumn, checked: boolean) =>
			runWithError(() => bulkSetCheckbox(column, checked)),
		bulkAddTags: (column: DatabaseColumn, tags: string[]) =>
			runWithError(() => bulkAddTags(column, tags)),
		bulkRemoveTags: (column: DatabaseColumn, tags: string[]) =>
			runWithError(() => bulkRemoveTags(column, tags)),
	};
}
