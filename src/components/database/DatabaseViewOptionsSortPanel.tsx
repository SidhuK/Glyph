import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabaseSort,
} from "../../lib/database/types";
import { Plus } from "../Icons";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";

interface SortPanelProps {
	config: DatabaseConfig;
	activeSort: DatabaseSort | null;
	sortColumn: DatabaseColumn | null;
	sortDirection: "asc" | "desc";
	setSort: (patch: Partial<DatabaseSort>) => void;
	updateConfig: (config: DatabaseConfig) => Promise<boolean>;
}

function isBooleanColumn(column?: DatabaseColumn | null): boolean {
	return column?.property_kind === "checkbox";
}

function isNumberColumn(column?: DatabaseColumn | null): boolean {
	return column?.property_kind === "number";
}

function isDateColumn(column?: DatabaseColumn | null): boolean {
	return (
		column?.type === "created" ||
		column?.type === "updated" ||
		column?.property_kind === "date" ||
		column?.property_kind === "datetime"
	);
}

function directionLabel(
	column: DatabaseColumn | null,
	direction: "asc" | "desc",
) {
	if (isDateColumn(column)) {
		return direction === "asc" ? "Oldest - Newest" : "Newest - Oldest";
	}
	if (isNumberColumn(column)) {
		return direction === "asc" ? "Lowest - Highest" : "Highest - Lowest";
	}
	if (isBooleanColumn(column)) {
		return direction === "asc" ? "Unchecked first" : "Checked first";
	}
	return direction === "asc" ? "A - Z" : "Z - A";
}

export function SortPanel({
	config,
	activeSort,
	sortColumn,
	sortDirection,
	setSort,
	updateConfig,
}: SortPanelProps) {
	return (
		<section className="databaseViewOptionsPanel is-sort" aria-label="Sort by">
			<div className="databaseViewPanelHeader">
				<span>Sort by</span>
				{activeSort ? (
					<button
						type="button"
						className="databaseViewPanelReset"
						onClick={() => void updateConfig({ ...config, sorts: [] })}
					>
						Reset
					</button>
				) : null}
			</div>
			{activeSort ? (
				<div className="databaseViewSortRow">
					<span className="databaseViewFilterColumn">
						<DatabaseColumnIcon column={sortColumn ?? undefined} size={16} />
						<select
							className="databaseViewInlineSelect"
							value={activeSort.column_id}
							aria-label="Sort field"
							onChange={(event) => setSort({ column_id: event.target.value })}
						>
							{config.columns.map((column) => (
								<option key={column.id} value={column.id}>
									{column.label}
								</option>
							))}
						</select>
					</span>
					<select
						className="databaseViewInlineSelect"
						value={sortDirection}
						aria-label="Sort direction"
						onChange={(event) =>
							setSort({ direction: event.target.value as "asc" | "desc" })
						}
					>
						<option value="asc">{directionLabel(sortColumn, "asc")}</option>
						<option value="desc">{directionLabel(sortColumn, "desc")}</option>
					</select>
				</div>
			) : (
				<button
					type="button"
					className="databaseViewEmptyAction"
					disabled={!sortColumn}
					onClick={() => setSort({ column_id: sortColumn?.id ?? "title" })}
				>
					<Plus size={14} aria-hidden="true" />
					Add sort
				</button>
			)}
		</section>
	);
}
