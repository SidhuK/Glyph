import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import {
	type DatabaseBoardLane,
	boardLaneIdForValue,
	boardLaneIdFromLabel,
	boardLaneValue,
} from "../../lib/database/board";
import type { DatabaseColumn } from "../../lib/database/types";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import { invoke } from "../../lib/tauri";

export interface BoardLaneRenameTarget {
	databaseId: string;
	viewId: string;
	/** Collection `updated_at`; the rename is rejected if the definition changed. */
	revision: string;
}

interface UseBoardLaneRenameOptions {
	target: BoardLaneRenameTarget;
	onRenamed: (fromLaneId: string, toLaneId: string) => void;
}

interface LaneRenameVariables {
	column: DatabaseColumn;
	fromValues: string[];
	laneId: string;
	expectedSpace: string;
}

/** Returns a handler that prompts natively for a lane name; it rejects when the rename fails. */
export function useBoardLaneRename({ target, onRenamed }: UseBoardLaneRenameOptions) {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();

	const renameMutation = useMutation({
		mutationFn: async ({ column, fromValues, laneId, expectedSpace }: LaneRenameVariables) => {
			const result = await invoke("databases_rename_lane", {
				request: {
					database_id: target.databaseId,
					view_id: target.viewId,
					column,
					from_values: fromValues,
					to_value: boardLaneValue(column, laneId).value_text ?? laneId,
					expected_space: expectedSpace,
					expected_updated_at: target.revision,
				},
			});
			// Wait for the refetch so lanes are rebuilt from the renamed rows.
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: [...navigationQueryKeys.databases(), "rows-pages", target.databaseId],
				}),
				queryClient.invalidateQueries({
					queryKey: navigationQueryKeys.databaseDocument(target.databaseId),
				}),
			]);
			return result;
		},
	});

	return async (column: DatabaseColumn, lane: DatabaseBoardLane, loadedLaneIds: string[]) => {
		if (!spacePath || renameMutation.isPending) return;
		const counts = await invoke("databases_lane_values", {
			database_id: target.databaseId,
			view_id: target.viewId,
			column,
		});
		// Several stored values, such as status aliases, can map to one lane.
		const fromValues: string[] = [];
		const takenLaneIds = new Set(loadedLaneIds);
		let count = 0;
		for (const [value, valueCount] of Object.entries(counts)) {
			const valueLaneId = boardLaneIdForValue(column, value);
			if (!valueLaneId) continue;
			takenLaneIds.add(valueLaneId);
			if (valueLaneId !== lane.id) continue;
			fromValues.push(value);
			count += valueCount;
		}

		const title = t("collections.laneRenameTitle");
		let value = lane.label;
		let laneId: string | null = null;
		while (laneId === null) {
			const input = await invoke("native_text_prompt", {
				request: {
					title,
					description: t("collections.laneRenameScope", { count }),
					initial_value: value,
					confirm_label: t("collections.laneRenameConfirm"),
					cancel_label: t("collections.laneRenameCancel"),
				},
			});
			if (input === null) return;
			value = input;
			const candidate = boardLaneIdFromLabel(column, value);
			if (!candidate || candidate === lane.id) return;
			if (!takenLaneIds.has(candidate)) {
				laneId = candidate;
				break;
			}
			const { message } = await import("@tauri-apps/plugin-dialog");
			await message(t("collections.laneRenameExists", { name: candidate }), {
				title,
				kind: "warning",
			});
		}

		if (fromValues.length > 0) {
			const result = await renameMutation.mutateAsync({
				column,
				fromValues,
				laneId,
				expectedSpace: spacePath,
			});
			const [firstFailure] = result.failures;
			if (firstFailure) {
				throw new Error(
					t("collections.laneRenamePartial", {
						changed: result.changed_paths.length,
						total: result.changed_paths.length + result.failures.length,
						failed: result.failures.length,
						error: `${firstFailure.path}: ${firstFailure.error}`,
					}),
				);
			}
		}
		onRenamed(lane.id, laneId);
	};
}
