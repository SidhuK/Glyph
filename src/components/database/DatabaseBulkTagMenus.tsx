import { useMemo, useState } from "react";
import { collectSelectedRowTags } from "../../lib/database/bulkActions";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import { Search, Tags } from "../Icons";
import { formatTagLabel } from "../editor/noteProperties/utils";
import { Button } from "../ui/shadcn/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { Input } from "../ui/shadcn/input";
import {
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
} from "../ui/shadcn/popover";
import { ScrollArea } from "../ui/shadcn/scroll-area";
import { DatabaseTagPickerPanel } from "./DatabaseTagPickerPanel";

const BULK_TAG_PICKER_MENU_CLASS =
	"databasePickerMenu databaseBulkTagPickerMenu";

type SelectedRowTagOption = ReturnType<typeof collectSelectedRowTags>[number];

interface DatabaseBulkTagMenusProps {
	disabled: boolean;
	tagsColumns: DatabaseColumn[];
	rows: DatabaseRow[];
	selectedRowPaths: string[];
	onAddTags: (column: DatabaseColumn, tags: string[]) => void;
	onRemoveTags: (column: DatabaseColumn, tags: string[]) => void;
}

function BulkTagRemovePanel({
	column,
	rows,
	selectedRowPaths,
	onApply,
}: {
	column: DatabaseColumn;
	rows: DatabaseRow[];
	selectedRowPaths: string[];
	onApply: (tag: string) => void;
}) {
	const [query, setQuery] = useState("");
	const tagOptions = useMemo(
		() => collectSelectedRowTags(rows, selectedRowPaths, column),
		[column, rows, selectedRowPaths],
	);
	const filteredOptions = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		if (!normalizedQuery) return tagOptions;
		return tagOptions.filter((option) =>
			option.tag.toLowerCase().includes(normalizedQuery),
		);
	}, [query, tagOptions]);

	return (
		<div className="databasePickerPanel">
			<PopoverHeader className="databasePickerHeader">
				<div className="databasePickerEyebrow">
					<Tags size="var(--icon-sm)" />
					<span>Tags</span>
				</div>
				<PopoverTitle>Remove from {column.label}</PopoverTitle>
				<PopoverDescription>
					Remove a tag from all selected notes that have it.
				</PopoverDescription>
			</PopoverHeader>
			<div className="databasePickerSearch">
				<Search size="var(--icon-sm)" />
				<Input
					value={query}
					placeholder="Search selected tags"
					onChange={(event) => setQuery(event.target.value)}
				/>
			</div>
			<ScrollArea className="databasePickerResults">
				<div className="databasePickerList">
					{filteredOptions.length > 0 ? (
						filteredOptions.map((option) => (
							<TagRemoveOption
								key={option.tag}
								option={option}
								onSelect={() => onApply(option.tag)}
							/>
						))
					) : (
						<div className="databasePickerEmpty">
							{tagOptions.length === 0
								? "No tags on the selected notes."
								: "No matching tags."}
						</div>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}

function TagRemoveOption({
	option,
	onSelect,
}: {
	option: SelectedRowTagOption;
	onSelect: () => void;
}) {
	return (
		<button type="button" className="databasePickerOption" onClick={onSelect}>
			<span className="databasePickerOptionMain">
				<span className="databasePickerOptionLabel">
					{formatTagLabel(option.tag)}
				</span>
				<span className="databasePickerOptionMeta">
					on {option.count} {option.count === 1 ? "note" : "notes"}
				</span>
			</span>
		</button>
	);
}

function TagColumnSubmenu({
	column,
	mode,
	rows,
	selectedRowPaths,
	onApply,
}: {
	column: DatabaseColumn;
	mode: "add" | "remove";
	rows: DatabaseRow[];
	selectedRowPaths: string[];
	onApply: (tag: string) => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<DropdownMenuSub open={open} onOpenChange={setOpen}>
			<DropdownMenuSubTrigger>{column.label}</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className={BULK_TAG_PICKER_MENU_CLASS}>
				{mode === "add" ? (
					<DatabaseTagPickerPanel
						label={`Add to ${column.label}`}
						description="Choose a tag to add to the selected notes."
						onSelect={(tag) => {
							onApply(tag);
							setOpen(false);
						}}
					/>
				) : (
					<BulkTagRemovePanel
						column={column}
						rows={rows}
						selectedRowPaths={selectedRowPaths}
						onApply={(tag) => {
							onApply(tag);
							setOpen(false);
						}}
					/>
				)}
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

function TagColumnMenu({
	column,
	mode,
	rows,
	selectedRowPaths,
	triggerLabel,
	disabled,
	onApply,
}: {
	column: DatabaseColumn;
	mode: "add" | "remove";
	rows: DatabaseRow[];
	selectedRowPaths: string[];
	triggerLabel: string;
	disabled: boolean;
	onApply: (tag: string) => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="databaseBulkActionsButton"
					disabled={disabled}
				>
					{triggerLabel}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className={BULK_TAG_PICKER_MENU_CLASS}>
				{mode === "add" ? (
					<DatabaseTagPickerPanel
						label={`Add to ${column.label}`}
						description="Choose a tag to add to the selected notes."
						onSelect={(tag) => {
							onApply(tag);
							setOpen(false);
						}}
					/>
				) : (
					<BulkTagRemovePanel
						column={column}
						rows={rows}
						selectedRowPaths={selectedRowPaths}
						onApply={(tag) => {
							onApply(tag);
							setOpen(false);
						}}
					/>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function renderTagColumnMenus({
	tagsColumns,
	mode,
	rows,
	selectedRowPaths,
	triggerLabel,
	disabled,
	onApply,
}: {
	tagsColumns: DatabaseColumn[];
	mode: "add" | "remove";
	rows: DatabaseRow[];
	selectedRowPaths: string[];
	triggerLabel: string;
	disabled: boolean;
	onApply: (column: DatabaseColumn, tag: string) => void;
}) {
	if (tagsColumns.length === 0) return null;

	if (tagsColumns.length === 1) {
		const column = tagsColumns[0];
		return (
			<TagColumnMenu
				column={column}
				mode={mode}
				rows={rows}
				selectedRowPaths={selectedRowPaths}
				triggerLabel={triggerLabel}
				disabled={disabled}
				onApply={(tag) => onApply(column, tag)}
			/>
		);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					size="sm"
					variant="outline"
					className="databaseBulkActionsButton"
					disabled={disabled}
				>
					{triggerLabel}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="databasePickerMenu">
				{tagsColumns.map((column) => (
					<TagColumnSubmenu
						key={column.id}
						column={column}
						mode={mode}
						rows={rows}
						selectedRowPaths={selectedRowPaths}
						onApply={(tag) => onApply(column, tag)}
					/>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function DatabaseBulkTagMenus({
	disabled,
	tagsColumns,
	rows,
	selectedRowPaths,
	onAddTags,
	onRemoveTags,
}: DatabaseBulkTagMenusProps) {
	return (
		<>
			{renderTagColumnMenus({
				tagsColumns,
				mode: "add",
				rows,
				selectedRowPaths,
				triggerLabel: "Add tag",
				disabled,
				onApply: (column, tag) => onAddTags(column, [tag]),
			})}
			{renderTagColumnMenus({
				tagsColumns,
				mode: "remove",
				rows,
				selectedRowPaths,
				triggerLabel: "Remove tag",
				disabled,
				onApply: (column, tag) => onRemoveTags(column, [tag]),
			})}
		</>
	);
}
