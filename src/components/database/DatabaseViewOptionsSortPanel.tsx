import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabasePropertyOption,
	DatabaseSort,
} from "../../lib/database/types";
import { Plus } from "../Icons";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import {
	type DatabaseSortPreset,
	databaseSortPresets,
} from "./databaseViewPresets";

interface SortPanelProps {
	config: DatabaseConfig;
	availableProperties: DatabasePropertyOption[];
	activeSort: DatabaseSort | null;
	sortColumn: DatabaseColumn | null;
	sortDirection: "asc" | "desc";
	setSort: (patch: Partial<DatabaseSort>) => void;
	onApplySortPreset: (preset: DatabaseSortPreset) => void;
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
	availableProperties,
	activeSort,
	sortColumn,
	sortDirection,
	setSort,
	onApplySortPreset,
	updateConfig,
}: SortPanelProps) {
	const presets = databaseSortPresets(config, availableProperties);
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
			<div className="databaseViewPresetGroup" aria-label="Sort presets">
				<span className="databaseViewPresetLabel">Presets</span>
				<div className="databaseViewPresetChips">
					{presets.map((preset) => {
						const presetSort = preset.sort;
						const applied =
							activeSort != null &&
							presetSort != null &&
							activeSort.column_id === presetSort.column_id &&
							activeSort.direction === presetSort.direction;
						return (
							<button
								key={preset.id}
								type="button"
								className="databaseViewPresetChip"
								disabled={!presetSort || applied}
								data-active={applied ? "true" : "false"}
								title={
									preset.disabledReason ??
									(activeSort
										? `Replace current sort with ${preset.label}`
										: preset.label)
								}
								onClick={() => onApplySortPreset(preset)}
							>
								{preset.label}
							</button>
						);
					})}
				</div>
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
