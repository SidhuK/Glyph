import { useMemo, useState } from "react";
import { defaultDatabaseColumnIconName } from "../../lib/database/columnIcons";
import { createPropertyColumn } from "../../lib/database/config";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabasePropertyOption,
} from "../../lib/database/types";
import { ChevronDown, ChevronUp, Minus, Plus, Trash2 } from "../Icons";
import { Button } from "../ui/shadcn/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "../ui/shadcn/dialog";
import { Input } from "../ui/shadcn/input";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import { DatabaseColumnIconPicker } from "./DatabaseColumnIconPicker";

interface DatabaseColumnDialogProps {
	open: boolean;
	config: DatabaseConfig;
	availableProperties: DatabasePropertyOption[];
	onOpenChange: (open: boolean) => void;
	onChangeConfig: (config: DatabaseConfig) => Promise<void>;
}

const builtInColumns: DatabaseColumn[] = [
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
		id: "path",
		type: "path",
		label: "Path",
		icon: defaultDatabaseColumnIconName({ type: "path", property_kind: null }),
		width: 260,
		visible: true,
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

const MIN_COLUMN_WIDTH = 120;
const MAX_COLUMN_WIDTH = 520;
const COLUMN_WIDTH_STEP = 40;

export function DatabaseColumnDialog({
	open,
	config,
	availableProperties,
	onOpenChange,
	onChangeConfig,
}: DatabaseColumnDialogProps) {
	const [manualKey, setManualKey] = useState("");
	const [manualKind, setManualKind] = useState("text");
	const addedColumnIds = useMemo(
		() => new Set(config.columns.map((column) => column.id)),
		[config.columns],
	);

	const updateColumns = async (
		updater: (columns: DatabaseColumn[]) => DatabaseColumn[],
	) => {
		await onChangeConfig({
			...config,
			columns: updater(config.columns),
		});
	};

	const updateColumnWidth = async (
		columnId: string,
		nextWidth: number | null | undefined,
	) => {
		const width =
			typeof nextWidth === "number"
				? Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, nextWidth))
				: undefined;
		await updateColumns((columns) =>
			columns.map((entry) =>
				entry.id === columnId
					? {
							...entry,
							width,
						}
					: entry,
			),
		);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="databaseDialog">
				<DialogHeader>
					<DialogTitle>Columns</DialogTitle>
					<DialogDescription>
						Show, hide, reorder, and add fields.
					</DialogDescription>
				</DialogHeader>
				<div className="databaseDialogBody databaseDialogBodyColumns">
					<section className="settingsCard databaseSettingsCard">
						<div className="settingsCardHeader">
							<div>
								<div className="settingsCardTitle">Visible Columns</div>
							</div>
						</div>
						<div className="databaseDialogList">
							{config.columns.map((column, index) => (
								<div key={column.id} className="databaseDialogRow">
									<div className="databaseDialogRowLead">
										<DatabaseColumnIconPicker
											column={column}
											onSelectIcon={(icon) =>
												void updateColumns((columns) =>
													columns.map((entry) =>
														entry.id === column.id ? { ...entry, icon } : entry,
													),
												)
											}
										/>
										<div className="databaseDialogRowMeta">
											<div className="databaseDialogRowTitle">
												{column.label}
											</div>
											{column.type === "property" ? (
												<div className="databaseDialogRowSubtitle">
													{`${column.property_key} • ${column.property_kind}`}
												</div>
											) : null}
										</div>
									</div>
									<label className="databaseDialogToggle">
										<input
											type="checkbox"
											checked={column.visible}
											onChange={(event) =>
												void updateColumns((columns) =>
													columns.map((entry) =>
														entry.id === column.id
															? {
																	...entry,
																	visible: event.target.checked,
																}
															: entry,
													),
												)
											}
										/>
										<span>Visible</span>
									</label>
									<div className="databaseDialogRowActions">
										<div className="databaseColumnWidthControl">
											<Button
												type="button"
												variant="ghost"
												size="icon-xs"
												onClick={() =>
													void updateColumnWidth(
														column.id,
														(column.width ?? 180) - COLUMN_WIDTH_STEP,
													)
												}
												title="Decrease column width"
												aria-label="Decrease column width"
											>
												<Minus size={12} />
											</Button>
											<span className="databaseColumnWidthValue">
												{column.width ?? 180}px
											</span>
											<Button
												type="button"
												variant="ghost"
												size="icon-xs"
												onClick={() =>
													void updateColumnWidth(
														column.id,
														(column.width ?? 180) + COLUMN_WIDTH_STEP,
													)
												}
												title="Increase column width"
												aria-label="Increase column width"
											>
												<Plus size={12} />
											</Button>
										</div>
										<Button
											type="button"
											variant="ghost"
											size="icon-xs"
											disabled={index === 0}
											onClick={() =>
												void updateColumns((columns) => {
													const next = [...columns];
													[next[index - 1], next[index]] = [
														next[index],
														next[index - 1],
													];
													return next;
												})
											}
											title="Move up"
											aria-label="Move column up"
										>
											<ChevronUp size={12} />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon-xs"
											disabled={index === config.columns.length - 1}
											onClick={() =>
												void updateColumns((columns) => {
													const next = [...columns];
													[next[index + 1], next[index]] = [
														next[index],
														next[index + 1],
													];
													return next;
												})
											}
											title="Move down"
											aria-label="Move column down"
										>
											<ChevronDown size={12} />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon-xs"
											onClick={() =>
												void updateColumns((columns) =>
													columns.filter((entry) => entry.id !== column.id),
												)
											}
											title="Remove column"
											aria-label="Remove column"
										>
											<Trash2 size={12} />
										</Button>
									</div>
								</div>
							))}
						</div>
					</section>
					<div className="databaseDialogSidebar">
						<section className="settingsCard databaseSettingsCard">
							<div className="settingsCardHeader">
								<div>
									<div className="settingsCardTitle">Add Built-In</div>
								</div>
							</div>
							<div className="databaseDialogChipList">
								{builtInColumns
									.filter((column) => !addedColumnIds.has(column.id))
									.map((column) => (
										<Button
											key={column.id}
											type="button"
											variant="ghost"
											size="xs"
											onClick={() =>
												void updateColumns((columns) => [...columns, column])
											}
										>
											<DatabaseColumnIcon column={column} size={12} />
											{column.label}
										</Button>
									))}
							</div>
						</section>
						<section className="settingsCard databaseSettingsCard">
							<div className="settingsCardHeader">
								<div>
									<div className="settingsCardTitle">Add Property</div>
								</div>
							</div>
							<div className="databaseDialogChipList">
								{availableProperties
									.filter(
										(property) =>
											!addedColumnIds.has(`property:${property.key}`),
									)
									.map((property) => {
										const nextColumn = createPropertyColumn(property);
										return (
											<Button
												key={property.key}
												type="button"
												variant="ghost"
												size="xs"
												onClick={() =>
													void updateColumns((columns) => [
														...columns,
														nextColumn,
													])
												}
											>
												<DatabaseColumnIcon column={nextColumn} size={12} />
												{property.key}
											</Button>
										);
									})}
							</div>
							<div className="settingsField">
								<div>
									<label
										className="settingsLabel"
										htmlFor="databaseManualProperty"
									>
										Manual
									</label>
								</div>
								<div className="databaseManualProperty">
									<Input
										id="databaseManualProperty"
										value={manualKey}
										placeholder="status"
										onChange={(event) => setManualKey(event.target.value)}
									/>
									<select
										className="databaseNativeSelect"
										value={manualKind}
										onChange={(event) => setManualKind(event.target.value)}
									>
										<option value="text">Text</option>
										<option value="url">URL</option>
										<option value="number">Number</option>
										<option value="date">Date</option>
										<option value="datetime">Date/time</option>
										<option value="checkbox">Checkbox</option>
										<option value="list">List</option>
										<option value="tags">Tags</option>
										<option value="yaml">YAML</option>
									</select>
									<Button
										type="button"
										size="xs"
										disabled={!manualKey.trim()}
										onClick={() => {
											const property = manualKey.trim();
											if (!property) return;
											void updateColumns((columns) => {
												const nextId = `property:${property}`;
												if (columns.some((column) => column.id === nextId)) {
													return columns;
												}
												return [
													...columns,
													{
														id: nextId,
														type: "property",
														label: property,
														icon: defaultDatabaseColumnIconName({
															type: "property",
															property_kind: manualKind,
														}),
														width: 180,
														visible: true,
														property_key: property,
														property_kind: manualKind,
													},
												];
											});
											setManualKey("");
										}}
									>
										Add
									</Button>
								</div>
							</div>
						</section>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
