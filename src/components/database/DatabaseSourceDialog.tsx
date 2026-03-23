import { useState } from "react";
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

function emptyFilter(columnId: string): DatabaseFilter {
	return {
		column_id: columnId,
		operator: "contains",
		value_list: [],
	};
}

function operatorNeedsValue(operator: DatabaseFilter["operator"]): boolean {
	return !["is_empty", "is_not_empty", "is_true", "is_false"].includes(
		operator,
	);
}

function normalizedOperator(
	operator: DatabaseFilter["operator"],
): Exclude<DatabaseFilter["operator"], "tags_contains"> {
	return operator === "tags_contains" ? "contains" : operator;
}

export function DatabaseSourceDropdown({
	config,
	onChangeConfig,
}: DatabaseSourceDropdownProps) {
	const [filterError, setFilterError] = useState("");

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
	) => {
		try {
			setFilterError("");
			await onChangeConfig({
				...config,
				filters: updater(config.filters),
			});
		} catch (cause) {
			const message = extractErrorMessage(cause);
			console.error("Failed to update database filters", cause);
			setFilterError(message);
		}
	};

	const defaultColumnId = config.columns[0]?.id ?? "title";

	return (
		<DropdownMenuContent
			className="w-56 max-h-80 overflow-y-auto"
			align="end"
			onCloseAutoFocus={(e) => e.preventDefault()}
		>
			<DropdownMenuLabel>Source & filters</DropdownMenuLabel>
			<DropdownMenuSeparator />

			<div
				className="flex flex-col gap-2 px-2 py-1.5"
				onKeyDown={(e) => e.stopPropagation()}
			>
				<div className="flex flex-col gap-1">
					<label
						className="text-xs font-medium text-muted-foreground"
						htmlFor="databaseSourceKind"
					>
						Source
					</label>
					<select
						id="databaseSourceKind"
						className="databaseNativeSelect text-sm"
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
						<div className="flex flex-col gap-1">
							<span className="text-xs font-medium text-muted-foreground">
								Folder
							</span>
							<DatabaseFolderPicker
								value={config.source.value}
								label="Database Folder"
								description="Choose a folder for this database."
								placeholder="Choose a folder"
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
						void updateFilters((filters) => [
							...filters,
							emptyFilter(defaultColumnId),
						])
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
					className="flex flex-col gap-1.5 px-2 pb-1.5"
					onKeyDown={(e) => e.stopPropagation()}
				>
					{config.filters.map((filter, index) => {
						const selectedColumn =
							config.columns.find((column) => column.id === filter.column_id) ??
							null;
						const effectiveOperator = normalizedOperator(filter.operator);
						const showsValue = operatorNeedsValue(effectiveOperator);
						const usesTagPicker =
							showsValue &&
							(selectedColumn?.type === "tags" ||
								selectedColumn?.property_kind === "tags");

						return (
							<div
								key={`${filter.column_id}:${index}`}
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
										value={effectiveOperator}
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
										<option value="contains">Contains</option>
										<option value="equals">Equals</option>
										<option value="is_empty">Is empty</option>
										<option value="is_not_empty">Is not empty</option>
										<option value="is_true">Is true</option>
										<option value="is_false">Is false</option>
									</select>
									<button
										type="button"
										className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-destructive"
										onClick={() =>
											void updateFilters((filters) =>
												filters.filter((_, i) => i !== index),
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
				className="flex flex-col gap-2 px-2 py-1.5"
				onKeyDown={(e) => e.stopPropagation()}
			>
				<div className="flex flex-col gap-1">
					<span className="text-xs font-medium text-muted-foreground">
						Save new files in
					</span>
					<DatabaseFolderPicker
						value={config.new_note.folder}
						label="New Row Folder"
						description="Choose where new notes should be stored."
						placeholder="Choose a folder"
						onChange={(value) => void handleNewNoteFolder(value)}
					/>
				</div>
				<div className="flex flex-col gap-1">
					<label
						className="text-xs font-medium text-muted-foreground"
						htmlFor="databaseTitlePrefix"
					>
						Title prefix
					</label>
					<Input
						id="databaseTitlePrefix"
						className="h-7 text-sm"
						value={config.new_note.title_prefix}
						placeholder="Untitled"
						onChange={(event) =>
							void onChangeConfig({
								...config,
								new_note: {
									...config.new_note,
									title_prefix: event.target.value,
								},
							})
						}
					/>
				</div>
			</div>
		</DropdownMenuContent>
	);
}
