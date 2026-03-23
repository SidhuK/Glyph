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
		<DropdownMenuContent
			className="w-44 max-h-80 overflow-y-auto"
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
							void updateColumns((columns) =>
								columns.filter((entry) => entry.id !== column.id),
							);
						}}
					>
						<DatabaseColumnIcon column={column} strokeWidth={1.5} />
						{column.label}
						<DropdownMenuShortcut className="opacity-0 [[data-highlighted]>&]:opacity-100 transition-opacity">
							<Trash2 />
						</DropdownMenuShortcut>
					</DropdownMenuItem>
				))}
			</DropdownMenuGroup>

			{builtInColumns.filter((c) => !addedColumnIds.has(c.id)).length > 0 && (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuLabel>Add column</DropdownMenuLabel>
					<DropdownMenuGroup>
						{builtInColumns
							.filter((column) => !addedColumnIds.has(column.id))
							.map((column) => (
								<DropdownMenuItem
									key={column.id}
									onSelect={(e) => {
										e.preventDefault();
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

			{availableProperties.filter(
				(p) => !addedColumnIds.has(`property:${p.key}`),
			).length > 0 && (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuLabel>Properties</DropdownMenuLabel>
					<DropdownMenuGroup>
						{availableProperties
							.filter(
								(property) =>
									!addedColumnIds.has(`property:${property.key}`),
							)
							.map((property) => {
								const nextColumn = createPropertyColumn(property);
								return (
									<DropdownMenuItem
										key={property.key}
										onSelect={(e) => {
											e.preventDefault();
											void updateColumns((columns) => [
												...columns,
												nextColumn,
											]);
										}}
									>
										<DatabaseColumnIcon
											column={nextColumn}
											strokeWidth={1.5}
										/>
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
