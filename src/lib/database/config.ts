import { parentDir } from "../../utils/path";
import { defaultDatabaseColumnIconName } from "./columnIcons";
import type {
	DatabaseCellValue,
	DatabaseColumn,
	DatabaseFilter,
	DatabasePropertyOption,
	DatabaseRow,
} from "./types";

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
	return true;
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
