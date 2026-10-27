import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { cn } from "@/lib/utils";
import { ArrowUpDownIcon, LayerIcon, UnavailableIcon } from "@hugeicons/core-free-icons";
import type { TFunction } from "i18next";
import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
	databaseColumnLabel,
	isBooleanColumn,
	isDateColumn,
	isNumberColumn,
} from "../../lib/database/columns";
import type { DatabaseColumn, DatabaseSort } from "../../lib/database/types";
import { ChevronDown } from "../Icons";
import { Select, SelectIcon } from "../ui/shadcn/select";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import { columnSelectOptions } from "./databaseFilterOptions";
import { SORT_DIRECTION_ICONS } from "./sortDirectionIcons";

type RowIcon = ComponentProps<typeof HugeiconsIcon>["icon"];

export interface DatabaseGrouping {
	columns: DatabaseColumn[];
	selectedColumn: DatabaseColumn | null;
	/** Boards always group; tables may show a flat list. */
	allowNone: boolean;
	onChange: (groupColumnId: string | null) => void;
}

export function groupColumnOptionLabel(column: DatabaseColumn, t: TFunction<"shell">): string {
	if (
		column.type === "tags" ||
		column.property_kind === "tags" ||
		column.property_kind === "multi_select"
	) {
		return t("collections.groupBy.multiLane", { name: databaseColumnLabel(column) });
	}
	return databaseColumnLabel(column);
}

function directionLabel(
	t: TFunction<"shell">,
	column: DatabaseColumn | null,
	direction: DatabaseSort["direction"],
) {
	if (isDateColumn(column)) return t(`collections.sort.directions.date.${direction}`);
	if (isNumberColumn(column)) return t(`collections.sort.directions.number.${direction}`);
	if (isBooleanColumn(column)) return t(`collections.sort.directions.boolean.${direction}`);
	return t(`collections.sort.directions.text.${direction}`);
}

function OptionRow({
	icon,
	label,
	children,
}: {
	icon: RowIcon;
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="databaseViewOptionsRow">
			<HugeiconsIcon
				icon={icon}
				size="var(--icon-md)"
				className="databaseViewOptionsRowIcon"
				aria-hidden="true"
			/>
			<span className="databaseViewOptionsRowLabel">{label}</span>
			<div className="databaseViewOptionsRowControl">{children}</div>
		</div>
	);
}

export function GroupingRow({ grouping }: { grouping: DatabaseGrouping }) {
	const { t } = useTranslation("shell");
	const label = t("collections.viewOptions.grouping");
	return (
		<OptionRow icon={LayerIcon} label={label}>
			{grouping.columns.length > 0 ? (
				<Select
					className="databaseViewOptionsSelect"
					value={grouping.selectedColumn?.id ?? ""}
					aria-label={label}
					options={[
						...(grouping.allowNone
							? [
									{
										value: "",
										label: t("collections.groupBy.none"),
										icon: <SelectIcon icon={UnavailableIcon} />,
									},
								]
							: []),
						...grouping.columns.map((column) => ({
							value: column.id,
							label: groupColumnOptionLabel(column, t),
							icon: <DatabaseColumnIcon column={column} size="var(--icon-sm)" />,
						})),
					]}
					onValueChange={(columnId) => grouping.onChange(columnId || null)}
				/>
			) : (
				<span className="databaseViewOptionsRowValue" title={t("collections.groupBy.boardHint")}>
					{t("collections.viewOptions.none")}
				</span>
			)}
		</OptionRow>
	);
}

interface OrderingRowProps {
	columns: DatabaseColumn[];
	activeSort: DatabaseSort | null;
	onChange: (sort: DatabaseSort | null) => void;
}

export function OrderingRow({ columns, activeSort, onChange }: OrderingRowProps) {
	const { t } = useTranslation("shell");
	const label = t("collections.viewOptions.ordering");
	const sortColumn = columns.find((column) => column.id === activeSort?.column_id) ?? null;
	const direction = activeSort?.direction ?? "asc";
	const nextDirection = direction === "asc" ? "desc" : "asc";
	return (
		<OptionRow icon={ArrowUpDownIcon} label={label}>
			<Select
				className="databaseViewOptionsSelect"
				value={activeSort?.column_id ?? ""}
				aria-label={t("collections.sort.field")}
				options={[
					{
						value: "",
						label: t("collections.viewOptions.none"),
						icon: <SelectIcon icon={UnavailableIcon} />,
					},
					...columnSelectOptions(columns),
				]}
				onValueChange={(columnId) => onChange(columnId ? { column_id: columnId, direction } : null)}
			/>
			{activeSort ? (
				<button
					type="button"
					className="databaseViewOptionsIconButton"
					aria-label={t("collections.sort.direction")}
					title={directionLabel(t, sortColumn, direction)}
					onClick={() => onChange({ ...activeSort, direction: nextDirection })}
				>
					<HugeiconsIcon
						icon={SORT_DIRECTION_ICONS[direction]}
						size="var(--icon-md)"
						aria-hidden="true"
					/>
				</button>
			) : null}
		</OptionRow>
	);
}

interface DisclosureRowProps {
	icon: RowIcon;
	label: string;
	value: string;
	expanded: boolean;
	onToggle: () => void;
	children: ReactNode;
}

/** A row whose detail opens inline below it, so the Display panel never stacks a second layer. */
export function DisclosureRow({
	icon,
	label,
	value,
	expanded,
	onToggle,
	children,
}: DisclosureRowProps) {
	return (
		<>
			<OptionRow icon={icon} label={label}>
				<button
					type="button"
					className={cn("databaseViewOptionsDisclosure", expanded && "is-expanded")}
					aria-expanded={expanded}
					onClick={onToggle}
				>
					<span className="databaseViewOptionsRowValue">{value}</span>
					<ChevronDown size="var(--icon-sm)" aria-hidden="true" />
				</button>
			</OptionRow>
			{expanded ? <div className="databaseViewOptionsDetail">{children}</div> : null}
		</>
	);
}
