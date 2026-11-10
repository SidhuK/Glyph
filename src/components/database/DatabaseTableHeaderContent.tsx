import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowDown02Icon, ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { databaseColumnLabel } from "../../lib/database/columns";
import type { DatabaseColumn, DatabaseSort } from "../../lib/database/types";
import { StatusRingIcon } from "../status/StatusRingIcon";
import { DatabaseColumnIconPicker } from "./DatabaseColumnIconPicker";
import { isStatusColumn } from "./databaseTableColumns";

interface DatabaseTableHeaderContentProps {
	column: DatabaseColumn;
	activeSort: DatabaseSort | null;
	onToggleSort: (column: DatabaseColumn) => void;
	onChangeColumnIcon: (columnId: string, iconName: string | null) => void;
}

/** Sort reads as an arrow, not a chevron, so it never looks like a disclosure or a dropdown. */
function SortIndicator({
	activeSort,
	columnId,
}: {
	activeSort: DatabaseSort | null;
	columnId: string;
}) {
	if (!activeSort || activeSort.column_id !== columnId) return null;
	return (
		<span className="databaseHeaderSortIcon" aria-hidden="true">
			<HugeiconsIcon
				icon={activeSort.direction === "desc" ? ArrowDown02Icon : ArrowUp02Icon}
				size="var(--icon-sm)"
			/>
		</span>
	);
}

export function DatabaseTableHeaderContent({
	column,
	activeSort,
	onToggleSort,
	onChangeColumnIcon,
}: DatabaseTableHeaderContentProps) {
	const { t } = useTranslation("shell");
	const label = databaseColumnLabel(column);
	if (isStatusColumn(column)) {
		// The status slot has no room for a label: a neutral status glyph names the column.
		const statusName = label.toLowerCase() === "status" ? t("collections.statusLabel") : label;
		return (
			<button
				type="button"
				className="databaseHeaderButton databaseHeaderStatusButton"
				aria-label={statusName}
				title={statusName}
				onClick={() => onToggleSort(column)}
			>
				<StatusRingIcon value="todo" className="databaseHeaderStatusIcon" />
				<SortIndicator activeSort={activeSort} columnId={column.id} />
			</button>
		);
	}
	return (
		<div className="databaseHeaderControls">
			<DatabaseColumnIconPicker
				column={column}
				className="databaseHeaderIconPicker"
				onChange={(iconName) => onChangeColumnIcon(column.id, iconName)}
			/>
			<button type="button" className="databaseHeaderButton" onClick={() => onToggleSort(column)}>
				<span className="databaseHeaderLabel">
					<span className="databaseHeaderText">{label}</span>
					<SortIndicator activeSort={activeSort} columnId={column.id} />
				</span>
			</button>
		</div>
	);
}
