import {
	FilterMailIcon,
	SlidersVerticalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabasePropertyOption,
} from "../../lib/database/types";
import { RefreshCw } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { DropdownMenu, DropdownMenuTrigger } from "../ui/shadcn/dropdown-menu";
import { DatabaseColumnDropdown } from "./DatabaseColumnDialog";
import { DatabaseSourceDropdown } from "./DatabaseSourceDialog";

interface DatabaseToolbarProps {
	databaseView: "table" | "board" | "list";
	groupColumns: DatabaseColumn[];
	groupColumnId: string | null;
	config: DatabaseConfig;
	availableProperties: DatabasePropertyOption[];
	onGroupColumnIdChange: (groupColumnId: string | null) => void;
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
	onReload,
	onChangeConfig,
	columnsMenuOpen,
	onColumnsMenuOpenChange,
	className,
}: DatabaseToolbarProps) {
	return (
		<div className={["databaseToolbar", className].filter(Boolean).join(" ")}>
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
							<HugeiconsIcon
								icon={FilterMailIcon}
								size={13}
								strokeWidth={0.9}
							/>
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
							<HugeiconsIcon
								icon={SlidersVerticalIcon}
								size={13}
								strokeWidth={0.9}
							/>
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
			</div>
		</div>
	);
}
