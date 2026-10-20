import { useTranslation } from "react-i18next";
import type { MutableRefObject } from "react";
import { isDateColumn } from "../../lib/database/columns";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabaseFilter,
	DatabasePropertyOption,
} from "../../lib/database/types";
import { ChevronDown, Plus, Trash2 } from "../Icons";
import { Input } from "../ui/shadcn/input";
import { Select } from "../ui/shadcn/select";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import { DatabaseTagPicker } from "./DatabaseTagPicker";
import {
	DEFAULT_DATE_RANGE,
	dateRangeOptions,
	defaultOperatorForColumn,
	isSupportedFilterOperator,
	isTagFilterColumn,
	operatorNeedsValue,
	operatorOptions,
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
	updateFilters: (
		updater: (filters: DatabaseFilter[]) => DatabaseFilter[],
		keyUpdater?: (keys: string[]) => string[],
	) => Promise<void>;
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

function FilterJoiner({ index }: { index: number }) {
	const { t } = useTranslation("shell");
	return (
		<span className="databaseViewOptionJoiner">
			{index === 0 ? t("collections.filter.where") : t("collections.filter.and")}
			<ChevronDown size="var(--icon-sm)" aria-hidden="true" />
		</span>
	);
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
	const columnOptions = columns.map((column) => ({
		value: column.id,
		label: column.label,
		icon: <DatabaseColumnIcon column={column} size="var(--icon-sm)" />,
	}));
	const invalidOperatorIndex = config.filters.findIndex(
		(filter) => !isSupportedFilterOperator(filter.operator),
	);
	const invalidOperatorError =
		invalidOperatorIndex >= 0
			? t("collections.filter.unsupportedOperator", { index: invalidOperatorIndex + 1 })
			: "";
	return (
		<section
			className="databaseViewOptionsPanel is-wide"
			aria-label={t("collections.filter.title")}
		>
			<div className="databaseViewPanelHeader">
				<span>{t("collections.filter.title")}</span>
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
			<p className="databaseViewPanelHint">{t("collections.filter.hint")}</p>
			<div className="databaseViewPresetGroup" aria-label={t("collections.filter.presets")}>
				<span className="databaseViewPresetLabel">{t("collections.viewOptions.presets")}</span>
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
				<button
					type="button"
					className="databaseViewEmptyAction"
					onClick={() =>
						void updateFilters(
							(filters) => [...filters, emptyFilter(defaultFilterColumn)],
							(keys) => [...keys, `filter-${filterKeyCounterRef.current++}`],
						)
					}
				>
					<Plus size="var(--icon-md)" aria-hidden="true" />
					{t("collections.filter.addFirst")}
				</button>
			) : (
				<div className="databaseViewFilterList">
					{config.filters.map((filter, index) => {
						const selectedColumn = columns.find((column) => column.id === filter.column_id) ?? null;
						const availableOperators = operatorOptions(t, selectedColumn, filter.operator);
						const showsValue = operatorNeedsValue(filter.operator);
						const usesTagPicker = showsValue && isTagFilterColumn(selectedColumn);
						const position = index + 1;
						return (
							<div
								key={filterUiKeys[index] ?? `filter-fallback-${filter.column_id}`}
								className="databaseViewFilterRow"
							>
								<FilterJoiner index={index} />
								<span className="databaseViewFilterColumn">
									<Select
										value={filter.column_id}
										aria-label={t("collections.filter.fieldAria", { index: position })}
										options={columnOptions}
										onValueChange={(columnId) =>
											onChangeFilterColumn(
												index,
												columns.find((column) => column.id === columnId) ?? null,
											)
										}
									/>
								</span>
								<Select
									value={filter.operator}
									aria-label={t("collections.filter.operatorAria", { index: position })}
									options={availableOperators}
									onValueChange={(operator) =>
										void updateFilters((filters) =>
											filters.map((entry, i) =>
												i === index
													? {
															...entry,
															operator,
															value_text:
																operator === "within_last_7_days"
																	? DEFAULT_DATE_RANGE
																	: entry.value_text,
														}
													: entry,
											),
										)
									}
								/>
								{filter.operator === "within_last_7_days" ? (
									<Select
										value={filter.value_text ?? DEFAULT_DATE_RANGE}
										aria-label={t("collections.filter.dateRangeAria", { index: position })}
										options={dateRangeOptions(t)}
										onValueChange={(valueText) =>
											void updateFilters((filters) =>
												filters.map((entry, i) =>
													i === index ? { ...entry, value_text: valueText, value_list: [] } : entry,
												),
											)
										}
									/>
								) : showsValue ? (
									usesTagPicker ? (
										<DatabaseTagPicker
											value={filter.value_text ?? ""}
											label={t("collections.filter.tagLabel")}
											description={t("collections.filter.tagDescription")}
											placeholder={t("collections.filter.tagPlaceholder")}
											onChange={(value) =>
												void updateFilters((filters) =>
													filters.map((entry, i) =>
														i === index
															? {
																	...entry,
																	value_text: value,
																	value_list: [value],
																}
															: entry,
													),
												)
											}
										/>
									) : (
										<Input
											className="databaseViewFilterValue"
											value={filter.value_text ?? ""}
											placeholder={t("collections.filter.valuePlaceholder")}
											onChange={(event) =>
												void updateFilters((filters) =>
													filters.map((entry, i) =>
														i === index
															? {
																	...entry,
																	value_text: event.target.value,
																	value_list: [],
																}
															: entry,
													),
												)
											}
										/>
									)
								) : null}
								<button
									type="button"
									className="databaseViewIconButton"
									onClick={() =>
										void updateFilters(
											(filters) => filters.filter((_, i) => i !== index),
											(keys) => keys.filter((_, i) => i !== index),
										)
									}
									title={t("collections.filter.remove")}
									aria-label={t("collections.filter.remove")}
								>
									<Trash2 size="var(--icon-lg)" />
								</button>
							</div>
						);
					})}
					<button
						type="button"
						className="databaseViewEmptyAction"
						onClick={() =>
							void updateFilters(
								(filters) => [...filters, emptyFilter(defaultFilterColumn)],
								(keys) => [...keys, `filter-${filterKeyCounterRef.current++}`],
							)
						}
					>
						<Plus size="var(--icon-md)" aria-hidden="true" />
						{t("collections.filter.addAnother")}
					</button>
				</div>
			)}
		</section>
	);
}
