import type { MutableRefObject } from "react";
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

const DATE_SHORTCUT_OPTIONS = [
	"Overdue",
	"Today",
	"This Week",
	"Last 7 Days",
	"Last 30 Days",
];

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

function emptyFilter(column?: DatabaseColumn | null): DatabaseFilter {
	return {
		column_id: column?.id ?? "title",
		operator: defaultOperatorForColumn(column),
		value_text: isDateColumn(column) ? "Last 7 Days" : "",
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

function operatorLabel(operator: string): string {
	switch (operator) {
		case "equals":
			return "is";
		case "not_equals":
			return "is not";
		case "contains":
		case "tags_contains":
			return "contains";
		case "not_contains":
			return "does not contain";
		case "starts_with":
			return "starts with";
		case "ends_with":
			return "ends with";
		case "greater_than":
			return "> Greater than";
		case "less_than":
			return "< Less than";
		case "is_empty":
			return "is empty";
		case "is_not_empty":
			return "is not empty";
		case "is_true":
			return "is checked";
		case "is_false":
			return "is unchecked";
		case "any_of":
			return "is any of";
		case "none_of":
			return "is none of";
		case "within_last_7_days":
			return "is";
		default:
			return `Unsupported: ${operator}`;
	}
}

function operatorOptions(
	column: DatabaseColumn | null,
	currentOperator: string,
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
		label: operatorLabel(operator),
		disabled: false,
	}));
	if (options.some((operator) => operator === currentOperator))
		return normalized;

	const currentOption = {
		value: currentOperator,
		label: operatorLabel(currentOperator),
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
		value_text: operator === "within_last_7_days" ? "Last 7 Days" : "",
		value_bool: null,
		value_list: [],
	};
}

function FilterJoiner({ index }: { index: number }) {
	return (
		<span className="databaseViewOptionJoiner">
			{index === 0 ? "Where" : "And"}
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
	const presets = databaseFilterPresets(config, availableProperties);
	const invalidOperatorIndex = config.filters.findIndex(
		(filter) => !isSupportedFilterOperator(filter.operator),
	);
	const invalidOperatorError =
		invalidOperatorIndex >= 0
			? `Filter ${invalidOperatorIndex + 1} uses an unsupported operator. Choose a supported operator to restore results.`
			: "";
	return (
		<section
			className="databaseViewOptionsPanel is-wide"
			aria-label="Filter by"
		>
			<div className="databaseViewPanelHeader">
				<span>Filter by</span>
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
						Reset
					</button>
				) : null}
			</div>
			<p className="databaseViewPanelHint">
				Narrow this view by column values. To search note text, use the search
				box in the toolbar.
			</p>
			<div className="databaseViewPresetGroup" aria-label="Filter presets">
				<span className="databaseViewPresetLabel">Presets</span>
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
					Add a condition
				</button>
			) : (
				<div className="databaseViewFilterList">
					{config.filters.map((filter, index) => {
						const selectedColumn =
							columns.find((column) => column.id === filter.column_id) ?? null;
						const availableOperators = operatorOptions(
							selectedColumn,
							filter.operator,
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
								<FilterJoiner index={index} />
								<span className="databaseViewFilterColumn">
									<DatabaseColumnIcon
										column={selectedColumn ?? undefined}
										size="var(--icon-lg)"
									/>
									<select
										className="databaseViewInlineSelect"
										value={filter.column_id}
										aria-label={`Filter ${index + 1} field`}
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
									aria-label={`Filter ${index + 1} operator`}
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
																	? "Last 7 Days"
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
										value={filter.value_text ?? "Last 7 Days"}
										aria-label={`Filter ${index + 1} date range`}
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
											<option key={option} value={option}>
												{option}
											</option>
										))}
									</select>
								) : showsValue ? (
									usesTagPicker ? (
										<DatabaseTagPicker
											value={filter.value_text ?? ""}
											label="Filter Tag"
											description="Choose a tag for this filter."
											placeholder="Choose a tag"
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
											placeholder="Value"
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
									title="Remove filter"
									aria-label="Remove filter"
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
						Add another condition
					</button>
				</div>
			)}
		</section>
	);
}
