import type { MutableRefObject } from "react";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabaseFilter,
} from "../../lib/database/types";
import { ChevronDown, Plus, Trash2 } from "../Icons";
import { Input } from "../ui/shadcn/input";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import { DatabaseTagPicker } from "./DatabaseTagPicker";

interface FiltersPanelProps {
	config: DatabaseConfig;
	filterError: string;
	filterUiKeys: string[];
	filterKeyCounterRef: MutableRefObject<number>;
	defaultFilterColumn: DatabaseColumn | null;
	updateFilters: (
		updater: (filters: DatabaseFilter[]) => DatabaseFilter[],
		keyUpdater?: (keys: string[]) => string[],
	) => Promise<void>;
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

function operatorNeedsValue(operator: DatabaseFilter["operator"]): boolean {
	return ![
		"is_empty",
		"is_not_empty",
		"is_true",
		"is_false",
		"within_last_7_days",
	].includes(operator);
}

function operatorLabel(operator: DatabaseFilter["operator"]): string {
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
			return "within last 7 days";
	}
}

function operatorOptions(
	column: DatabaseColumn | null,
	currentOperator: DatabaseFilter["operator"],
): Array<{ value: DatabaseFilter["operator"]; label: string }> {
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
	const normalized = options.includes(currentOperator)
		? options
		: [...options, currentOperator];
	return normalized.map((value) => ({ value, label: operatorLabel(value) }));
}

function nextFilterForColumn(
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
			<ChevronDown size={12} aria-hidden="true" />
		</span>
	);
}

export function FiltersPanel({
	config,
	filterError,
	filterUiKeys,
	filterKeyCounterRef,
	defaultFilterColumn,
	updateFilters,
}: FiltersPanelProps) {
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
			{filterError ? (
				<div className="databaseViewPanelError">{filterError}</div>
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
					<Plus size={14} aria-hidden="true" />
					Add a condition
				</button>
			) : (
				<div className="databaseViewFilterList">
					{config.filters.map((filter, index) => {
						const selectedColumn =
							config.columns.find((column) => column.id === filter.column_id) ??
							null;
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
										size={15}
									/>
									<select
										className="databaseViewInlineSelect"
										value={filter.column_id}
										aria-label={`Filter ${index + 1} field`}
										onChange={(event) =>
											void updateFilters((filters) =>
												filters.map((entry, i) => {
													if (i !== index) return entry;
													const nextColumn =
														config.columns.find(
															(column) => column.id === event.target.value,
														) ?? null;
													return nextFilterForColumn(entry, nextColumn);
												}),
											)
										}
									>
										{config.columns.map((column) => (
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
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
								{showsValue ? (
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
									<Trash2 size={15} />
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
						<Plus size={14} aria-hidden="true" />
						Add another condition
					</button>
				</div>
			)}
		</section>
	);
}
