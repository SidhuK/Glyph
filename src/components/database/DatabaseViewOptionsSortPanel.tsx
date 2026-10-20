import { isBooleanColumn, isDateColumn, isNumberColumn } from "../../lib/database/columns";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabasePropertyOption,
	DatabaseSort,
} from "../../lib/database/types";
import { Plus } from "../Icons";
import { Select } from "../ui/shadcn/select";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import { type DatabaseSortPreset, databaseSortPresets } from "./databaseViewPresets";

interface SortPanelProps {
	config: DatabaseConfig;
	columns: DatabaseColumn[];
	availableProperties: DatabasePropertyOption[];
	activeSort: DatabaseSort | null;
	sortColumn: DatabaseColumn | null;
	sortDirection: "asc" | "desc";
	setSort: (patch: Partial<DatabaseSort>) => void;
	onApplySortPreset: (preset: DatabaseSortPreset) => void;
	updateConfig: (config: DatabaseConfig) => Promise<boolean>;
}

const SORT_DIRECTIONS = ["asc", "desc"] as const;

function directionLabel(column: DatabaseColumn | null, direction: "asc" | "desc") {
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
	columns,
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
									(activeSort ? `Replace current sort with ${preset.label}` : preset.label)
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
						<DatabaseColumnIcon column={sortColumn ?? undefined} size="var(--icon-lg)" />
						<Select
							value={activeSort.column_id}
							aria-label="Sort field"
							options={columns.map((column) => ({ value: column.id, label: column.label }))}
							onValueChange={(columnId) => setSort({ column_id: columnId })}
						/>
					</span>
					<Select
						value={sortDirection}
						aria-label="Sort direction"
						options={SORT_DIRECTIONS.map((direction) => ({
							value: direction,
							label: directionLabel(sortColumn, direction),
						}))}
						onValueChange={(direction) => setSort({ direction })}
					/>
				</div>
			) : (
				<button
					type="button"
					className="databaseViewEmptyAction"
					disabled={!sortColumn}
					onClick={() => setSort({ column_id: sortColumn?.id ?? "title" })}
				>
					<Plus size="var(--icon-md)" aria-hidden="true" />
					Add sort
				</button>
			)}
		</section>
	);
}
