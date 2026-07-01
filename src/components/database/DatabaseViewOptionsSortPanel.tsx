import { useTranslation } from "react-i18next";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabasePropertyOption,
	DatabaseSort,
} from "../../lib/database/types";
import { Plus } from "../Icons";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";
import {
	databaseSortDirectionLabel,
	localizeDatabaseColumnLabel,
} from "./databaseViewI18n";
import {
	type DatabaseSortPreset,
	databaseSortPresets,
} from "./databaseViewPresets";

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
	const { t } = useTranslation("ui");
	const presets = databaseSortPresets(config, availableProperties);
	return (
		<section
			className="databaseViewOptionsPanel is-sort"
			aria-label={t("database.sortBy")}
		>
			<div className="databaseViewPanelHeader">
				<span>{t("database.sortBy")}</span>
				{activeSort ? (
					<button
						type="button"
						className="databaseViewPanelReset"
						onClick={() => void updateConfig({ ...config, sorts: [] })}
					>
						{t("database.reset")}
					</button>
				) : null}
			</div>
			<div
				className="databaseViewPresetGroup"
				aria-label={t("database.sortPresets")}
			>
				<span className="databaseViewPresetLabel">{t("database.presets")}</span>
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
										? t("database.replaceSortWith", { label: preset.label })
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
						<DatabaseColumnIcon
							column={sortColumn ?? undefined}
							size="var(--icon-lg)"
						/>
						<select
							className="databaseViewInlineSelect"
							value={activeSort.column_id}
							aria-label={t("database.sortField")}
							onChange={(event) => setSort({ column_id: event.target.value })}
						>
							{columns.map((column) => (
								<option key={column.id} value={column.id}>
									{localizeDatabaseColumnLabel(column, t)}
								</option>
							))}
						</select>
					</span>
					<select
						className="databaseViewInlineSelect"
						value={sortDirection}
						aria-label={t("database.sortDirection")}
						onChange={(event) =>
							setSort({ direction: event.target.value as "asc" | "desc" })
						}
					>
						<option value="asc">
							{databaseSortDirectionLabel(t, sortColumn, "asc")}
						</option>
						<option value="desc">
							{databaseSortDirectionLabel(t, sortColumn, "desc")}
						</option>
					</select>
				</div>
			) : (
				<button
					type="button"
					className="databaseViewEmptyAction"
					disabled={!sortColumn}
					onClick={() => setSort({ column_id: sortColumn?.id ?? "title" })}
				>
					<Plus size="var(--icon-md)" aria-hidden="true" />
					{t("database.addSort")}
				</button>
			)}
		</section>
	);
}
