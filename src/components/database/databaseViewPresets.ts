import { createPropertyColumn } from "../../lib/database/config";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabaseFilter,
	DatabasePropertyOption,
	DatabaseSort,
} from "../../lib/database/types";

interface PresetColumnContext {
	columns: DatabaseColumn[];
	availableProperties: DatabasePropertyOption[];
}

export interface DatabaseFilterPreset {
	id: string;
	label: string;
	filter: DatabaseFilter | null;
	column: DatabaseColumn | null;
	disabledReason: string | null;
}

export interface DatabaseSortPreset {
	id: string;
	label: string;
	sort: DatabaseSort | null;
	column: DatabaseColumn | null;
	disabledReason: string | null;
}

const STATUS_PROPERTY_NAMES = ["status", "state", "stage"];
const DUE_DATE_PROPERTY_NAMES = ["due date", "due", "deadline"];
const PRIORITY_PROPERTY_NAMES = ["priority", "prio"];
const OWNER_PROPERTY_NAMES = ["owner", "owners", "assignee", "assignees"];
const BLOCKED_PROPERTY_NAMES = ["blocked tasks", "blocked", "blockers"];
const PROJECT_STATUS_PROPERTY_NAMES = [
	"project status",
	...STATUS_PROPERTY_NAMES,
];

function normalizePresetKey(value: string | null | undefined): string {
	return (value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ");
}

function hiddenPropertyColumn(
	property: DatabasePropertyOption,
): DatabaseColumn {
	return {
		...createPropertyColumn({ ...property, key: property.key.trim() }),
		visible: false,
	};
}

function columnMatchesName(column: DatabaseColumn, names: string[]): boolean {
	const normalizedNames = new Set(names.map(normalizePresetKey));
	return [column.property_key, column.label, column.id]
		.map(normalizePresetKey)
		.some((value) => normalizedNames.has(value));
}

function propertyMatchesName(
	property: DatabasePropertyOption,
	names: string[],
): boolean {
	const normalizedNames = new Set(names.map(normalizePresetKey));
	return normalizedNames.has(normalizePresetKey(property.key));
}

function findPropertyColumn(
	context: PresetColumnContext,
	names: string[],
	kinds?: string[],
): DatabaseColumn | null {
	const matchesKind = (kind: string | null | undefined) =>
		!kinds || kinds.includes(kind ?? "");
	const existing =
		context.columns.find(
			(column) =>
				column.type === "property" &&
				columnMatchesName(column, names) &&
				matchesKind(column.property_kind),
		) ??
		context.columns.find(
			(column) =>
				column.type === "property" &&
				columnMatchesName(column, names) &&
				column.property_kind === "status",
		);
	if (existing) return existing;

	const property =
		context.availableProperties.find(
			(option) =>
				propertyMatchesName(option, names) && matchesKind(option.kind),
		) ??
		context.availableProperties.find(
			(option) =>
				propertyMatchesName(option, names) && option.kind === "status",
		);
	return property ? hiddenPropertyColumn(property) : null;
}

function statusColumn(context: PresetColumnContext): DatabaseColumn | null {
	return (
		context.columns.find(
			(column) =>
				column.type === "property" && column.property_kind === "status",
		) ??
		findPropertyColumn(context, STATUS_PROPERTY_NAMES, ["status", "text"]) ??
		null
	);
}

function dueDateColumn(context: PresetColumnContext): DatabaseColumn | null {
	return findPropertyColumn(context, DUE_DATE_PROPERTY_NAMES, [
		"date",
		"datetime",
		"text",
	]);
}

function priorityColumn(context: PresetColumnContext): DatabaseColumn | null {
	return findPropertyColumn(context, PRIORITY_PROPERTY_NAMES);
}

function ownerColumn(context: PresetColumnContext): DatabaseColumn | null {
	return findPropertyColumn(context, OWNER_PROPERTY_NAMES);
}

function blockedTasksColumn(
	context: PresetColumnContext,
): DatabaseColumn | null {
	return findPropertyColumn(context, BLOCKED_PROPERTY_NAMES);
}

function projectStatusColumn(
	context: PresetColumnContext,
): DatabaseColumn | null {
	return (
		findPropertyColumn(context, PROJECT_STATUS_PROPERTY_NAMES, [
			"status",
			"text",
		]) ?? statusColumn(context)
	);
}

function textFilter(
	column: DatabaseColumn,
	operator: DatabaseFilter["operator"],
	value: string,
): DatabaseFilter {
	return {
		column_id: column.id,
		operator,
		value_text: value,
		value_list: [value],
	};
}

function dateShortcutFilter(
	column: DatabaseColumn,
	value: string,
): DatabaseFilter {
	return {
		column_id: column.id,
		operator: "within_last_7_days",
		value_text: value,
		value_list: [],
	};
}

function highPriorityValue(column: DatabaseColumn): string {
	return column.property_kind === "number" ? "1" : "High";
}

function ownerOperator(column: DatabaseColumn): DatabaseFilter["operator"] {
	if (column.property_kind === "tags") return "tags_contains";
	if (column.property_kind === "multi_select") return "any_of";
	return "equals";
}

function blockedTasksFilter(column: DatabaseColumn): DatabaseFilter {
	if (column.property_kind === "checkbox") {
		return {
			column_id: column.id,
			operator: "is_true",
			value_list: [],
		};
	}
	if (column.property_kind === "number") {
		return textFilter(column, "greater_than", "0");
	}
	return textFilter(column, "contains", "Blocked");
}

function filterPreset(
	id: string,
	label: string,
	column: DatabaseColumn | null,
	buildFilter: (column: DatabaseColumn) => DatabaseFilter,
	disabledReason: string,
): DatabaseFilterPreset {
	return {
		id,
		label,
		column,
		filter: column ? buildFilter(column) : null,
		disabledReason: column ? null : disabledReason,
	};
}

export function databaseFilterPresets(
	config: DatabaseConfig,
	availableProperties: DatabasePropertyOption[],
): DatabaseFilterPreset[] {
	const context = { columns: config.columns, availableProperties };
	return [
		filterPreset(
			"status-not-done",
			"Status is not Done",
			statusColumn(context),
			(column) => textFilter(column, "not_equals", "Done"),
			"Add a Status property to use this preset.",
		),
		filterPreset(
			"due-overdue",
			"Due date is overdue",
			dueDateColumn(context),
			(column) => dateShortcutFilter(column, "Overdue"),
			"Add a Due date property to use this preset.",
		),
		filterPreset(
			"due-this-week",
			"Due date is this week",
			dueDateColumn(context),
			(column) => dateShortcutFilter(column, "This Week"),
			"Add a Due date property to use this preset.",
		),
		filterPreset(
			"priority-high",
			"Priority is High",
			priorityColumn(context),
			(column) => textFilter(column, "equals", highPriorityValue(column)),
			"Add a Priority property to use this preset.",
		),
		filterPreset(
			"owner-me",
			'Owner is "me"',
			ownerColumn(context),
			(column) => textFilter(column, ownerOperator(column), "me"),
			"Add an Owner property to use this preset.",
		),
		filterPreset(
			"has-blocked-tasks",
			"Has blocked tasks",
			blockedTasksColumn(context),
			blockedTasksFilter,
			"Add a Blocked tasks property to use this preset.",
		),
		filterPreset(
			"project-active",
			"Project is active",
			projectStatusColumn(context),
			(column) => textFilter(column, "equals", "Active"),
			"Add a Status property to use this preset.",
		),
	];
}

function sortPreset(
	id: string,
	label: string,
	column: DatabaseColumn | null,
	direction: DatabaseSort["direction"],
	disabledReason: string,
): DatabaseSortPreset {
	return {
		id,
		label,
		column,
		sort: column ? { column_id: column.id, direction } : null,
		disabledReason: column ? null : disabledReason,
	};
}

export function databaseSortPresets(
	config: DatabaseConfig,
	availableProperties: DatabasePropertyOption[],
): DatabaseSortPreset[] {
	const context = { columns: config.columns, availableProperties };
	const updatedColumn =
		config.columns.find((column) => column.id === "updated") ?? null;
	return [
		sortPreset(
			"updated-newest",
			"Recently updated",
			updatedColumn,
			"desc",
			"Updated column is unavailable.",
		),
		sortPreset(
			"due-soon",
			"Due date soon",
			dueDateColumn(context),
			"asc",
			"Add a Due date property to use this sort.",
		),
		sortPreset(
			"priority-high",
			"Priority high first",
			priorityColumn(context),
			"asc",
			"Add a Priority property to use this sort.",
		),
		sortPreset(
			"status",
			"Status",
			statusColumn(context),
			"asc",
			"Add a Status property to use this sort.",
		),
		sortPreset(
			"owner",
			"Owner",
			ownerColumn(context),
			"asc",
			"Add an Owner property to use this sort.",
		),
		sortPreset(
			"project",
			"Project",
			findPropertyColumn(context, ["project", "projects"]),
			"asc",
			"Add a Project property to use this sort.",
		),
	];
}

export function ensurePresetColumn(
	columns: DatabaseColumn[],
	column: DatabaseColumn,
): DatabaseColumn[] {
	if (columns.some((entry) => entry.id === column.id)) return columns;
	return [...columns, column];
}
