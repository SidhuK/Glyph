import { useState } from "react";
import type { DatabaseConfig, DatabaseFilter } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { Toggle } from "../base/toggle/toggle";
import { Button } from "../ui/shadcn/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "../ui/shadcn/dialog";
import { Input } from "../ui/shadcn/input";
import { DatabaseFolderPicker } from "./DatabaseFolderPicker";
import { DatabaseTagPicker } from "./DatabaseTagPicker";

interface DatabaseSourceDialogProps {
	open: boolean;
	config: DatabaseConfig;
	onOpenChange: (open: boolean) => void;
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

export function DatabaseSourceDialog({
	open,
	config,
	onOpenChange,
	onChangeConfig,
}: DatabaseSourceDialogProps) {
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
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="databaseDialog databaseDialogCompact">
				<DialogHeader className="databaseDialogHeaderCompact">
					<DialogTitle>Source & filters</DialogTitle>
				</DialogHeader>
				<div className="databaseDialogBody databaseDialogBodyTight">
					<section className="databaseDialogSection">
						<div className="databaseDialogSectionHeader">
							<div className="databaseDialogSectionTitle">Rows</div>
						</div>
						<div className="databaseDialogField">
							<label className="settingsLabel" htmlFor="databaseSourceKind">
								Source
							</label>
							<select
								id="databaseSourceKind"
								className="databaseNativeSelect"
								value={config.source.kind}
								onChange={(event) =>
									void handleSave({
										kind: event.target
											.value as DatabaseConfig["source"]["kind"],
									})
								}
							>
								<option value="all_notes">All notes</option>
								<option value="folder">Folder</option>
								<option value="tag">Tag</option>
								<option value="search">Search</option>
							</select>
						</div>
						<div className="databaseDialogField">
							<div className="settingsLabel">Value</div>
							{config.source.kind === "all_notes" ? (
								<div className="databaseFilterPassiveHint">
									All indexed notes
								</div>
							) : config.source.kind === "folder" ? (
								<DatabaseFolderPicker
									value={config.source.value}
									label="Database Folder"
									description="Choose a folder for this database."
									placeholder="Choose a folder"
									onChange={(value) => void handleSave({ value })}
								/>
							) : config.source.kind === "tag" ? (
								<DatabaseTagPicker
									value={config.source.value}
									label="Database Tag"
									description="Choose a tag for this database."
									placeholder="Choose a tag"
									onChange={(value) => void handleSave({ value })}
								/>
							) : (
								<Input
									id="databaseSourceValue"
									value={config.source.value}
									placeholder={'tag:projects "roadmap"'}
									onChange={(event) =>
										void handleSave({
											value: event.target.value,
										})
									}
								/>
							)}
						</div>
						{config.source.kind === "folder" ? (
							<div className="databaseDialogField">
								<div className="settingsLabel">Scope</div>
								<Toggle
									slim
									size="sm"
									label="Include subfolders"
									className="databaseDialogToggle databaseToggleInline"
									checked={config.source.recursive}
									onCheckedChange={(checked) =>
										void handleSave({
											recursive: checked,
										})
									}
								/>
							</div>
						) : null}
					</section>

					<section className="databaseDialogSection">
						<div className="databaseDialogSectionHeader databaseDialogSectionHeaderRow">
							<div className="databaseDialogSectionTitle">Filters</div>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() =>
									void updateFilters((filters) => [
										...filters,
										emptyFilter(defaultColumnId),
									])
								}
							>
								Add filter
							</Button>
						</div>
						{filterError ? (
							<div className="databaseDialogInlineError">{filterError}</div>
						) : null}
						<div className="databaseDialogList">
							{config.filters.length > 0 ? (
								config.filters.map((filter, index) => {
									const selectedColumn =
										config.columns.find(
											(column) => column.id === filter.column_id,
										) ?? null;
									const effectiveOperator = normalizedOperator(filter.operator);
									const showsValue = operatorNeedsValue(effectiveOperator);
									const usesTagPicker =
										showsValue &&
										(selectedColumn?.type === "tags" ||
											selectedColumn?.property_kind === "tags");

									return (
										<div
											key={`${filter.column_id}:${index}`}
											className="databaseFilterCard databaseFilterCardCompact"
										>
											<div className="databaseFilterCardFields">
												<select
													id={`databaseFilterColumn-${index}`}
													className="databaseNativeSelect"
													value={filter.column_id}
													aria-label={`Filter ${index + 1} field`}
													onChange={(event) =>
														void updateFilters((filters) =>
															filters.map((entry, currentIndex) =>
																currentIndex === index
																	? {
																			...entry,
																			column_id: event.target.value,
																		}
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
													id={`databaseFilterOperator-${index}`}
													className="databaseNativeSelect"
													value={effectiveOperator}
													aria-label={`Filter ${index + 1} operator`}
													onChange={(event) =>
														void updateFilters((filters) =>
															filters.map((entry, currentIndex) =>
																currentIndex === index
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
												{showsValue ? (
													<div className="databaseFilterValueCell">
														{usesTagPicker ? (
															<DatabaseTagPicker
																value={filter.value_text ?? ""}
																label="Filter Tag"
																description="Choose a tag for this filter."
																placeholder="Choose a tag"
																onChange={(value) =>
																	void updateFilters((filters) =>
																		filters.map((entry, currentIndex) =>
																			currentIndex === index
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
																id={`databaseFilterValue-${index}`}
																value={filter.value_text ?? ""}
																placeholder="Value"
																onChange={(event) =>
																	void updateFilters((filters) =>
																		filters.map((entry, currentIndex) =>
																			currentIndex === index
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
												) : (
													<div className="databaseFilterPassiveHint">
														No value
													</div>
												)}
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="databaseFilterRemoveButton"
													onClick={() =>
														void updateFilters((filters) =>
															filters.filter(
																(_, currentIndex) => currentIndex !== index,
															),
														)
													}
												>
													Remove
												</Button>
											</div>
										</div>
									);
								})
							) : (
								<div className="databaseDialogEmptyState">No filters</div>
							)}
						</div>
					</section>

					<section className="databaseDialogSection">
						<div className="databaseDialogSectionHeader">
							<div className="databaseDialogSectionTitle">New rows</div>
						</div>
						<div className="databaseDialogField">
							<div className="settingsLabel">Target folder</div>
							<DatabaseFolderPicker
								value={config.new_note.folder}
								label="New Row Folder"
								description="Choose where new notes should be stored."
								placeholder="Choose a folder"
								onChange={(value) => void handleNewNoteFolder(value)}
							/>
						</div>
						<div className="databaseDialogField">
							<label className="settingsLabel" htmlFor="databaseTitlePrefix">
								Title prefix
							</label>
							<Input
								id="databaseTitlePrefix"
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
					</section>
				</div>
			</DialogContent>
		</Dialog>
	);
}
