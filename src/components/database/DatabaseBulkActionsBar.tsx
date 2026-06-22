import type { BulkEligibleColumns } from "../../lib/database/bulkActions";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import { priorityOptionsWithCustomValues } from "../../lib/priorityProperties";
import { statusOptionsWithCustomValues } from "../../lib/statusProperties";
import { X } from "../Icons";
import type { EditorTextColor } from "../editor/textColors";
import { PriorityPropertyPill } from "../status/PriorityPropertyPill";
import { StatusPropertyPill } from "../status/StatusPropertyPill";
import { Button } from "../ui/shadcn/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { DatabaseBulkTagMenus } from "./DatabaseBulkTagMenus";

interface DatabaseBulkActionsBarProps {
	selectedCount: number;
	selectedRowPaths: string[];
	rows: DatabaseRow[];
	bulkEligible: BulkEligibleColumns;
	statusColors: Record<string, EditorTextColor>;
	isApplying: boolean;
	onClearSelection: () => void;
	onSetStatus: (status: string) => void;
	onSetPriority: (priority: string) => void;
	onSetCheckbox: (column: DatabaseColumn, checked: boolean) => void;
	onAddTags: (column: DatabaseColumn, tags: string[]) => void;
	onRemoveTags: (column: DatabaseColumn, tags: string[]) => void;
}

export function DatabaseBulkActionsBar({
	selectedCount,
	selectedRowPaths,
	rows,
	bulkEligible,
	statusColors,
	isApplying,
	onClearSelection,
	onSetStatus,
	onSetPriority,
	onSetCheckbox,
	onAddTags,
	onRemoveTags,
}: DatabaseBulkActionsBarProps) {
	if (selectedCount === 0) return null;

	const statusOptions = statusOptionsWithCustomValues([]);
	const priorityOptions = priorityOptionsWithCustomValues([]);
	const hasCheckboxActions = bulkEligible.checkboxColumns.length > 0;
	const hasTagActions = bulkEligible.tagsColumns.length > 0;
	const hasAnyAction =
		bulkEligible.statusColumn != null ||
		bulkEligible.priorityColumn != null ||
		hasCheckboxActions ||
		hasTagActions;

	return (
		<div className="databaseBulkActionsBar" aria-live="polite">
			<div className="databaseBulkActionsSummary">
				<span className="databaseBulkActionsCount">
					{selectedCount} selected
				</span>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					className="databaseBulkActionsClear"
					onClick={onClearSelection}
					disabled={isApplying}
				>
					<X size="var(--icon-sm)" />
					Clear
				</Button>
			</div>
			{hasAnyAction ? (
				<div className="databaseBulkActionsButtons">
					{bulkEligible.statusColumn ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="databaseBulkActionsButton"
									disabled={isApplying}
								>
									Set status
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="start"
								className="databasePickerMenu notePropertyStatusMenu"
							>
								<div className="notePropertyStatusOptions">
									{statusOptions.map((option) => (
										<DropdownMenuItem
											key={option.id}
											className="notePropertyStatusOption"
											onSelect={() => onSetStatus(option.label)}
										>
											<StatusPropertyPill
												value={option.label}
												colors={statusColors}
											/>
										</DropdownMenuItem>
									))}
								</div>
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
					{bulkEligible.priorityColumn ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="databaseBulkActionsButton"
									disabled={isApplying}
								>
									Set priority
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="start"
								className="databasePickerMenu notePropertyStatusMenu"
							>
								<div className="notePropertyStatusOptions">
									{priorityOptions.map((option) => (
										<DropdownMenuItem
											key={option.id}
											className="notePropertyStatusOption"
											onSelect={() => onSetPriority(option.label)}
										>
											<PriorityPropertyPill value={option.label} />
										</DropdownMenuItem>
									))}
								</div>
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
					{hasCheckboxActions ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="databaseBulkActionsButton"
									disabled={isApplying}
								>
									Set checkbox
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start" className="databasePickerMenu">
								{bulkEligible.checkboxColumns.length === 1 ? (
									<>
										<DropdownMenuItem
											onSelect={() =>
												onSetCheckbox(bulkEligible.checkboxColumns[0], true)
											}
										>
											Check
										</DropdownMenuItem>
										<DropdownMenuItem
											onSelect={() =>
												onSetCheckbox(bulkEligible.checkboxColumns[0], false)
											}
										>
											Uncheck
										</DropdownMenuItem>
									</>
								) : (
									bulkEligible.checkboxColumns.map((column) => (
										<DropdownMenuSub key={column.id}>
											<DropdownMenuSubTrigger>
												{column.label}
											</DropdownMenuSubTrigger>
											<DropdownMenuSubContent>
												<DropdownMenuItem
													onSelect={() => onSetCheckbox(column, true)}
												>
													Check
												</DropdownMenuItem>
												<DropdownMenuItem
													onSelect={() => onSetCheckbox(column, false)}
												>
													Uncheck
												</DropdownMenuItem>
											</DropdownMenuSubContent>
										</DropdownMenuSub>
									))
								)}
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
					{hasTagActions ? (
						<DatabaseBulkTagMenus
							disabled={isApplying}
							tagsColumns={bulkEligible.tagsColumns}
							rows={rows}
							selectedRowPaths={selectedRowPaths}
							onAddTags={onAddTags}
							onRemoveTags={onRemoveTags}
						/>
					) : null}
				</div>
			) : (
				<span className="databaseBulkActionsHint">
					No bulk-editable columns in this view
				</span>
			)}
			{isApplying ? (
				<span className="databaseBulkActionsApplying">Updating…</span>
			) : null}
		</div>
	);
}
