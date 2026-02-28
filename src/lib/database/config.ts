import { defaultDatabaseColumnIconName } from "./columnIcons";
import type {
	DatabaseCellValue,
	DatabaseColumn,
	DatabaseConfig,
	DatabaseFilter,
	DatabasePropertyOption,
	DatabaseRow,
} from "./types";

function yamlString(value: string): string {
	return JSON.stringify(value ?? "");
}

function normalizeDir(dirPath: string): string {
	return dirPath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function createDefaultDatabaseConfig(dirPath: string): DatabaseConfig {
	const normalized = normalizeDir(dirPath);
	return {
		source: {
			kind: "folder",
			value: normalized,
			recursive: true,
		},
		new_note: {
			folder: normalized,
			title_prefix: "Untitled",
		},
		view: {
			layout: "table",
			board_group_by: null,
		},
		columns: [
			{
				id: "title",
				type: "title",
				label: "Title",
				icon: defaultDatabaseColumnIconName({
					type: "title",
					property_kind: null,
				}),
				width: 320,
				visible: true,
			},
			{
				id: "tags",
				type: "tags",
				label: "Tags",
				icon: defaultDatabaseColumnIconName({
					type: "tags",
					property_kind: null,
				}),
				width: 220,
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
		],
		sorts: [],
		filters: [],
	};
}

export function createStarterDatabaseMarkdown(
	title: string,
	config: DatabaseConfig,
): string {
	// This starter note YAML is assembled manually on purpose because the inputs
	// here are the app-controlled DatabaseConfig shape (config.columns,
	// config.sorts, config.filters, and config.view), not arbitrary user-authored
	// YAML. If this ever starts accepting more dynamic/untrusted values or more
	// complex scalar types, switch this helper over to a dedicated YAML emitter.
	const columnsYaml = config.columns
		.map((column) => {
			const width =
				typeof column.width === "number"
					? `\n        width: ${column.width}`
					: "";
			const propertyKey = column.property_key
				? `\n        property_key: ${yamlString(column.property_key)}`
				: "";
			const propertyKind = column.property_kind
				? `\n        property_kind: ${yamlString(column.property_kind)}`
				: "";
			const icon = column.icon
				? `\n        icon: ${yamlString(column.icon)}`
				: "";
			return [
				"      -",
				`        id: ${yamlString(column.id)}`,
				`        type: ${column.type}`,
				`        label: ${yamlString(column.label)}`,
				`        visible: ${column.visible ? "true" : "false"}`,
				width,
				icon,
				propertyKey,
				propertyKind,
			]
				.filter(Boolean)
				.join("\n");
		})
		.join("\n");
	const sortsYaml = config.sorts.length
		? config.sorts
				.map(
					(sort) =>
						`      -\n        column_id: ${yamlString(sort.column_id)}\n        direction: ${sort.direction}`,
				)
				.join("\n")
		: " []";
	const filtersYaml = config.filters.length
		? config.filters
				.map((filter) => {
					const parts = [
						"      -",
						`        column_id: ${yamlString(filter.column_id)}`,
						`        operator: ${filter.operator}`,
					];
					if (filter.value_text) {
						parts.push(`        value_text: ${yamlString(filter.value_text)}`);
					}
					if (typeof filter.value_bool === "boolean") {
						parts.push(
							`        value_bool: ${filter.value_bool ? "true" : "false"}`,
						);
					}
					if (filter.value_list.length > 0) {
						parts.push("        value_list:");
						for (const value of filter.value_list) {
							parts.push(`          - ${yamlString(value)}`);
						}
					}
					return parts.join("\n");
				})
				.join("\n")
		: " []";

	return [
		"---",
		`title: ${yamlString(title)}`,
		"glyph:",
		"  kind: database",
		"  version: 1",
		"  database:",
		"    source:",
		`      kind: ${config.source.kind}`,
		`      value: ${yamlString(config.source.value)}`,
		`      recursive: ${config.source.recursive ? "true" : "false"}`,
		"    new_note:",
		`      folder: ${yamlString(config.new_note.folder)}`,
		`      title_prefix: ${yamlString(config.new_note.title_prefix)}`,
		"    view:",
		`      layout: ${config.view.layout}`,
		...(config.view.board_group_by
			? [`      board_group_by: ${yamlString(config.view.board_group_by)}`]
			: []),
		"    columns:",
		columnsYaml,
		`    sorts:${sortsYaml}`,
		`    filters:${filtersYaml}`,
		"---",
		"",
	].join("\n");
}

export function createDatabaseNotePath(
	dirPath: string,
	baseTitle = "New Database",
): string {
	const normalizedDir = normalizeDir(dirPath);
	return normalizedDir ? `${normalizedDir}/${baseTitle}.md` : `${baseTitle}.md`;
}

export function createPropertyColumn(
	property: DatabasePropertyOption,
): DatabaseColumn {
	return {
		id: `property:${property.key}`,
		type: "property",
		label: property.key,
		icon: defaultDatabaseColumnIconName({
			type: "property",
			property_kind: property.kind,
		}),
		width: 180,
		visible: true,
		property_key: property.key,
		property_kind: property.kind,
	};
}

export function isColumnEditable(column: DatabaseColumn): boolean {
	if (
		column.type === "path" ||
		column.type === "created" ||
		column.type === "updated"
	) {
		return false;
	}
	if (column.type !== "property") return true;
	return column.property_kind !== "yaml";
}

export function databaseCellValueFromRow(
	row: DatabaseRow,
	column: DatabaseColumn,
): DatabaseCellValue {
	switch (column.type) {
		case "title":
			return {
				kind: "text",
				value_text: row.title,
				value_list: [],
			};
		case "tags":
			return {
				kind: "tags",
				value_list: row.tags,
			};
		case "path":
			return {
				kind: "text",
				value_text: row.note_path,
				value_list: [],
			};
		case "created":
			return {
				kind: "datetime",
				value_text: row.created,
				value_list: [],
			};
		case "updated":
			return {
				kind: "datetime",
				value_text: row.updated,
				value_list: [],
			};
		case "property":
			return (
				row.properties[column.property_key ?? ""] ?? {
					kind: column.property_kind ?? "text",
					value_text: null,
					value_list: [],
				}
			);
	}
}

export function formatDatabaseDateTime(
	value: string | null | undefined,
): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;

	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");

	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function normalizeText(value: string | null | undefined): string {
	return (value ?? "").trim().toLowerCase();
}

function normalizeTagText(value: string | null | undefined): string {
	return normalizeText(value).replace(/^#+/, "");
}

function cellTextValues(cell: DatabaseCellValue): string[] {
	const values = [
		cell.value_text,
		cell.value_list.length > 0 ? cell.value_list.join(", ") : null,
		typeof cell.value_bool === "boolean" ? String(cell.value_bool) : null,
	];
	return values.map(normalizeText).filter(Boolean);
}

export function rowMatchesFilters(
	row: DatabaseRow,
	columns: DatabaseColumn[],
	filters: DatabaseFilter[],
): boolean {
	return filters.every((filter) => {
		const column = columns.find((entry) => entry.id === filter.column_id);
		if (!column) return true;
		const cell = databaseCellValueFromRow(row, column);
		const filterText = normalizeText(
			filter.value_text ?? filter.value_list[0] ?? "",
		);
		const listValues = cell.value_list.map(normalizeText).filter(Boolean);
		const textValues = cellTextValues(cell);
		switch (filter.operator) {
			case "contains":
				if (!filterText) return true;
				return [...textValues, ...listValues].some((value) =>
					value.includes(filterText),
				);
			case "equals":
				if (!filterText) return true;
				return [...textValues, ...listValues].some(
					(value) => value === filterText,
				);
			case "is_empty":
				return (
					textValues.length === 0 &&
					cell.value_list.length === 0 &&
					cell.value_bool == null
				);
			case "is_not_empty":
				return !(
					textValues.length === 0 &&
					cell.value_list.length === 0 &&
					cell.value_bool == null
				);
			case "is_true":
				return cell.value_bool === true;
			case "is_false":
				return cell.value_bool === false;
			case "tags_contains":
				if (!filterText) return true;
				return cell.value_list.some(
					(value) => normalizeTagText(value) === normalizeTagText(filterText),
				);
			default:
				return true;
		}
	});
}

export function sourceSummary(config: DatabaseConfig): string {
	switch (config.source.kind) {
		case "folder":
			return config.source.value
				? `Folder: ${config.source.value}${config.source.recursive ? " (with subfolders)" : ""}`
				: `Folder: Vault root${config.source.recursive ? " (with subfolders)" : ""}`;
		case "tag":
			return `Tag: ${config.source.value}`;
		case "search":
			return `Search: ${config.source.value}`;
	}
}
