import type { TFunction } from "i18next";
import type { MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabaseFilter,
	DatabasePropertyOption,
} from "../../lib/database/types";
import { ChevronDown, Plus, Trash2 } from "../Icons";
import { Input } from "../ui/shadcn/input";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import { DatabaseTagPicker } from "./DatabaseTagPicker";
import {
	DATABASE_DATE_SHORTCUTS,
	databaseFilterOperatorLabel,
	defaultDateFilterValue,
} from "./databaseViewI18n";
import {
	type DatabaseFilterPreset,
	databaseFilterPresets,
} from "./databaseViewPresets";

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

const DATE_SHORTCUT_OPTIONS = DATABASE_DATE_SHORTCUTS;

const SUPPORTED_FILTER_OPERATORS = [
	"equals",
	"not_equals",
	"contains",
	"not_contains",
	"starts_with",
	"ends_with",
	"greater_than",
	"less_than",
	"is_empty",
	"is_not_empty",
	"is_true",
	"is_false",
	"tags_contains",
	"any_of",
	"none_of",
	"within_last_7_days",
] as const satisfies readonly DatabaseFilter["operator"][];

function isSupportedFilterOperator(
	operator: string,
): operator is DatabaseFilter["operator"] {
	return SUPPORTED_FILTER_OPERATORS.includes(
		operator as DatabaseFilter["operator"],
	);
}

function isTagFilterColumn(column?: DatabaseColumn | null): boolean {
	return column?.type === "tags" || column?.property_kind === "tags";
}

function isBooleanColumn(column?: DatabaseColumn | null): boolean {
	return column?.property_kind === "checkbox";
}

function isNumberColumn(column?: DatabaseColumn | null): boolean {
	return column?.property_kind === "number";
}

function isDateColumn(column?: DatabaseColumn | null): boolean {
	return (
		column?.type === "created" ||
		column?.type === "updated" ||
		column?.property_kind === "date" ||
		column?.property_kind === "datetime"
	);
}

function defaultOperatorForColumn(
	column?: DatabaseColumn | null,
): DatabaseFilter["operator"] {
	if (isTagFilterColumn(column)) return "tags_contains";
	if (isBooleanColumn(column)) return "is_true";
	if (isDateColumn(column)) return "within_last_7_days";
	return "contains";
}

function emptyFilter(
	column: DatabaseColumn | null | undefined,
): DatabaseFilter {
	return {
		column_id: column?.id ?? "title",
		operator: defaultOperatorForColumn(column),
		value_text: isDateColumn(column) ? defaultDateFilterValue() : "",
		value_list: [],
	};
}

function operatorNeedsValue(operator: string): boolean {
	if (!isSupportedFilterOperator(operator)) return false;
	return ![
		"is_empty",
		"is_not_empty",
		"is_true",
		"is_false",
		"within_last_7_days",
	].includes(operator);
}

function operatorOptions(
	column: DatabaseColumn | null,
	currentOperator: string,
	t: TFunction<"ui">,
): Array<{ value: string; label: string; disabled?: boolean }> {
	const options: DatabaseFilter["operator"][] = isBooleanColumn(column)
		? ["is_true", "is_false", "is_empty", "is_not_empty"]
		: isDateColumn(column)
			? ["within_last_7_days", "equals", "is_empty", "is_not_empty"]
			: isNumberColumn(column)
				? [
						"equals",
						"not_equals",
						"greater_than",
						"less_than",
						"is_empty",
						"is_not_empty",
					]
				: isTagFilterColumn(column)
					? ["tags_contains", "equals", "not_equals", "any_of", "none_of"]
					: [
							"contains",
							"equals",
							"not_equals",
							"not_contains",
							"starts_with",
							"ends_with",
							"is_empty",
							"is_not_empty",
						];
	const normalized = options.map((operator) => ({
		value: operator,
		label: databaseFilterOperatorLabel(t, operator),
		disabled: false,
	}));
	if (options.some((operator) => operator === currentOperator))
		return normalized;

	const currentOption = {
		value: currentOperator,
		label: databaseFilterOperatorLabel(t, currentOperator),
		disabled: !isSupportedFilterOperator(currentOperator),
	};
	return currentOption.disabled
		? [currentOption, ...normalized]
		: [...normalized, currentOption];
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
		value_text:
			operator === "within_last_7_days" ? defaultDateFilterValue() : "",
		value_bool: null,
		value_list: [],
	};
}

function FilterJoiner({
	index,
	t,
}: {
	index: number;
	t: TFunction<"ui">;
}) {
	return (
		<span className="databaseViewOptionJoiner">
			{index === 0
				? t("database.where", { ns: "ui" })
				: t("database.and", { ns: "ui" })}
			<ChevronDown size="var(--icon-sm)" aria-hidden="true" />
		</span>
	);
}

function isFilterPresetApplied(
	filters: DatabaseFilter[],
	preset: DatabaseFilterPreset,
): boolean {
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
	const { t } = useTranslation("ui");
	const presets = databaseFilterPresets(config, availableProperties);
	const invalidOperatorIndex = config.filters.findIndex(
		(filter) => !isSupportedFilterOperator(filter.operator),
	);
	const invalidOperatorError =
		invalidOperatorIndex >= 0
			? t("database.unsupportedOperator", { index: invalidOperatorIndex + 1 })
			: "";
	return (
		<section
			className="databaseViewOptionsPanel is-wide"
			aria-label={t("database.filterBy")}
		>
			<div className="databaseViewPanelHeader">
				<span>{t("database.filterBy")}</span>
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
						{t("database.reset")}
					</button>
				) : null}
			</div>
			<p className="databaseViewPanelHint">{t("database.filterHint")}</p>
			<div
				className="databaseViewPresetGroup"
				aria-label={t("database.filterPresets")}
			>
				<span className="databaseViewPresetLabel">{t("database.presets")}</span>
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
				<div className="databaseViewPanelError">
					{filterError || invalidOperatorError}
				</div>
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
					{t("database.addCondition")}
				</button>
			) : (
				<div className="databaseViewFilterList">
					{config.filters.map((filter, index) => {
						const selectedColumn =
							columns.find((column) => column.id === filter.column_id) ?? null;
						const availableOperators = operatorOptions(
							selectedColumn,
							filter.operator,
							t,
						);
						const showsValue = operatorNeedsValue(filter.operator);
						const usesTagPicker =
							showsValue && isTagFilterColumn(selectedColumn);
						return (
							<div
								key={
									filterUiKeys[index] ?? `filter-fallback-${filter.column_id}`
								}
								className="databaseViewFilterRow"
							>
								<FilterJoiner index={index} t={t} />
								<span className="databaseViewFilterColumn">
									<DatabaseColumnIcon
										column={selectedColumn ?? undefined}
										size="var(--icon-lg)"
									/>
									<select
										className="databaseViewInlineSelect"
										value={filter.column_id}
										aria-label={t("database.filterField", { index: index + 1 })}
										onChange={(event) => {
											const nextColumn =
												columns.find(
													(column) => column.id === event.target.value,
												) ?? null;
											onChangeFilterColumn(index, nextColumn);
										}}
									>
										{columns.map((column) => (
											<option key={column.id} value={column.id}>
												{column.label}
											</option>
										))}
									</select>
								</span>
								<select
									className="databaseViewInlineSelect"
									value={filter.operator}
									aria-label={t("database.filterOperator", {
										index: index + 1,
									})}
									onChange={(event) =>
										void updateFilters((filters) =>
											filters.map((entry, i) =>
												i === index
													? {
															...entry,
															operator: event.target
																.value as DatabaseFilter["operator"],
															value_text:
																event.target.value === "within_last_7_days"
																	? defaultDateFilterValue()
																	: entry.value_text,
														}
													: entry,
											),
										)
									}
								>
									{availableOperators.map((option) => (
										<option
											key={option.value}
											value={option.value}
											disabled={option.disabled}
										>
											{option.label}
										</option>
									))}
								</select>
								{filter.operator === "within_last_7_days" ? (
									<select
										className="databaseViewInlineSelect"
										value={filter.value_text ?? defaultDateFilterValue()}
										aria-label={t("database.filterDateRange", {
											index: index + 1,
										})}
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
									>
										{DATE_SHORTCUT_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{t(`database.dateShortcuts.${option.key}`)}
											</option>
										))}
									</select>
								) : showsValue ? (
									usesTagPicker ? (
										<DatabaseTagPicker
											value={filter.value_text ?? ""}
											label={t("database.filterTag")}
											description={t("database.filterTagDescription")}
											placeholder={t("database.chooseTag")}
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
											placeholder={t("database.value")}
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
									title={t("database.removeFilter")}
									aria-label={t("database.removeFilter")}
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
						{t("database.addAnotherCondition")}
					</button>
				</div>
			)}
		</section>
	);
}
