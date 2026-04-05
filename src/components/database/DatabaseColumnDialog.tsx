import { useMemo } from "react";
import { defaultDatabaseColumnIconName } from "../../lib/database/columnIcons";
import { createPropertyColumn } from "../../lib/database/config";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabasePropertyOption,
} from "../../lib/database/types";
import { Toggle } from "../base/toggle/toggle";
import { DropdownMenuContent } from "../ui/shadcn/dropdown-menu";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";

interface DatabaseColumnDropdownProps {
	config: DatabaseConfig;
	availableProperties: DatabasePropertyOption[];
	onChangeConfig: (config: DatabaseConfig) => Promise<void>;
}

interface ColumnMenuEntry {
	key: string;
	column: DatabaseColumn;
	enabled: boolean;
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
		if (!enabled) return;
		await updateColumns((columns) => [
			...columns,
			{ ...column, visible: true },
		]);
	};

	const builtInEntries = useMemo<ColumnMenuEntry[]>(
		() =>
			builtInColumns.map((column) => {
				const existing = columnsById.get(column.id);
				return {
					key: column.id,
					column: existing ?? column,
					enabled: existing?.visible ?? false,
				};
			}),
		[columnsById],
	);

	const propertyEntries = useMemo<ColumnMenuEntry[]>(
		() =>
			availableProperties.map((property) => {
				const id = `property:${property.key}`;
				const existing = columnsById.get(id);
				return {
					key: id,
					column: existing ?? createPropertyColumn(property),
					enabled: existing?.visible ?? false,
				};
			}),
		[availableProperties, columnsById],
	);

	const menuEntries = useMemo(
		() => [...builtInEntries, ...propertyEntries],
		[builtInEntries, propertyEntries],
	);

	return (
		<DropdownMenuContent
			className="databasePickerMenu databaseColumnMenu w-56 max-h-80 overflow-y-auto"
			align="end"
			onCloseAutoFocus={(e) => e.preventDefault()}
		>
			<div className="databaseColumnDropdownList" role="presentation">
				{menuEntries.map((entry) => (
					<div key={entry.key} className="databaseColumnDropdownRow">
						<button
							type="button"
							className="databaseColumnDropdownButton"
							onClick={() =>
								void setColumnEnabled(entry.column, !entry.enabled)
							}
						>
							<span className="databaseColumnDropdownMain">
								<DatabaseColumnIcon column={entry.column} />
								<span className="databaseColumnDropdownLabel">
									{entry.column.label}
								</span>
							</span>
						</button>
						<span className="databaseColumnDropdownToggle">
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
		</DropdownMenuContent>
	);
}
