import {
	AlarmClockIcon,
	Calendar01Icon,
	Calendar03Icon,
	CalendarRangeIcon,
	CalendarsIcon,
	CheckListIcon,
	CheckmarkSquare02Icon,
	CircleDashedIcon,
	CircleDotIcon,
	EqualSignIcon,
	GreaterThanIcon,
	LessThanIcon,
	NotEqualSignIcon,
	SquareIcon,
	Tag01Icon,
	TextAlignLeftIcon,
	TextAlignRightIcon,
	TextClearIcon,
	TextSelectionIcon,
	UnavailableIcon,
} from "@hugeicons/core-free-icons";
import type { TFunction } from "i18next";
import { isBooleanColumn, isDateColumn, isNumberColumn } from "../../lib/database/columns";
import type { DatabaseColumn, DatabaseFilter } from "../../lib/database/types";
import { SelectIcon, type SelectOption } from "../ui/shadcn/select";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";

type FilterOperator = DatabaseFilter["operator"];

/** Persisted `value_text` for the relative date filter. Values stay English; labels are translated. */
const DATE_RANGES = [
	{ value: "Overdue", key: "overdue", icon: AlarmClockIcon },
	{ value: "Today", key: "today", icon: Calendar01Icon },
	{ value: "This Week", key: "thisWeek", icon: Calendar03Icon },
	{ value: "Last 7 Days", key: "last7Days", icon: CalendarRangeIcon },
	{ value: "Last 30 Days", key: "last30Days", icon: CalendarsIcon },
] as const;

export const DEFAULT_DATE_RANGE = "Last 7 Days";

const OPERATOR_ICONS = {
	equals: EqualSignIcon,
	not_equals: NotEqualSignIcon,
	contains: TextSelectionIcon,
	not_contains: TextClearIcon,
	starts_with: TextAlignLeftIcon,
	ends_with: TextAlignRightIcon,
	greater_than: GreaterThanIcon,
	less_than: LessThanIcon,
	is_empty: CircleDashedIcon,
	is_not_empty: CircleDotIcon,
	is_true: CheckmarkSquare02Icon,
	is_false: SquareIcon,
	tags_contains: Tag01Icon,
	any_of: CheckListIcon,
	none_of: UnavailableIcon,
	within_last_7_days: Calendar03Icon,
} as const satisfies Record<FilterOperator, unknown>;

const SUPPORTED_FILTER_OPERATORS: readonly string[] = Object.keys(OPERATOR_ICONS);

const VALUELESS_OPERATORS: readonly FilterOperator[] = [
	"is_empty",
	"is_not_empty",
	"is_true",
	"is_false",
	"within_last_7_days",
];

export function isSupportedFilterOperator(operator: string): operator is FilterOperator {
	return SUPPORTED_FILTER_OPERATORS.includes(operator);
}

export function isTagFilterColumn(column?: DatabaseColumn | null): boolean {
	return column?.type === "tags" || column?.property_kind === "tags";
}

export function defaultOperatorForColumn(column?: DatabaseColumn | null): FilterOperator {
	if (isTagFilterColumn(column)) return "tags_contains";
	if (isBooleanColumn(column)) return "is_true";
	if (isDateColumn(column)) return "within_last_7_days";
	return "contains";
}

export function operatorNeedsValue(operator: string): boolean {
	if (!isSupportedFilterOperator(operator)) return false;
	return !VALUELESS_OPERATORS.includes(operator);
}

function operatorsForColumn(column: DatabaseColumn | null): FilterOperator[] {
	if (isBooleanColumn(column)) return ["is_true", "is_false", "is_empty", "is_not_empty"];
	if (isDateColumn(column)) return ["within_last_7_days", "equals", "is_empty", "is_not_empty"];
	if (isNumberColumn(column)) {
		return ["equals", "not_equals", "greater_than", "less_than", "is_empty", "is_not_empty"];
	}
	if (isTagFilterColumn(column)) {
		return ["tags_contains", "equals", "not_equals", "any_of", "none_of"];
	}
	return [
		"contains",
		"equals",
		"not_equals",
		"not_contains",
		"starts_with",
		"ends_with",
		"is_empty",
		"is_not_empty",
	];
}

function operatorOption(
	t: TFunction<"shell">,
	operator: FilterOperator,
): SelectOption<FilterOperator> {
	if (!isSupportedFilterOperator(operator)) {
		// Persisted configs can hold operators this build doesn't know; show them disabled.
		return {
			value: operator,
			label: t("collections.filter.operators.unsupported", { operator: String(operator) }),
			disabled: true,
		};
	}
	return {
		value: operator,
		label: t(`collections.filter.operators.${operator}`),
		icon: <SelectIcon icon={OPERATOR_ICONS[operator]} />,
	};
}

export function operatorOptions(
	t: TFunction<"shell">,
	column: DatabaseColumn | null,
	currentOperator: FilterOperator,
): SelectOption<FilterOperator>[] {
	const operators = operatorsForColumn(column);
	const options = operators.map((operator) => operatorOption(t, operator));
	if (operators.includes(currentOperator)) return options;
	const current = operatorOption(t, currentOperator);
	return current.disabled ? [current, ...options] : [...options, current];
}

export function dateRangeOptions(t: TFunction<"shell">): SelectOption<string>[] {
	return DATE_RANGES.map((range) => ({
		value: range.value,
		label: t(`collections.filter.dateRanges.${range.key}`),
		icon: <SelectIcon icon={range.icon} />,
	}));
}

export function columnSelectOptions(columns: readonly DatabaseColumn[]): SelectOption<string>[] {
	return columns.map((column) => ({
		value: column.id,
		label: column.label,
		icon: <DatabaseColumnIcon column={column} size="var(--icon-sm)" />,
	}));
}
