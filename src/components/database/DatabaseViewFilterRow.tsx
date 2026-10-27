import { useTranslation } from "react-i18next";
import type { DatabaseColumn, DatabaseFilter } from "../../lib/database/types";
import { Trash2 } from "../Icons";
import { Input } from "../ui/shadcn/input";
import { Select, type SelectOption } from "../ui/shadcn/select";
import { DatabaseTagPicker } from "./DatabaseTagPicker";
import {
	DEFAULT_DATE_RANGE,
	dateRangeOptions,
	isTagFilterColumn,
	operatorNeedsValue,
	operatorOptions,
} from "./databaseFilterOptions";

export type UpdateFilters = (
	updater: (filters: DatabaseFilter[]) => DatabaseFilter[],
	keyUpdater?: (keys: string[]) => string[],
) => Promise<void>;

interface FilterRowProps {
	filter: DatabaseFilter;
	index: number;
	columns: DatabaseColumn[];
	columnOptions: SelectOption<string>[];
	onChangeFilterColumn: (index: number, column: DatabaseColumn | null) => void;
	updateFilters: UpdateFilters;
}

export function FilterRow({
	filter,
	index,
	columns,
	columnOptions,
	onChangeFilterColumn,
	updateFilters,
}: FilterRowProps) {
	const { t } = useTranslation("shell");
	const selectedColumn = columns.find((column) => column.id === filter.column_id) ?? null;
	const showsValue = operatorNeedsValue(filter.operator);
	const usesDateRange = filter.operator === "within_last_7_days";
	const usesTagPicker = showsValue && isTagFilterColumn(selectedColumn);
	const position = index + 1;
	const patchFilter = (patch: (entry: DatabaseFilter) => Partial<DatabaseFilter>) =>
		void updateFilters((filters) =>
			filters.map((entry, i) => (i === index ? { ...entry, ...patch(entry) } : entry)),
		);

	return (
		<div className="databaseViewFilterRow">
			<span className="databaseViewOptionJoiner">
				{index === 0 ? t("collections.filter.where") : t("collections.filter.and")}
			</span>
			<Select
				className="databaseViewFilterField"
				value={filter.column_id}
				aria-label={t("collections.filter.fieldAria", { index: position })}
				options={columnOptions}
				onValueChange={(columnId) =>
					onChangeFilterColumn(index, columns.find((column) => column.id === columnId) ?? null)
				}
			/>
			<Select
				className="databaseViewFilterOperator"
				value={filter.operator}
				aria-label={t("collections.filter.operatorAria", { index: position })}
				options={operatorOptions(t, selectedColumn, filter.operator)}
				onValueChange={(operator) =>
					patchFilter((entry) => ({
						operator,
						value_text: operator === "within_last_7_days" ? DEFAULT_DATE_RANGE : entry.value_text,
					}))
				}
			/>
			{usesDateRange || showsValue ? (
				<div className="databaseViewFilterValueSlot">
					{usesDateRange ? (
						<Select
							value={filter.value_text ?? DEFAULT_DATE_RANGE}
							aria-label={t("collections.filter.dateRangeAria", { index: position })}
							options={dateRangeOptions(t)}
							onValueChange={(valueText) =>
								patchFilter(() => ({ value_text: valueText, value_list: [] }))
							}
						/>
					) : usesTagPicker ? (
						<DatabaseTagPicker
							value={filter.value_text ?? ""}
							label={t("collections.filter.tagLabel")}
							description={t("collections.filter.tagDescription")}
							placeholder={t("collections.filter.tagPlaceholder")}
							onChange={(value) => patchFilter(() => ({ value_text: value, value_list: [value] }))}
						/>
					) : (
						<Input
							className="databaseViewFilterValue"
							value={filter.value_text ?? ""}
							placeholder={t("collections.filter.valuePlaceholder")}
							onChange={(event) =>
								patchFilter(() => ({ value_text: event.target.value, value_list: [] }))
							}
						/>
					)}
				</div>
			) : null}
			<button
				type="button"
				className="databaseViewIconButton databaseViewFilterRemove"
				onClick={() =>
					void updateFilters(
						(filters) => filters.filter((_, i) => i !== index),
						(keys) => keys.filter((_, i) => i !== index),
					)
				}
				title={t("collections.filter.remove")}
				aria-label={t("collections.filter.remove")}
			>
				<Trash2 size="var(--icon-md)" />
			</button>
		</div>
	);
}
