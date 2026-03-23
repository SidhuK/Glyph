import {
	FilterMailIcon,
	PencilEdit02Icon,
	SlidersVerticalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabasePropertyOption,
} from "../../lib/database/types";
import { Kanban, RefreshCw, Table } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { DropdownMenu, DropdownMenuTrigger } from "../ui/shadcn/dropdown-menu";
import { DatabaseColumnDropdown } from "./DatabaseColumnDialog";
import { DatabaseSourceDropdown } from "./DatabaseSourceDialog";

interface DatabaseToolbarProps {
	databaseView: "table" | "board";
	groupColumns: DatabaseColumn[];
	groupColumnId: string | null;
	config: DatabaseConfig;
	availableProperties: DatabasePropertyOption[];
	onGroupColumnIdChange: (groupColumnId: string | null) => void;
	onDatabaseViewChange: (view: "table" | "board") => void;
	onAddRow: () => void;
	onReload: () => void;
	onChangeConfig: (config: DatabaseConfig) => Promise<void>;
	columnsMenuOpen?: boolean;
	onColumnsMenuOpenChange?: (open: boolean) => void;
	className?: string;
}

export function DatabaseToolbar({
	databaseView,
	groupColumns,
	groupColumnId,
	config,
	availableProperties,
	onGroupColumnIdChange,
	onDatabaseViewChange,
	onAddRow,
	onReload,
	onChangeConfig,
	columnsMenuOpen,
	onColumnsMenuOpenChange,
	className,
}: DatabaseToolbarProps) {
	return (
		<div className={["databaseToolbar", className].filter(Boolean).join(" ")}>
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
				<span className="databaseToolbarDivider" />
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
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="databaseToolbarChip"
							title="Source & Filters"
							aria-label="Source & Filters"
						>
							<HugeiconsIcon icon={FilterMailIcon} size={13} />
						</Button>
					</DropdownMenuTrigger>
					<DatabaseSourceDropdown
						config={config}
						onChangeConfig={onChangeConfig}
					/>
				</DropdownMenu>
				<DropdownMenu
					open={columnsMenuOpen}
					onOpenChange={onColumnsMenuOpenChange}
				>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="databaseToolbarChip"
							title="Columns"
							aria-label="Columns"
						>
							<HugeiconsIcon icon={SlidersVerticalIcon} size={13} />
						</Button>
					</DropdownMenuTrigger>
					<DatabaseColumnDropdown
						config={config}
						availableProperties={availableProperties}
						onChangeConfig={onChangeConfig}
					/>
				</DropdownMenu>
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
					className="databaseToolbarChip is-accent"
					onClick={onAddRow}
					title="New note"
					aria-label="New note"
				>
					<HugeiconsIcon icon={PencilEdit02Icon} size={14} />
				</Button>
			</div>
		</div>
	);
}
