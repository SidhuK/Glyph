import type { TFunction } from "i18next";
import { DATABASE_BOARD_EMPTY_LANE_ID } from "../../lib/database/board";
import type { DatabaseColumn } from "../../lib/database/types";
import { priorityColorKey, priorityLabel } from "../../lib/priorityProperties";
import { statusColorKey, statusLabel } from "../../lib/statusProperties";

export function localizeDatabaseColumnLabel(
	column: DatabaseColumn,
	t: TFunction<"ui">,
): string {
	if (column.type === "property") {
		return column.label;
	}
	switch (column.id) {
		case "title":
			return t("database.builtinColumns.title");
		case "tags":
			return t("database.builtinColumns.tags");
		case "updated":
			return t("database.builtinColumns.updated");
		case "folder":
			return t("database.folder");
		case "path":
			return t("database.builtinColumns.path");
		case "linked_notes":
			return t("database.builtinColumns.linkedNotes");
		case "created":
			return t("database.builtinColumns.created");
		default:
			break;
	}
	switch (column.type) {
		case "title":
			return t("database.builtinColumns.title");
		case "tags":
			return t("database.builtinColumns.tags");
		case "updated":
			return t("database.builtinColumns.updated");
		case "folder":
			return t("database.folder");
		case "path":
			return t("database.builtinColumns.path");
		case "linked_notes":
			return t("database.builtinColumns.linkedNotes");
		case "created":
			return t("database.builtinColumns.created");
		default:
			return column.label;
	}
}

export function databaseSortDirectionLabel(
	t: TFunction<"ui">,
	column: DatabaseColumn | null,
	direction: "asc" | "desc",
): string {
	if (
		column?.type === "created" ||
		column?.type === "updated" ||
		column?.property_kind === "date" ||
		column?.property_kind === "datetime"
	) {
		return direction === "asc"
			? t("database.sortDirections.dateAsc")
			: t("database.sortDirections.dateDesc");
	}
	if (column?.property_kind === "number") {
		return direction === "asc"
			? t("database.sortDirections.numberAsc")
			: t("database.sortDirections.numberDesc");
	}
	if (column?.property_kind === "checkbox") {
		return direction === "asc"
			? t("database.sortDirections.booleanAsc")
			: t("database.sortDirections.booleanDesc");
	}
	return direction === "asc"
		? t("database.sortDirections.textAsc")
		: t("database.sortDirections.textDesc");
}

export function databaseFilterOperatorLabel(
	t: TFunction<"ui">,
	operator: string,
): string {
	return t(`database.filterOperators.${operator}`, {
		defaultValue: t("database.unsupportedOperatorGeneric", { operator }),
	});
}

export const DATABASE_DATE_SHORTCUTS = [
	{ value: "Overdue", key: "overdue" },
	{ value: "Today", key: "today" },
	{ value: "This Week", key: "thisWeek" },
	{ value: "Last 7 Days", key: "last7Days" },
	{ value: "Last 30 Days", key: "last30Days" },
] as const;

export function defaultDateFilterValue(): string {
	return "Last 7 Days";
}

export function localizeBoardLaneLabel(
	column: DatabaseColumn | null,
	laneId: string,
	t: TFunction<"ui">,
): string {
	if (laneId === DATABASE_BOARD_EMPTY_LANE_ID) {
		if (!column) return t("database.board.laneLabels.noValueYet");
		if (column.type === "tags" || column.property_kind === "tags") {
			return t("database.board.laneLabels.noTagsYet");
		}
		if (column.property_kind === "status") {
			return t("database.board.laneLabels.noStatusYet");
		}
		if (column.property_kind === "priority") {
			return t("database.board.laneLabels.noPriorityYet");
		}
		if (column.property_kind === "checkbox") {
			return t("database.board.laneLabels.notSetYet");
		}
		const label = column.label.trim();
		if (label) {
			return t("database.board.laneLabels.noFieldYet", {
				field: label,
			});
		}
		return t("database.board.laneLabels.noValueYet");
	}
	if (column?.property_kind === "checkbox") {
		if (laneId === "true") return t("database.board.laneLabels.checked");
		if (laneId === "false") return t("database.board.laneLabels.unchecked");
		return t("database.board.laneLabels.notSetYet");
	}
	if (column?.property_kind === "status") {
		const key = statusColorKey(laneId) ?? laneId;
		return t(`database.board.laneLabels.status.${key}`, {
			defaultValue: statusLabel(laneId),
		});
	}
	if (column?.property_kind === "priority") {
		const key = priorityColorKey(laneId) ?? laneId;
		return t(`database.board.laneLabels.priority.${key}`, {
			defaultValue: priorityLabel(laneId),
		});
	}
	return laneId;
}
