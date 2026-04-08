import { parentDir } from "../../utils/path";
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
			kind: "all_notes",
			value: normalized,
			recursive: true,
		},
		new_note: {
			folder: normalized,
		},
		view: {
			layout: "table",
			board_group_by: null,
			board_lane_colors: {},
			board_lane_order: {},
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
		"    view:",
		`      layout: ${config.view.layout}`,
		...(config.view.board_group_by
			? [`      board_group_by: ${yamlString(config.view.board_group_by)}`]
			: []),
		...(config.view.board_lane_colors &&
		Object.keys(config.view.board_lane_colors).length > 0
			? [
					"      board_lane_colors:",
					...Object.entries(config.view.board_lane_colors).map(
						([laneId, color]) =>
							`        ${yamlString(laneId)}: ${yamlString(color)}`,
					),
				]
			: []),
		...(config.view.board_lane_order &&
		Object.keys(config.view.board_lane_order).length > 0
			? [
					"      board_lane_order:",
					...Object.entries(config.view.board_lane_order).flatMap(
						([groupColumnId, laneIds]) => [
							`        ${yamlString(groupColumnId)}:`,
							...laneIds.map((laneId) => `          - ${yamlString(laneId)}`),
						],
					),
				]
			: []),
		"    columns:",
		columnsYaml,
		`    sorts:${sortsYaml}`,
		`    filters:${filtersYaml}`,
		"---",
		"",
	].join("\n");
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
		column.type === "folder" ||
		column.type === "created" ||
		column.type === "updated" ||
		column.type === "linked_notes"
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
		case "folder":
			return {
				kind: "text",
				value_text: (row.folder ?? parentDir(row.note_path)) || "/",
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
		case "linked_notes":
			return {
				kind: "relation",
				value_text: null,
				value_list: row.linked_notes ?? [],
			};
	}
}

function ordinalSuffix(day: number): string {
	if (day >= 11 && day <= 13) return "th";
	switch (day % 10) {
		case 1:
			return "st";
		case 2:
			return "nd";
		case 3:
			return "rd";
		default:
			return "th";
	}
}

export function formatDatabaseDateTime(
	value: string | null | undefined,
): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;

	const month = date.toLocaleString("en-US", { month: "long" });
	const day = date.getDate();
	const year = date.getFullYear();
	const time = date
		.toLocaleString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		})
		.toLowerCase()
		.replace(" ", " ");

	return `${month} ${day}${ordinalSuffix(day)}, ${year}, ${time}`;
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
		case "all_notes":
			return "All notes";
		case "folder":
			return config.source.value
				? `Folder: ${config.source.value}${config.source.recursive ? " (with subfolders)" : ""}`
				: `Folder: Space root${config.source.recursive ? " (with subfolders)" : ""}`;
		case "tag":
			return `Tag: ${config.source.value}`;
		case "search":
			return `Search: ${config.source.value}`;
	}
}
