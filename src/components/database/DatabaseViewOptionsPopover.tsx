import { cn } from "@/lib/utils";
import {
	FilterMailIcon,
	GridViewIcon,
	SlidersVerticalIcon,
	TextFontIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { defaultDatabaseColumnIconName } from "../../lib/database/columnIcons";
import { createPropertyColumn } from "../../lib/database/config";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabaseFilter,
	DatabasePropertyOption,
	DatabaseSort,
} from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	ChevronDown,
	ChevronRight,
	Plus,
	RefreshCw,
	Search,
	Trash2,
} from "../Icons";
import { Toggle } from "../base/toggle/toggle";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import { DatabaseFolderPicker } from "./DatabaseFolderPicker";
import { DatabaseTagPicker } from "./DatabaseTagPicker";

type OptionsPanel = "source" | "columns" | "filters" | "sort";

interface DatabaseViewOptionsPopoverProps {
	config: DatabaseConfig;
	availableProperties: DatabasePropertyOption[];
	onChangeConfig: (config: DatabaseConfig) => Promise<void>;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

interface FilterKeyEntry {
	key: string;
	signature: string;
}

interface ColumnMenuEntry {
	key: string;
	column: DatabaseColumn;
	enabled: boolean;
}

const RESERVED_PROPERTY_KEYS = new Set([
	"created",
	"folder",
	"glyph",
	"linked_notes",
	"path",
	"tags",
	"title",
	"updated",
]);

const defaultColumns: DatabaseColumn[] = [
	{
		id: "title",
		type: "title",
		label: "Title",
		icon: defaultDatabaseColumnIconName({ type: "title", property_kind: null }),
		width: 320,
		visible: true,
	},
	{
		id: "tags",
		type: "tags",
		label: "Tags",
		icon: defaultDatabaseColumnIconName({ type: "tags", property_kind: null }),
		width: 220,
		visible: true,
	},
	{
		id: "updated",
		type: "updated",
		label: "Updated",
		icon: defaultDatabaseColumnIconName({
			type: "updated",
			property_kind: null,
		}),
		width: 180,
		visible: true,
	},
];

const builtInColumns: DatabaseColumn[] = [
	...defaultColumns,
	{
		id: "folder",
		type: "folder",
		label: "Folder",
		icon: defaultDatabaseColumnIconName({
			type: "folder",
			property_kind: null,
		}),
		width: 220,
		visible: false,
	},
	{
		id: "path",
		type: "path",
		label: "Path",
		icon: defaultDatabaseColumnIconName({ type: "path", property_kind: null }),
		width: 260,
		visible: false,
	},
	{
		id: "linked_notes",
		type: "linked_notes",
		label: "Linked Notes",
		icon: defaultDatabaseColumnIconName({
			type: "linked_notes",
			property_kind: null,
		}),
		width: 220,
		visible: false,
	},
	{
		id: "created",
		type: "created",
		label: "Created",
		icon: defaultDatabaseColumnIconName({
			type: "created",
			property_kind: null,
		}),
		width: 180,
		visible: false,
	},
];

function isReservedPropertyKey(key: string): boolean {
	return RESERVED_PROPERTY_KEYS.has(key.trim().toLowerCase());
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

function filterSignature(filter: DatabaseFilter): string {
	return JSON.stringify({
		columnId: filter.column_id,
		operator: filter.operator,
		valueText: filter.value_text ?? null,
		valueBool: filter.value_bool ?? null,
		valueList: filter.value_list,
	});
}

function sourceLabel(config: DatabaseConfig): string {
	switch (config.source.kind) {
		case "folder":
			return config.source.value || "Folder";
		case "tag":
			return config.source.value || "Tag";
		case "search":
			return config.source.value || "Search";
		case "all_notes":
			return "All notes";
	}
}

function sortLabel(
	sort: DatabaseSort | undefined,
	columns: DatabaseColumn[],
): string {
	if (!sort) return "None";
	return (
		columns.find((column) => column.id === sort.column_id)?.label ?? "Sort"
	);
}

function directionLabel(
	column: DatabaseColumn | null,
	direction: "asc" | "desc",
) {
	if (isDateColumn(column)) {
		return direction === "asc" ? "Oldest - Newest" : "Newest - Oldest";
	}
	if (isNumberColumn(column)) {
		return direction === "asc" ? "Lowest - Highest" : "Highest - Lowest";
	}
	if (isBooleanColumn(column)) {
		return direction === "asc" ? "Unchecked first" : "Checked first";
	}
	return direction === "asc" ? "A - Z" : "Z - A";
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

function OptionMenuRow({
	icon,
	label,
	value,
	active,
	danger,
	onClick,
}: {
	icon: ReactNode;
	label: string;
	value?: string;
	active?: boolean;
	danger?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				"databaseViewOptionsRow",
				active && "is-active",
				danger && "is-danger",
			)}
			onClick={onClick}
		>
			<span className="databaseViewOptionsRowIcon">{icon}</span>
			<span className="databaseViewOptionsRowLabel">{label}</span>
			{value ? <span className="databaseViewOptionsPill">{value}</span> : null}
			<ChevronRight size={15} aria-hidden="true" />
		</button>
	);
}

export function DatabaseViewOptionsPopover({
	config,
	availableProperties,
	onChangeConfig,
	open,
	onOpenChange,
}: DatabaseViewOptionsPopoverProps) {
	const [activePanel, setActivePanel] = useState<OptionsPanel | null>(null);
	const [filterError, setFilterError] = useState("");
	const filterKeyCounterRef = useRef(0);
	const previousFilterKeyEntriesRef = useRef<FilterKeyEntry[]>([]);
	const visibleCount = config.columns.filter((column) => column.visible).length;

	const columnsById = useMemo(
		() => new Map(config.columns.map((column) => [column.id, column])),
		[config.columns],
	);
	const propertyColumnsByKey = useMemo(() => {
		const entries = new Map<string, DatabaseColumn>();
		for (const column of config.columns) {
			if (column.type !== "property" || !column.property_key) continue;
			entries.set(column.property_key.trim().toLowerCase(), column);
		}
		return entries;
	}, [config.columns]);

	const columnMenuEntries = useMemo<ColumnMenuEntry[]>(() => {
		const entries = new Map<string, ColumnMenuEntry>();
		for (const column of builtInColumns) {
			const existing = columnsById.get(column.id);
			entries.set(column.id, {
				key: column.id,
				column: existing ?? column,
				enabled: existing?.visible ?? column.visible,
			});
		}
		for (const property of availableProperties) {
			if (isReservedPropertyKey(property.key)) continue;
			const trimmedKey = property.key.trim();
			const propertyKey = trimmedKey.toLowerCase();
			const normalizedId = `property:${propertyKey}`;
			if (entries.has(normalizedId)) continue;
			const id = `property:${trimmedKey}`;
			const existing =
				columnsById.get(normalizedId) ??
				columnsById.get(id) ??
				propertyColumnsByKey.get(propertyKey);
			entries.set(normalizedId, {
				key: normalizedId,
				column:
					existing ?? createPropertyColumn({ ...property, key: trimmedKey }),
				enabled: existing?.visible ?? false,
			});
		}
		for (const column of config.columns) {
			const normalized = column.property_key?.trim().toLowerCase() ?? "";
			const normalizedId = `property:${normalized}`;
			if (
				column.type !== "property" ||
				!column.property_key ||
				isReservedPropertyKey(column.property_key) ||
				entries.has(normalizedId)
			) {
				continue;
			}
			entries.set(normalizedId, {
				key: normalizedId,
				column,
				enabled: column.visible,
			});
		}
		const orderById = new Map(
			config.columns.map((column, index) => [column.id, index]),
		);
		return [...entries.values()].sort((left, right) => {
			const leftOrder = orderById.get(left.column.id);
			const rightOrder = orderById.get(right.column.id);
			if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
			if (leftOrder != null && rightOrder != null)
				return leftOrder - rightOrder;
			if (leftOrder != null) return -1;
			if (rightOrder != null) return 1;
			return left.column.label.localeCompare(right.column.label);
		});
	}, [availableProperties, columnsById, config.columns, propertyColumnsByKey]);

	const deriveFilterUiKeys = useCallback(
		(filters: DatabaseFilter[], preferredKeys?: string[]) => {
			const nextEntries = (() => {
				if (preferredKeys && preferredKeys.length === filters.length) {
					return filters.map((filter, index) => ({
						key:
							preferredKeys[index] ?? `filter-${filterKeyCounterRef.current++}`,
						signature: filterSignature(filter),
					}));
				}
				const availableKeysBySignature = new Map<string, string[]>();
				for (const entry of previousFilterKeyEntriesRef.current) {
					const bucket = availableKeysBySignature.get(entry.signature);
					if (bucket) bucket.push(entry.key);
					else availableKeysBySignature.set(entry.signature, [entry.key]);
				}
				return filters.map((filter) => {
					const signature = filterSignature(filter);
					const bucket = availableKeysBySignature.get(signature);
					return {
						key: bucket?.shift() ?? `filter-${filterKeyCounterRef.current++}`,
						signature,
					};
				});
			})();
			previousFilterKeyEntriesRef.current = nextEntries;
			return nextEntries.map((entry) => entry.key);
		},
		[],
	);
	const filterSyncSignature = config.filters
		.map(filterSignature)
		.join("\u0001");
	const [filterUiKeys, setFilterUiKeys] = useState<string[]>(() =>
		deriveFilterUiKeys(config.filters),
	);

	useEffect(() => {
		void filterSyncSignature;
		setFilterUiKeys(deriveFilterUiKeys(config.filters));
	}, [config.filters, deriveFilterUiKeys, filterSyncSignature]);

	const updateConfig = async (nextConfig: DatabaseConfig) => {
		await onChangeConfig(nextConfig);
	};

	const updateColumns = async (
		updater: (columns: DatabaseColumn[]) => DatabaseColumn[],
	) => {
		await updateConfig({ ...config, columns: updater(config.columns) });
	};

	const setColumnEnabled = async (column: DatabaseColumn, enabled: boolean) => {
		const existing = columnsById.get(column.id);
		if (existing) {
			await updateColumns((columns) =>
				columns.map((entry) =>
					entry.id === column.id ? { ...entry, visible: enabled } : entry,
				),
			);
			return;
		}
		if (enabled) {
			await updateColumns((columns) => [
				...columns,
				{ ...column, visible: true },
			]);
		}
	};

	const updateFilters = async (
		updater: (filters: DatabaseFilter[]) => DatabaseFilter[],
		keyUpdater?: (keys: string[]) => string[],
	) => {
		const nextFilters = updater(config.filters);
		const nextKeys = keyUpdater?.(filterUiKeys);
		try {
			setFilterError("");
			await updateConfig({ ...config, filters: nextFilters });
			setFilterUiKeys(deriveFilterUiKeys(nextFilters, nextKeys));
		} catch (cause) {
			const message = extractErrorMessage(cause);
			console.error("Failed to update database filters", cause);
			setFilterError(message);
		}
	};

	const defaultFilterColumn =
		config.columns.find((column) => column.visible) ??
		config.columns[0] ??
		null;
	const activeSort = config.sorts[0] ?? null;
	const sortColumn =
		config.columns.find((column) => column.id === activeSort?.column_id) ??
		config.columns.find((column) => column.visible) ??
		config.columns[0] ??
		null;
	const sortDirection = activeSort?.direction ?? "asc";

	const setSort = (patch: Partial<DatabaseSort>) => {
		if (!sortColumn && !patch.column_id) return;
		void updateConfig({
			...config,
			sorts: [
				{
					column_id:
						patch.column_id ??
						activeSort?.column_id ??
						sortColumn?.id ??
						"title",
					direction: patch.direction ?? activeSort?.direction ?? "asc",
				},
			],
		});
	};

	const resetViewOptions = () => {
		void updateConfig({
			...config,
			view: {
				...config.view,
				search: "",
				board_group_by: null,
			},
			columns: defaultColumns,
			sorts: [],
			filters: [],
		});
	};

	const togglePanel = (panel: OptionsPanel) => {
		setActivePanel((current) => (current === panel ? null : panel));
	};

	const renderSourcePanel = () => (
		<section className="databaseViewOptionsPanel" aria-label="Source">
			<div className="databaseViewPanelHeader">
				<span>Source</span>
			</div>
			<div className="databaseViewPanelStack">
				<label className="databaseViewField">
					<span>Source</span>
					<select
						className="databaseNativeSelect"
						value={config.source.kind}
						onChange={(event) =>
							void updateConfig({
								...config,
								source: {
									...config.source,
									kind: event.target.value as DatabaseConfig["source"]["kind"],
								},
							})
						}
					>
						<option value="all_notes">All notes</option>
						<option value="folder">Folder</option>
						<option value="tag">Tag</option>
						<option value="search">Search</option>
					</select>
				</label>
				{config.source.kind === "folder" ? (
					<>
						<div className="databaseViewField">
							<span>Folder</span>
							<DatabaseFolderPicker
								value={config.source.value}
								placeholder="Choose a folder"
								triggerClassName="databaseSourceInlinePicker"
								onChange={(value) =>
									void updateConfig({
										...config,
										source: { ...config.source, value },
									})
								}
							/>
						</div>
						<label className="databaseViewCheckRow">
							<input
								type="checkbox"
								checked={config.source.recursive}
								onChange={(event) =>
									void updateConfig({
										...config,
										source: {
											...config.source,
											recursive: event.target.checked,
										},
									})
								}
							/>
							<span>Include subfolders</span>
						</label>
					</>
				) : null}
				{config.source.kind === "tag" ? (
					<DatabaseTagPicker
						value={config.source.value}
						label="Database Tag"
						description="Choose a tag for this database."
						placeholder="Choose a tag"
						onChange={(value) =>
							void updateConfig({
								...config,
								source: { ...config.source, value },
							})
						}
					/>
				) : null}
				{config.source.kind === "search" ? (
					<label
						className="databaseViewField"
						htmlFor="databaseViewSourceQuery"
					>
						<span>Query</span>
						<Input
							id="databaseViewSourceQuery"
							value={config.source.value}
							placeholder={'tag:projects "roadmap"'}
							onChange={(event) =>
								void updateConfig({
									...config,
									source: { ...config.source, value: event.target.value },
								})
							}
						/>
					</label>
				) : null}
				<div className="databaseViewField">
					<span>Save new notes in</span>
					<DatabaseFolderPicker
						value={config.new_note.folder}
						placeholder="Folder"
						triggerClassName="databaseSourceInlinePicker"
						onChange={(folder) =>
							void updateConfig({
								...config,
								new_note: { ...config.new_note, folder },
							})
						}
					/>
				</div>
			</div>
		</section>
	);

	const renderColumnsPanel = () => (
		<section className="databaseViewOptionsPanel" aria-label="Columns">
			<div className="databaseViewPanelHeader">
				<span>Columns</span>
			</div>
			<div className="databaseViewColumnsList">
				{columnMenuEntries.map((entry) => (
					<div
						key={entry.key}
						className={cn(
							"databaseViewColumnRow",
							entry.enabled && "is-enabled",
						)}
					>
						<span className="databaseViewColumnLabel">
							{entry.column.label}
						</span>
						<span className="databaseViewColumnToggle">
							<Toggle
								size="sm"
								checked={entry.enabled}
								ariaLabel={`${entry.enabled ? "Hide" : "Show"} ${entry.column.label} column`}
								onCheckedChange={(checked) =>
									void setColumnEnabled(entry.column, checked)
								}
							/>
						</span>
					</div>
				))}
			</div>
			<div className="databaseViewPanelDivider" />
			<button
				type="button"
				className="databaseViewColumnRow databaseViewColumnUtility"
				onClick={() =>
					void updateColumns((columns) => {
						const existing = new Map(
							columns.map((column) => [column.id, column]),
						);
						const missing = columnMenuEntries
							.map((entry) => entry.column)
							.filter((column) => !existing.has(column.id));
						return [
							...columns.map((column) => ({ ...column, visible: true })),
							...missing.map((column) => ({ ...column, visible: true })),
						];
					})
				}
			>
				<span>Show all columns</span>
			</button>
			<button
				type="button"
				className="databaseViewRestoreButton"
				onClick={() =>
					void updateConfig({ ...config, columns: defaultColumns })
				}
			>
				<RefreshCw size={16} aria-hidden="true" />
				Restore defaults
			</button>
		</section>
	);

	const renderFiltersPanel = () => (
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

	const renderSortPanel = () => (
		<section className="databaseViewOptionsPanel is-sort" aria-label="Sort by">
			<div className="databaseViewPanelHeader">
				<span>Sort by</span>
				{activeSort ? (
					<button
						type="button"
						className="databaseViewPanelReset"
						onClick={() => void updateConfig({ ...config, sorts: [] })}
					>
						Reset
					</button>
				) : null}
			</div>
			<div className="databaseViewSortRow">
				<span className="databaseViewFilterColumn">
					<DatabaseColumnIcon column={sortColumn ?? undefined} size={16} />
					<select
						className="databaseViewInlineSelect"
						value={activeSort?.column_id ?? sortColumn?.id ?? ""}
						aria-label="Sort field"
						onChange={(event) => setSort({ column_id: event.target.value })}
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
					value={sortDirection}
					aria-label="Sort direction"
					onChange={(event) =>
						setSort({ direction: event.target.value as "asc" | "desc" })
					}
				>
					<option value="asc">{directionLabel(sortColumn, "asc")}</option>
					<option value="desc">{directionLabel(sortColumn, "desc")}</option>
				</select>
			</div>
		</section>
	);

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen) setActivePanel(null);
				onOpenChange?.(nextOpen);
			}}
		>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="databaseToolbarChip databaseViewOptionsTrigger"
					title="View settings"
					aria-label="View settings"
				>
					<HugeiconsIcon
						icon={SlidersVerticalIcon}
						size={14}
						strokeWidth={0.9}
					/>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				className="databaseViewOptionsPopover"
				onOpenAutoFocus={(event) => event.preventDefault()}
				onKeyDown={(event) => event.stopPropagation()}
			>
				{activePanel === "source" ? renderSourcePanel() : null}
				{activePanel === "columns" ? renderColumnsPanel() : null}
				{activePanel === "filters" ? renderFiltersPanel() : null}
				{activePanel === "sort" ? renderSortPanel() : null}
				<section className="databaseViewOptionsMenu" aria-label="View settings">
					<OptionMenuRow
						icon={<Search size={16} />}
						label="Source"
						value={sourceLabel(config)}
						active={activePanel === "source"}
						onClick={() => togglePanel("source")}
					/>
					<OptionMenuRow
						icon={
							<HugeiconsIcon icon={GridViewIcon} size={16} strokeWidth={0.9} />
						}
						label="Columns"
						value={`${visibleCount} selected`}
						active={activePanel === "columns"}
						onClick={() => togglePanel("columns")}
					/>
					<OptionMenuRow
						icon={
							<HugeiconsIcon
								icon={FilterMailIcon}
								size={16}
								strokeWidth={0.9}
							/>
						}
						label="Filter by"
						value={
							config.filters.length > 0
								? `${config.filters.length} applied`
								: "None"
						}
						active={activePanel === "filters"}
						onClick={() => togglePanel("filters")}
					/>
					<OptionMenuRow
						icon={
							<HugeiconsIcon icon={TextFontIcon} size={16} strokeWidth={0.9} />
						}
						label="Sort by"
						value={sortLabel(activeSort ?? undefined, config.columns)}
						active={activePanel === "sort"}
						onClick={() => togglePanel("sort")}
					/>
					<button
						type="button"
						className="databaseViewRestoreButton"
						onClick={resetViewOptions}
					>
						<RefreshCw size={16} aria-hidden="true" />
						Restore defaults
					</button>
				</section>
			</PopoverContent>
		</Popover>
	);
}
