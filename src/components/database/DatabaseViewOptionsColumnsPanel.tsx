import { cn } from "@/lib/utils";
import type { DatabaseColumn } from "../../lib/database/types";
import { RefreshCw } from "../Icons";
import { Toggle } from "../base/toggle/toggle";

export interface ColumnMenuEntry {
	key: string;
	column: DatabaseColumn;
	enabled: boolean;
}

interface ColumnsPanelProps {
	columnMenuEntries: ColumnMenuEntry[];
	setColumnEnabled: (column: DatabaseColumn, enabled: boolean) => Promise<void>;
	updateColumns: (
		updater: (columns: DatabaseColumn[]) => DatabaseColumn[],
	) => Promise<void>;
	onRestoreDefaultColumns: () => void;
}

export function ColumnsPanel({
	columnMenuEntries,
	setColumnEnabled,
	updateColumns,
	onRestoreDefaultColumns,
}: ColumnsPanelProps) {
	return (
		<section className="databaseViewOptionsPanel" aria-label="Columns">
			<div className="databaseViewPanelHeader">
				<span>Columns</span>
			</div>
			<div className="databaseViewColumnsList">
				{columnMenuEntries.map((entry) => (
					<div
						key={entry.key}
						className={cn(
							"databaseViewColumnRow",
							entry.enabled && "is-enabled",
						)}
					>
						<span className="databaseViewColumnLabel">
							{entry.column.label}
						</span>
						<span className="databaseViewColumnToggle">
							<Toggle
								size="sm"
								checked={entry.enabled}
								ariaLabel={`${entry.enabled ? "Hide" : "Show"} ${entry.column.label} column`}
								onCheckedChange={(checked) =>
									void setColumnEnabled(entry.column, checked)
								}
							/>
						</span>
					</div>
				))}
			</div>
			<div className="databaseViewPanelDivider" />
			<button
				type="button"
				className="databaseViewColumnRow databaseViewColumnUtility"
				onClick={() =>
					void updateColumns((columns) => {
						const existing = new Map(
							columns.map((column) => [column.id, column]),
						);
						const missing = columnMenuEntries
							.map((entry) => entry.column)
							.filter((column) => !existing.has(column.id));
						return [
							...columns.map((column) => ({ ...column, visible: true })),
							...missing.map((column) => ({ ...column, visible: true })),
						];
					})
				}
			>
				<span>Show all columns</span>
			</button>
			<button
				type="button"
				className="databaseViewRestoreButton"
				onClick={onRestoreDefaultColumns}
			>
				<RefreshCw size={16} aria-hidden="true" />
				Restore defaults
			</button>
		</section>
	);
}
