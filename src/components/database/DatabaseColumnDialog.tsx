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

function isReservedPropertyKey(key: string): boolean {
	return RESERVED_PROPERTY_KEYS.has(key.trim().toLowerCase());
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
	const propertyColumnsByKey = useMemo(() => {
		const entries = new Map<string, DatabaseColumn>();
		for (const column of config.columns) {
			if (column.type !== "property" || !column.property_key) continue;
			entries.set(column.property_key.trim().toLowerCase(), column);
		}
		return entries;
	}, [config.columns]);

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

	const propertyEntries = useMemo<ColumnMenuEntry[]>(() => {
		const entriesById = new Map<string, ColumnMenuEntry>();
		for (const property of availableProperties) {
			if (isReservedPropertyKey(property.key)) continue;
			const trimmedKey = property.key.trim();
			const propertyKey = trimmedKey.toLowerCase();
			const normalizedId = `property:${propertyKey}`;
			if (entriesById.has(normalizedId)) continue;
			const id = `property:${trimmedKey}`;
			const existing =
				columnsById.get(normalizedId) ??
				columnsById.get(id) ??
				propertyColumnsByKey.get(propertyKey);
			entriesById.set(normalizedId, {
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
				entriesById.has(normalizedId)
			) {
				continue;
			}
			entriesById.set(normalizedId, {
				key: normalizedId,
				column,
				enabled: column.visible,
			});
		}
		return [...entriesById.values()];
	}, [availableProperties, columnsById, config.columns, propertyColumnsByKey]);

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
