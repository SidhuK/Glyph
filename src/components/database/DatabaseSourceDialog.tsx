import { useState } from "react";
import type { DatabaseConfig, DatabaseFilter } from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { Button } from "../ui/shadcn/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
			<DialogContent className="databaseDialog">
				<DialogHeader>
					<DialogTitle>Source & Filters</DialogTitle>
					<DialogDescription>
						Configure the row source, filters, and note destination.
					</DialogDescription>
				</DialogHeader>
				<div className="databaseDialogBody databaseDialogBodyTight">
					<section className="settingsCard databaseSettingsCard">
						<div className="settingsCardHeader">
							<div>
								<div className="settingsCardTitle">Rows</div>
							</div>
						</div>
						<div className="settingsField">
							<div>
								<label className="settingsLabel" htmlFor="databaseSourceKind">
									Source Type
								</label>
							</div>
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
								<option value="folder">Folder</option>
								<option value="tag">Tag</option>
								<option value="search">Search</option>
							</select>
						</div>
						<div className="settingsField">
							<div>
								<div className="settingsLabel">Source Value</div>
							</div>
							{config.source.kind === "folder" ? (
								<DatabaseFolderPicker
									value={config.source.value}
									label="Database Folder"
									description="Pick the folder whose notes should appear as rows in this database."
									placeholder="Choose a folder"
									onChange={(value) => void handleSave({ value })}
								/>
							) : config.source.kind === "tag" ? (
								<DatabaseTagPicker
									value={config.source.value}
									label="Database Tag"
									description="Choose a tag and this database will stay focused on notes using it."
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
						<div className="settingsField">
							<div>
								<div className="settingsLabel">Folder Scope</div>
							</div>
							<label className="databaseDialogToggle databaseToggleBlock">
								<input
									type="checkbox"
									checked={config.source.recursive}
									disabled={config.source.kind !== "folder"}
									onChange={(event) =>
										void handleSave({
											recursive: event.target.checked,
										})
									}
								/>
								<span>Include subfolders</span>
							</label>
						</div>
					</section>
					<section className="settingsCard databaseSettingsCard">
						<div className="settingsCardHeader">
							<div>
								<div className="settingsCardTitle">Filters</div>
							</div>
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
											className="databaseFilterCard"
										>
											<div className="databaseFilterCardHeader">
												<div>
													<div className="databaseDialogRowTitle">
														Filter {index + 1}
													</div>
												</div>
												<Button
													type="button"
													variant="ghost"
													size="sm"
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
											<div className="settingsField">
												<div>
													<label
														className="settingsLabel"
														htmlFor={`databaseFilterColumn-${index}`}
													>
														Column
													</label>
												</div>
												<select
													id={`databaseFilterColumn-${index}`}
													className="databaseNativeSelect"
													value={filter.column_id}
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
											</div>
											<div className="settingsField">
												<div>
													<label
														className="settingsLabel"
														htmlFor={`databaseFilterOperator-${index}`}
													>
														Operator
													</label>
												</div>
												<select
													id={`databaseFilterOperator-${index}`}
													className="databaseNativeSelect"
													value={effectiveOperator}
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
											</div>
											{showsValue ? (
												<div className="settingsField">
													<div>
														<div className="settingsLabel">Value</div>
													</div>
													{usesTagPicker ? (
														<DatabaseTagPicker
															value={filter.value_text ?? ""}
															label="Filter Tag"
															description="Choose a tag and only rows that carry it will stay visible."
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
															placeholder="roadmap"
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
													No value needed for this operator.
												</div>
											)}
										</div>
									);
								})
							) : (
								<div className="databaseDialogEmptyState">
									No filters yet. Add one to narrow the view.
								</div>
							)}
						</div>
						<div className="databaseDialogActions">
							<Button
								type="button"
								variant="outline"
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
					</section>
					<section className="settingsCard databaseSettingsCard">
						<div className="settingsCardHeader">
							<div>
								<div className="settingsCardTitle">New Rows</div>
							</div>
						</div>
						<div className="settingsField">
							<div>
								<div className="settingsLabel">Target Folder</div>
							</div>
							<DatabaseFolderPicker
								value={config.new_note.folder}
								label="New Row Folder"
								description="Choose where new notes created from this database should be stored."
								placeholder="Choose a folder"
								onChange={(value) => void handleNewNoteFolder(value)}
							/>
						</div>
						<div className="settingsField">
							<div>
								<label className="settingsLabel" htmlFor="databaseTitlePrefix">
									Title Prefix
								</label>
							</div>
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
				<div className="databaseDialogActions">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Close
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
