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

function isTagColumn(column: DatabaseColumn): boolean {
	return column.type === "tags" || column.property_kind === "tags";
}

function tagMatchesHierarchy(filterValue: string, cellValue: string): boolean {
	const filterTag = normalizeTagText(filterValue);
	const cellTag = normalizeTagText(cellValue);
	return cellTag === filterTag || cellTag.startsWith(`${filterTag}/`);
}

function parseFilterNumber(value: string): number | null {
	const normalized = value.trim().replace(/[$,%]/g, "");
	if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
		return null;
	}
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : null;
}

function parseFilterDate(value: string | null | undefined): Date | null {
	if (!value) return null;
	const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
	if (dateOnly) {
		const [, year, month, day] = dateOnly;
		return new Date(Number(year), Number(month) - 1, Number(day));
	}
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfToday(): Date {
	const today = new Date();
	return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function weekEndFromToday(today: Date): Date {
	const day = today.getDay();
	const daysUntilSunday = (7 - day) % 7;
	const end = new Date(today);
	end.setDate(today.getDate() + daysUntilSunday);
	return end;
}

function dateMatchesShortcut(
	value: string | null | undefined,
	shortcut: string,
): boolean {
	const parsed = parseFilterDate(value);
	if (!parsed) return false;
	const date = new Date(
		parsed.getFullYear(),
		parsed.getMonth(),
		parsed.getDate(),
	);
	const today = startOfToday();
	const normalized = normalizeText(shortcut);
	switch (normalized) {
		case "today":
			return date.getTime() === today.getTime();
		case "yesterday": {
			const yesterday = new Date(today);
			yesterday.setDate(today.getDate() - 1);
			return date.getTime() === yesterday.getTime();
		}
		case "overdue":
			return date < today;
		case "this week":
			return date >= today && date <= weekEndFromToday(today);
		case "last 7 days": {
			const start = new Date(today);
			start.setDate(today.getDate() - 6);
			return date >= start && date <= today;
		}
		case "last 30 days": {
			const start = new Date(today);
			start.setDate(today.getDate() - 29);
			return date >= start && date <= today;
		}
		default:
			return false;
	}
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
		const values = [...textValues, ...listValues];
		switch (filter.operator) {
			case "contains":
				if (!filterText) return true;
				return values.some((value) => value.includes(filterText));
			case "equals":
				if (!filterText) return true;
				return values.some((value) => value === filterText);
			case "not_equals":
				if (!filterText) return true;
				return values.every((value) => value !== filterText);
			case "not_contains":
				if (!filterText) return true;
				return values.every((value) => !value.includes(filterText));
			case "starts_with":
				if (!filterText) return true;
				return values.some((value) => value.startsWith(filterText));
			case "ends_with":
				if (!filterText) return true;
				return values.some((value) => value.endsWith(filterText));
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
				return cell.value_list.some((value) =>
					tagMatchesHierarchy(filterText, value),
				);
			case "any_of": {
				const filterValues =
					filter.value_list.length > 0
						? filter.value_list
						: filter.value_text
							? [filter.value_text]
							: [];
				if (filterValues.length === 0) return true;
				const normalizedFilters = filterValues.map(normalizeText);
				return values.some((value) =>
					normalizedFilters.some((filterValue) =>
						isTagColumn(column)
							? tagMatchesHierarchy(filterValue, value)
							: value === filterValue,
					),
				);
			}
			case "none_of": {
				const filterValues =
					filter.value_list.length > 0
						? filter.value_list
						: filter.value_text
							? [filter.value_text]
							: [];
				const normalizedFilters = filterValues.map(normalizeText);
				return values.every((value) =>
					normalizedFilters.every((filterValue) =>
						isTagColumn(column)
							? !tagMatchesHierarchy(filterValue, value)
							: value !== filterValue,
					),
				);
			}
			case "within_last_7_days":
				return dateMatchesShortcut(
					cell.value_text,
					filter.value_text ?? "Last 7 Days",
				);
			case "greater_than":
			case "less_than": {
				const filterNumber = parseFilterNumber(filterText);
				if (filterNumber == null) return true;
				return values.some((value) => {
					const cellNumber = parseFilterNumber(value);
					if (cellNumber == null) return false;
					return filter.operator === "greater_than"
						? cellNumber > filterNumber
						: cellNumber < filterNumber;
				});
			}
			default:
				return true;
		}
	});
}
