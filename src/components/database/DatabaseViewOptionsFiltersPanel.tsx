import { useTranslation } from "react-i18next";
import type { MutableRefObject } from "react";
import { isDateColumn } from "../../lib/database/columns";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabaseFilter,
	DatabasePropertyOption,
} from "../../lib/database/types";
import { Plus } from "../Icons";
import { FilterRow, type UpdateFilters } from "./DatabaseViewFilterRow";
import {
	DEFAULT_DATE_RANGE,
	columnSelectOptions,
	defaultOperatorForColumn,
	isSupportedFilterOperator,
} from "./databaseFilterOptions";
import { type DatabaseFilterPreset, databaseFilterPresets } from "./databaseViewPresets";

interface FiltersPanelProps {
	config: DatabaseConfig;
	columns: DatabaseColumn[];
	availableProperties: DatabasePropertyOption[];
	filterError: string;
	filterUiKeys: string[];
	filterKeyCounterRef: MutableRefObject<number>;
	defaultFilterColumn: DatabaseColumn | null;
	onApplyFilterPreset: (preset: DatabaseFilterPreset) => void;
	onChangeFilterColumn: (index: number, column: DatabaseColumn | null) => void;
	updateFilters: UpdateFilters;
}

function emptyFilter(column?: DatabaseColumn | null): DatabaseFilter {
	return {
		column_id: column?.id ?? "title",
		operator: defaultOperatorForColumn(column),
		value_text: isDateColumn(column) ? DEFAULT_DATE_RANGE : "",
		value_list: [],
	};
}

export function nextFilterForColumn(
	filter: DatabaseFilter,
	column: DatabaseColumn | null,
): DatabaseFilter {
	const operator = defaultOperatorForColumn(column);
	return {
		...filter,
		column_id: column?.id ?? filter.column_id,
		operator,
		value_text: operator === "within_last_7_days" ? DEFAULT_DATE_RANGE : "",
		value_bool: null,
		value_list: [],
	};
}

function isFilterPresetApplied(filters: DatabaseFilter[], preset: DatabaseFilterPreset): boolean {
	if (!preset.filter) return false;
	return filters.some(
		(filter) =>
			filter.column_id === preset.filter?.column_id &&
			filter.operator === preset.filter.operator &&
			(filter.value_text ?? "") === (preset.filter.value_text ?? "") &&
			(filter.value_bool ?? null) === (preset.filter.value_bool ?? null) &&
			filterValueListsEqual(filter.value_list, preset.filter.value_list),
	);
}

function filterValueListsEqual(
	currentValueList: string[] | null | undefined,
	presetValueList: string[] | null | undefined,
): boolean {
	const currentValues = currentValueList ?? [];
	const presetValues = presetValueList ?? [];
	return (
		currentValues.length === presetValues.length &&
		currentValues.every((value, index) => value === presetValues[index])
	);
}

export function FiltersPanel({
	config,
	columns,
	availableProperties,
	filterError,
	filterUiKeys,
	filterKeyCounterRef,
	defaultFilterColumn,
	onApplyFilterPreset,
	onChangeFilterColumn,
	updateFilters,
}: FiltersPanelProps) {
	const { t } = useTranslation("shell");
	const presets = databaseFilterPresets(config, availableProperties);
	const columnOptions = columnSelectOptions(columns);
	const addFilter = () =>
		void updateFilters(
			(filters) => [...filters, emptyFilter(defaultFilterColumn)],
			(keys) => [...keys, `filter-${filterKeyCounterRef.current++}`],
		);
	const invalidOperatorIndex = config.filters.findIndex(
		(filter) => !isSupportedFilterOperator(filter.operator),
	);
	const invalidOperatorError =
		invalidOperatorIndex >= 0
			? t("collections.filter.unsupportedOperator", { index: invalidOperatorIndex + 1 })
			: "";
	return (
		<>
			<p className="databaseViewPanelHint">{t("collections.filter.hint")}</p>
			<div className="databaseViewPresetGroup" aria-label={t("collections.filter.presets")}>
				<div className="databaseViewPresetLabel">
					<span>{t("collections.viewOptions.presets")}</span>
					{config.filters.length > 0 ? (
						<button
							type="button"
							className="databaseViewPanelReset"
							onClick={() =>
								void updateFilters(
									() => [],
									() => [],
								)
							}
						>
							{t("collections.viewOptions.reset")}
						</button>
					) : null}
				</div>
				<div className="databaseViewPresetChips">
					{presets.map((preset) => {
						const applied = isFilterPresetApplied(config.filters, preset);
						return (
							<button
								key={preset.id}
								type="button"
								className="databaseViewPresetChip"
								disabled={!preset.filter || applied}
								data-active={applied ? "true" : "false"}
								title={preset.disabledReason ?? preset.label}
								onClick={() => onApplyFilterPreset(preset)}
							>
								{preset.label}
							</button>
						);
					})}
				</div>
			</div>
			{filterError || invalidOperatorError ? (
				<div className="databaseViewPanelError">{filterError || invalidOperatorError}</div>
			) : null}
			{config.filters.length === 0 ? (
				<button type="button" className="databaseViewEmptyAction" onClick={addFilter}>
					<Plus size="var(--icon-md)" aria-hidden="true" />
					{t("collections.filter.addFirst")}
				</button>
			) : (
				<div className="databaseViewFilterList">
					{config.filters.map((filter, index) => (
						<FilterRow
							key={filterUiKeys[index] ?? `filter-fallback-${filter.column_id}`}
							filter={filter}
							index={index}
							columns={columns}
							columnOptions={columnOptions}
							onChangeFilterColumn={onChangeFilterColumn}
							updateFilters={updateFilters}
						/>
					))}
					<button type="button" className="databaseViewEmptyAction" onClick={addFilter}>
						<Plus size="var(--icon-md)" aria-hidden="true" />
						{t("collections.filter.addAnother")}
					</button>
				</div>
			)}
		</>
	);
}
