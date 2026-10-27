import { parentDir } from "../../utils/path";
import {
	DEFAULT_DATE_DISPLAY_FORMAT,
	type DateDisplayFormat,
	formatDatabaseClockTime,
	formatDisplayDate,
	parseDisplayDateInput,
} from "../dateDisplayFormat";
import { defaultDatabaseColumnIconName } from "./columnIcons";
import type {
	DatabaseCellValue,
	DatabaseColumn,
	DatabasePropertyOption,
	DatabaseRow,
} from "./types";

export function createPropertyColumn(property: DatabasePropertyOption): DatabaseColumn {
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
		column.type === "updated"
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

export function formatDatabaseDateTime(
	value: string | null | undefined,
	format: DateDisplayFormat = DEFAULT_DATE_DISPLAY_FORMAT,
): string {
	if (!value) return "";
	const date = parseDisplayDateInput(value);
	if (!date) return value;
	return formatDisplayDate(date, format, {
		time: formatDatabaseClockTime(date),
	});
}

/** Dense table cells and board cards: "Oct 17", with the year only outside the current one.
    The full date (in the user's date format) belongs in the tooltip. */
export function formatCompactDatabaseDate(
	value: string | null | undefined,
	locale: string,
	now: Date = new Date(),
): string {
	if (!value) return "";
	const date = parseDisplayDateInput(value);
	if (!date) return value;
	return date.toLocaleDateString(locale, {
		month: "short",
		day: "numeric",
		...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
	});
}
