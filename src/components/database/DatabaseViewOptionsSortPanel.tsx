import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { isBooleanColumn, isDateColumn, isNumberColumn } from "../../lib/database/columns";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabasePropertyOption,
	DatabaseSort,
} from "../../lib/database/types";
import { Plus } from "../Icons";
import { Select, SelectIcon } from "../ui/shadcn/select";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import { type DatabaseSortPreset, databaseSortPresets } from "./databaseViewPresets";
import { SORT_DIRECTION_ICONS } from "./sortDirectionIcons";

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

function directionLabel(
	t: TFunction<"shell">,
	column: DatabaseColumn | null,
	direction: "asc" | "desc",
) {
	if (isDateColumn(column)) return t(`collections.sort.directions.date.${direction}`);
	if (isNumberColumn(column)) return t(`collections.sort.directions.number.${direction}`);
	if (isBooleanColumn(column)) return t(`collections.sort.directions.boolean.${direction}`);
	return t(`collections.sort.directions.text.${direction}`);
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
	const { t } = useTranslation("shell");
	const presets = databaseSortPresets(config, availableProperties);
	return (
		<section className="databaseViewOptionsPanel is-sort" aria-label={t("collections.sort.title")}>
			<div className="databaseViewPanelHeader">
				<span>{t("collections.sort.title")}</span>
				{activeSort ? (
					<button
						type="button"
						className="databaseViewPanelReset"
						onClick={() => void updateConfig({ ...config, sorts: [] })}
					>
						{t("collections.viewOptions.reset")}
					</button>
				) : null}
			</div>
			<div className="databaseViewPresetGroup" aria-label={t("collections.sort.presets")}>
				<span className="databaseViewPresetLabel">{t("collections.viewOptions.presets")}</span>
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
										? t("collections.sort.replaceWithPreset", { name: preset.label })
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
						<Select
							value={activeSort.column_id}
							aria-label={t("collections.sort.field")}
							options={columns.map((column) => ({
								value: column.id,
								label: column.label,
								icon: <DatabaseColumnIcon column={column} size="var(--icon-sm)" />,
							}))}
							onValueChange={(columnId) => setSort({ column_id: columnId })}
						/>
					</span>
					<Select
						value={sortDirection}
						aria-label={t("collections.sort.direction")}
						options={SORT_DIRECTIONS.map((direction) => ({
							value: direction,
							label: directionLabel(t, sortColumn, direction),
							icon: <SelectIcon icon={SORT_DIRECTION_ICONS[direction]} />,
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
					{t("collections.sort.add")}
				</button>
			)}
		</section>
	);
}
