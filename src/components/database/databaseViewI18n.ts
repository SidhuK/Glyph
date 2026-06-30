import type { TFunction } from "i18next";
import type { DatabaseColumn } from "../../lib/database/types";

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
