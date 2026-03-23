import { useMemo } from "react";
import { defaultDatabaseColumnIconName } from "../../lib/database/columnIcons";
import { createPropertyColumn } from "../../lib/database/config";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabasePropertyOption,
} from "../../lib/database/types";
import { Trash2 } from "../Icons";
import {
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "../ui/shadcn/dropdown-menu";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";

interface DatabaseColumnDropdownProps {
	config: DatabaseConfig;
	availableProperties: DatabasePropertyOption[];
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

export function DatabaseColumnDropdown({
	config,
	availableProperties,
	onChangeConfig,
}: DatabaseColumnDropdownProps) {
	const columnsById = useMemo(
		() => new Map(config.columns.map((column) => [column.id, column])),
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

	const toggleColumnVisibility = async (columnId: string, visible: boolean) => {
		await updateColumns((columns) =>
			columns.map((column) =>
				column.id === columnId ? { ...column, visible } : column,
			),
		);
	};

	const canAddBuiltInColumn = (column: DatabaseColumn) => {
		const existing = columnsById.get(column.id);
		return !existing || existing.visible === false;
	};

	const canAddPropertyColumn = (property: DatabasePropertyOption) => {
		const existing = columnsById.get(`property:${property.key}`);
		return !existing || existing.visible === false;
	};

	return (
		<DropdownMenuContent
			className="databasePickerMenu w-44 max-h-80 overflow-y-auto"
			align="end"
			onCloseAutoFocus={(e) => e.preventDefault()}
		>
			<DropdownMenuLabel>Columns</DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuGroup>
				{config.columns.map((column) => (
					<DropdownMenuItem
						key={column.id}
						onSelect={(e) => {
							e.preventDefault();
							void toggleColumnVisibility(column.id, column.visible === false);
						}}
						className="databaseColumnDropdownItem"
					>
						<DatabaseColumnIcon column={column} strokeWidth={1.5} />
						{column.label}
						<DropdownMenuShortcut className="databaseColumnDropdownShortcut">
							<button
								type="button"
								className="databaseColumnDropdownDelete"
								aria-label={`Remove ${column.label} column`}
								title={`Remove ${column.label} column`}
								onMouseDown={(event) => {
									event.preventDefault();
									event.stopPropagation();
								}}
								onClick={(event) => {
									event.preventDefault();
									event.stopPropagation();
									void updateColumns((columns) =>
										columns.filter((entry) => entry.id !== column.id),
									);
								}}
							>
								<Trash2 size={12} />
							</button>
						</DropdownMenuShortcut>
					</DropdownMenuItem>
				))}
			</DropdownMenuGroup>

			{builtInColumns.filter(canAddBuiltInColumn).length > 0 && (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuLabel>Add column</DropdownMenuLabel>
					<DropdownMenuGroup>
						{builtInColumns.filter(canAddBuiltInColumn).map((column) => (
							<DropdownMenuItem
								key={column.id}
								onSelect={(e) => {
									e.preventDefault();
									const existing = columnsById.get(column.id);
									if (existing) {
										void toggleColumnVisibility(column.id, true);
										return;
									}
									void updateColumns((columns) => [...columns, column]);
								}}
							>
								<DatabaseColumnIcon column={column} strokeWidth={1.5} />
								{column.label}
							</DropdownMenuItem>
						))}
					</DropdownMenuGroup>
				</>
			)}

			{availableProperties.filter(canAddPropertyColumn).length > 0 && (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuLabel>Properties</DropdownMenuLabel>
					<DropdownMenuGroup>
						{availableProperties
							.filter(canAddPropertyColumn)
							.map((property) => {
								const nextColumn = createPropertyColumn(property);
								return (
									<DropdownMenuItem
										key={property.key}
										onSelect={(e) => {
											e.preventDefault();
											const existing = columnsById.get(
												`property:${property.key}`,
											);
											if (existing) {
												void toggleColumnVisibility(existing.id, true);
												return;
											}
											void updateColumns((columns) => [...columns, nextColumn]);
										}}
									>
										<DatabaseColumnIcon column={nextColumn} strokeWidth={1.5} />
										{property.key}
									</DropdownMenuItem>
								);
							})}
					</DropdownMenuGroup>
				</>
			)}
		</DropdownMenuContent>
	);
}
