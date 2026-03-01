import { EditTableIcon, FilterEditIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { DatabaseColumn } from "../../lib/database/types";
import { Kanban, Plus, RefreshCw, Table } from "../Icons";
import { Button } from "../ui/shadcn/button";

interface DatabaseToolbarProps {
	databaseView: "table" | "board";
	groupColumns: DatabaseColumn[];
	groupColumnId: string | null;
	onGroupColumnIdChange: (groupColumnId: string | null) => void;
	onDatabaseViewChange: (view: "table" | "board") => void;
	onAddRow: () => void;
	onReload: () => void;
	onOpenSource: () => void;
	onOpenColumns: () => void;
}

export function DatabaseToolbar({
	databaseView,
	groupColumns,
	groupColumnId,
	onGroupColumnIdChange,
	onDatabaseViewChange,
	onAddRow,
	onReload,
	onOpenSource,
	onOpenColumns,
}: DatabaseToolbarProps) {
	return (
		<div className="databaseToolbar">
			<div className="databaseToolbarPrimary">
				<div
					className="databaseModeSwitch"
					role="tablist"
					aria-label="Database view"
				>
					<Button
						type="button"
						variant={databaseView === "table" ? "outline" : "ghost"}
						size="icon-sm"
						className={[
							"databaseToolbarChip",
							databaseView === "table" ? "is-active" : "",
						]
							.filter(Boolean)
							.join(" ")}
						onClick={() => onDatabaseViewChange("table")}
						title="Table view"
						aria-label="Table view"
					>
						<Table size={14} />
					</Button>
					<Button
						type="button"
						variant={databaseView === "board" ? "outline" : "ghost"}
						size="icon-sm"
						className={[
							"databaseToolbarChip",
							databaseView === "board" ? "is-active" : "",
						]
							.filter(Boolean)
							.join(" ")}
						onClick={() => onDatabaseViewChange("board")}
						title="Board view"
						aria-label="Board view"
					>
						<Kanban size={14} />
					</Button>
				</div>
			</div>
			<div className="databaseToolbarActions">
				{databaseView === "board" && groupColumns.length > 0 ? (
					<label className="databaseToolbarGroupBy">
						<span className="databaseToolbarGroupByLabel">Group by</span>
						<select
							className="databaseToolbarGroupBySelect"
							value={groupColumnId ?? ""}
							onChange={(event) =>
								onGroupColumnIdChange(event.target.value || null)
							}
						>
							{groupColumns.map((column) => (
								<option key={column.id} value={column.id}>
									{column.label}
								</option>
							))}
						</select>
					</label>
				) : null}
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="databaseToolbarChip"
					onClick={onReload}
					title="Reload"
					aria-label="Reload"
				>
					<RefreshCw size={14} />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="databaseToolbarChip"
					onClick={onOpenSource}
					title="Source & Filters"
					aria-label="Source & Filters"
				>
					<HugeiconsIcon icon={FilterEditIcon} size={14} />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="databaseToolbarChip"
					onClick={onOpenColumns}
					title="Columns"
					aria-label="Columns"
				>
					<HugeiconsIcon icon={EditTableIcon} size={14} />
				</Button>
				<Button
					type="button"
					size="icon-sm"
					className="databaseToolbarChip is-accent"
					onClick={onAddRow}
					title="New row"
					aria-label="New row"
				>
					<Plus size={14} />
				</Button>
			</div>
		</div>
	);
}
