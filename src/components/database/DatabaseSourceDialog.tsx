import { useCallback, useEffect, useRef, useState } from "react";
import type { DatabaseConfig, DatabaseFilter } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { Button } from "../ui/shadcn/button";
import {
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from "../ui/shadcn/dropdown-menu";
import { Input } from "../ui/shadcn/input";
import { DatabaseFolderPicker } from "./DatabaseFolderPicker";
import { DatabaseTagPicker } from "./DatabaseTagPicker";

interface DatabaseSourceDropdownProps {
	config: DatabaseConfig;
	onChangeConfig: (config: DatabaseConfig) => Promise<void>;
}

interface FilterKeyEntry {
	key: string;
	signature: string;
}

function isTagFilterColumn(
	column?: DatabaseConfig["columns"][number] | null,
): boolean {
	return column?.type === "tags" || column?.property_kind === "tags";
}

function defaultOperatorForColumn(
	column?: DatabaseConfig["columns"][number] | null,
): DatabaseFilter["operator"] {
	return isTagFilterColumn(column) ? "tags_contains" : "contains";
}

function emptyFilter(
	column?: DatabaseConfig["columns"][number] | null,
): DatabaseFilter {
	return {
		column_id: column?.id ?? "title",
		operator: defaultOperatorForColumn(column),
		value_list: [],
	};
}

function operatorNeedsValue(operator: DatabaseFilter["operator"]): boolean {
	return !["is_empty", "is_not_empty", "is_true", "is_false"].includes(
		operator,
	);
}

function operatorLabel(operator: string): string {
	switch (operator) {
		case "equals":
			return "Equals";
		case "not_equals":
			return "Not equals";
		case "contains":
		case "tags_contains":
			return "Contains";
		case "not_contains":
			return "Does not contain";
		case "starts_with":
			return "Starts with";
		case "ends_with":
			return "Ends with";
		case "is_empty":
			return "Is empty";
		case "is_not_empty":
			return "Is not empty";
		case "is_true":
			return "Is true";
		case "is_false":
			return "Is false";
		case "any_of":
			return "Any of";
		case "none_of":
			return "None of";
		case "within_last_7_days":
			return "Within last 7 days";
		default:
			return operator
				.split("_")
				.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
				.join(" ");
	}
}

function operatorOptions(
	column: DatabaseConfig["columns"][number] | null,
	currentOperator: DatabaseFilter["operator"],
): Array<{ value: DatabaseFilter["operator"]; label: string }> {
	const baseOptions: Array<{
		value: DatabaseFilter["operator"];
		label: string;
	}> = [
		{ value: defaultOperatorForColumn(column), label: "Contains" },
		{ value: "equals", label: "Equals" },
		{ value: "is_empty", label: "Is empty" },
		{ value: "is_not_empty", label: "Is not empty" },
		{ value: "is_true", label: "Is true" },
		{ value: "is_false", label: "Is false" },
	];

	if (baseOptions.some((option) => option.value === currentOperator)) {
		return baseOptions;
	}

	return [
		...baseOptions,
		{ value: currentOperator, label: operatorLabel(currentOperator) },
	];
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

export function DatabaseSourceDropdown({
	config,
	onChangeConfig,
}: DatabaseSourceDropdownProps) {
	const [filterError, setFilterError] = useState("");
	const filterKeyCounterRef = useRef(0);
	const previousFilterKeyEntriesRef = useRef<FilterKeyEntry[]>([]);
	const [filterUiKeys, setFilterUiKeys] = useState<string[]>([]);

	const syncFilterUiKeys = useCallback(
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
					if (bucket) {
						bucket.push(entry.key);
						continue;
					}
					availableKeysBySignature.set(entry.signature, [entry.key]);
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

			const nextKeys = nextEntries.map((entry) => entry.key);
			previousFilterKeyEntriesRef.current = nextEntries;
			setFilterUiKeys(nextKeys);
			return nextKeys;
		},
		[],
	);

	useEffect(() => {
		syncFilterUiKeys(config.filters);
	}, [config.filters, syncFilterUiKeys]);

	const handleSave = async (patch: Partial<DatabaseConfig["source"]>) => {
		await onChangeConfig({
			...config,
			source: {
				...config.source,
				...patch,
			},
		});
	};

	const handleNewNoteFolder = async (folder: string) => {
		await onChangeConfig({
			...config,
			new_note: {
				...config.new_note,
				folder,
			},
		});
	};

	const updateFilters = async (
		updater: (filters: DatabaseFilter[]) => DatabaseFilter[],
		keyUpdater?: (keys: string[]) => string[],
	) => {
		const nextFilters = updater(config.filters);
		const nextKeys = keyUpdater?.(filterUiKeys);
		try {
			setFilterError("");
			await onChangeConfig({
				...config,
				filters: nextFilters,
			});
			syncFilterUiKeys(nextFilters, nextKeys);
		} catch (cause) {
			const message = extractErrorMessage(cause);
			console.error("Failed to update database filters", cause);
			setFilterError(message);
		}
	};

	const defaultColumn = config.columns[0] ?? null;

	return (
		<DropdownMenuContent
			className="databasePickerMenu w-56 max-h-80 overflow-y-auto"
			align="end"
			onCloseAutoFocus={(e) => e.preventDefault()}
		>
			<div
				role="presentation"
				className="flex flex-col gap-2 px-2 py-1.5"
				onKeyDown={(e) => e.stopPropagation()}
			>
				<div className="flex items-center gap-3">
					<label
						className="w-12 shrink-0 text-xs font-medium text-muted-foreground"
						htmlFor="databaseSourceKind"
					>
						Source
					</label>
					<select
						id="databaseSourceKind"
						className="databaseNativeSelect min-w-0 flex-1 text-sm"
						value={config.source.kind}
						onChange={(event) =>
							void handleSave({
								kind: event.target.value as DatabaseConfig["source"]["kind"],
							})
						}
					>
						<option value="all_notes">All notes</option>
						<option value="folder">Folder</option>
						<option value="tag">Tag</option>
						<option value="search">Search</option>
					</select>
				</div>
				{config.source.kind === "folder" ? (
					<>
						<div className="flex items-center gap-3">
							<span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">
								Folder
							</span>
							<DatabaseFolderPicker
								value={config.source.value}
								placeholder="Choose a folder"
								triggerClassName="databaseSourceInlinePicker"
								onChange={(value) => void handleSave({ value })}
							/>
						</div>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								className="accent-[var(--interactive-accent)]"
								checked={config.source.recursive}
								onChange={(e) =>
									void handleSave({ recursive: e.target.checked })
								}
							/>
							Include subfolders
						</label>
					</>
				) : config.source.kind === "tag" ? (
					<div className="flex flex-col gap-1">
						<span className="text-xs font-medium text-muted-foreground">
							Tag
						</span>
						<DatabaseTagPicker
							value={config.source.value}
							label="Database Tag"
							description="Choose a tag for this database."
							placeholder="Choose a tag"
							onChange={(value) => void handleSave({ value })}
						/>
					</div>
				) : config.source.kind === "search" ? (
					<div className="flex flex-col gap-1">
						<span className="text-xs font-medium text-muted-foreground">
							Query
						</span>
						<Input
							id="databaseSourceValue"
							className="h-7 text-sm"
							value={config.source.value}
							placeholder={'tag:projects "roadmap"'}
							onChange={(event) =>
								void handleSave({ value: event.target.value })
							}
						/>
					</div>
				) : null}
			</div>

			<DropdownMenuSeparator />

			<div className="flex items-center justify-between px-2 py-1">
				<DropdownMenuLabel className="p-0">Filters</DropdownMenuLabel>
				<Button
					type="button"
					variant="ghost"
					size="xs"
					onClick={() =>
						void updateFilters(
							(filters) => [...filters, emptyFilter(defaultColumn)],
							(keys) => [...keys, `filter-${filterKeyCounterRef.current++}`],
						)
					}
				>
					Add
				</Button>
			</div>
			{filterError ? (
				<div className="px-2 pb-1 text-xs text-destructive">{filterError}</div>
			) : null}
			{config.filters.length > 0 ? (
				<div
					role="presentation"
					className="flex flex-col gap-1.5 px-2 pb-1.5"
					onKeyDown={(e) => e.stopPropagation()}
				>
					{config.filters.map((filter, index) => {
						const selectedColumn =
							config.columns.find((column) => column.id === filter.column_id) ??
							null;
						const showsValue = operatorNeedsValue(filter.operator);
						const usesTagPicker =
							showsValue && isTagFilterColumn(selectedColumn);
						const availableOperators = operatorOptions(
							selectedColumn,
							filter.operator,
						);

						return (
							<div
								key={
									filterUiKeys[index] ?? `filter-fallback-${filter.column_id}`
								}
								className="flex flex-col gap-1 rounded-md border border-border p-1.5"
							>
								<div className="flex items-center gap-1">
									<select
										className="databaseNativeSelect flex-1 min-w-0 text-xs"
										value={filter.column_id}
										aria-label={`Filter ${index + 1} field`}
										onChange={(event) =>
											void updateFilters((filters) =>
												filters.map((entry, i) =>
													i === index
														? { ...entry, column_id: event.target.value }
														: entry,
												),
											)
										}
									>
										{config.columns.map((column) => (
											<option key={column.id} value={column.id}>
												{column.label}
											</option>
										))}
									</select>
									<select
										className="databaseNativeSelect flex-1 min-w-0 text-xs"
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
									<button
										type="button"
										className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-destructive"
										onClick={() =>
											void updateFilters(
												(filters) => filters.filter((_, i) => i !== index),
												(keys) => keys.filter((_, i) => i !== index),
											)
										}
										title="Remove filter"
										aria-label="Remove filter"
									>
										<span className="text-xs">✕</span>
									</button>
								</div>
								{showsValue ? (
									<div>
										{usesTagPicker ? (
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
												className="h-7 text-xs"
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
										)}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			) : null}

			<DropdownMenuSeparator />

			<div
				role="presentation"
				className="flex flex-col gap-2 px-2 py-1.5"
				onKeyDown={(e) => e.stopPropagation()}
			>
				<div className="flex items-center gap-3">
					<span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">
						Save new files in
					</span>
					<DatabaseFolderPicker
						value={config.new_note.folder}
						placeholder="Choose a folder"
						triggerClassName="databaseSourceInlinePicker"
						onChange={(value) => void handleNewNoteFolder(value)}
					/>
				</div>
			</div>
		</DropdownMenuContent>
	);
}
