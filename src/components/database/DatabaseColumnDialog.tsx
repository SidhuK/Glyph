import { useMemo, useState } from "react";
import { defaultDatabaseColumnIconName } from "../../lib/database/columnIcons";
import { createPropertyColumn } from "../../lib/database/config";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabasePropertyOption,
} from "../../lib/database/types";
import { ChevronDown, ChevronUp, Trash2 } from "../Icons";
import { Toggle } from "../base/toggle/toggle";
import { Button } from "../ui/shadcn/button";
import {
	Dialog,
	DialogContent,
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
		id: "folder",
		type: "folder",
		label: "Folder",
		icon: defaultDatabaseColumnIconName({
			type: "folder",
			property_kind: null,
		}),
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
		id: "linked_notes",
		type: "linked_notes",
		label: "Linked Notes",
		icon: defaultDatabaseColumnIconName({
			type: "linked_notes",
			property_kind: null,
		}),
		width: 220,
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

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="databaseDialog databaseDialogCompact"
				onInteractOutside={(event) => {
					const target = event.target as HTMLElement | null;
					if (target?.closest("[data-slot='popover-content']")) {
						event.preventDefault();
					}
				}}
				onPointerDownOutside={(event) => {
					const target = event.target as HTMLElement | null;
					if (target?.closest("[data-slot='popover-content']")) {
						event.preventDefault();
					}
				}}
			>
				<DialogHeader className="databaseDialogHeaderCompact">
					<DialogTitle>Columns</DialogTitle>
				</DialogHeader>
				<div className="databaseDialogBody databaseDialogBodyColumns">
					<section className="databaseDialogSection databaseDialogSectionPrimary">
						<div className="databaseDialogList databaseDialogListColumns">
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
									<Toggle
										slim
										size="sm"
										ariaLabel="Toggle visibility"
										className="databaseDialogToggle"
										checked={column.visible}
										onCheckedChange={(checked) =>
											void updateColumns((columns) =>
												columns.map((entry) =>
													entry.id === column.id
														? {
																...entry,
																visible: checked,
															}
														: entry,
												),
											)
										}
									/>
									<div className="databaseDialogRowActions">
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
						<section className="databaseDialogSection">
							<div className="databaseDialogSectionHeader">
								<div className="databaseDialogSectionTitle">
									Built-in fields
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
						<section className="databaseDialogSection">
							<div className="databaseDialogSectionHeader">
								<div className="databaseDialogSectionTitle">Properties</div>
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
							<div className="databaseManualProperty">
								<Input
									id="databaseManualProperty"
									value={manualKey}
									placeholder="Add property…"
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
						</section>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
