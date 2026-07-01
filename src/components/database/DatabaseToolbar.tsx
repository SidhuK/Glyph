import { useEffect, useId, useRef, useState } from "react";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabasePropertyOption,
} from "../../lib/database/types";
import { Search, X } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { DatabaseViewOptionsPopover } from "./DatabaseViewOptionsPopover";

interface DatabaseToolbarProps {
	databaseView: "table" | "board";
	groupColumns: DatabaseColumn[];
	groupColumnId: string | null;
	config: DatabaseConfig;
	availableProperties: DatabasePropertyOption[];
	onGroupColumnIdChange: (groupColumnId: string | null) => void;
	onChangeConfig: (config: DatabaseConfig) => Promise<void>;
	viewOptionsOpen?: boolean;
	onViewOptionsOpenChange?: (open: boolean) => void;
	className?: string;
}

function groupColumnOptionLabel(column: DatabaseColumn): string {
	if (column.type === "tags" || column.property_kind === "tags") {
		return `${column.label} (multi-lane)`;
	}
	if (column.property_kind === "multi_select") {
		return `${column.label} (multi-lane)`;
	}
	return column.label;
}

export function DatabaseToolbar({
	databaseView,
	groupColumns,
	groupColumnId,
	config,
	availableProperties,
	onGroupColumnIdChange,
	onChangeConfig,
	viewOptionsOpen,
	onViewOptionsOpenChange,
	className,
}: DatabaseToolbarProps) {
	const searchValue = config.view.search ?? "";
	const searchInputId = useId();
	const searchInputRef = useRef<HTMLInputElement | null>(null);
	const justExpandedRef = useRef(false);
	const configRef = useRef(config);
	const [searchDraft, setSearchDraft] = useState(searchValue);
	const [searchExpanded, setSearchExpanded] = useState(Boolean(searchValue));
	configRef.current = config;
	const hasSelectedGroupColumn =
		groupColumnId != null &&
		groupColumns.some((column) => column.id === groupColumnId);
	const selectedGroupColumn =
		(hasSelectedGroupColumn
			? groupColumns.find((column) => column.id === groupColumnId)
			: null) ??
		(databaseView === "board" ? groupColumns[0] : null) ??
		null;
	const selectedGroupColumnId =
		selectedGroupColumn?.id ??
		(databaseView === "board" ? groupColumns[0]?.id : "") ??
		"";
	const groupByLabel = "Grouped by";

	useEffect(() => {
		setSearchDraft(searchValue);
		if (searchValue) setSearchExpanded(true);
	}, [searchValue]);

	useEffect(() => {
		if (searchDraft === searchValue) return;
		const timer = window.setTimeout(() => {
			const latestConfig = configRef.current;
			void onChangeConfig({
				...latestConfig,
				view: {
					...latestConfig.view,
					search: searchDraft,
				},
			});
		}, 300);
		return () => window.clearTimeout(timer);
	}, [onChangeConfig, searchDraft, searchValue]);

	useEffect(() => {
		if (!searchExpanded || !justExpandedRef.current) return;
		justExpandedRef.current = false;
		searchInputRef.current?.focus();
	}, [searchExpanded]);

	return (
		<div className={["databaseToolbar", className].filter(Boolean).join(" ")}>
			<div className="databaseToolbarActions">
				{searchExpanded || searchDraft ? (
					<label className="databaseToolbarSearch" htmlFor={searchInputId}>
						<Search size="var(--icon-sm)" aria-hidden="true" />
						<Input
							ref={searchInputRef}
							id={searchInputId}
							className="databaseToolbarSearchInput"
							value={searchDraft}
							placeholder="Search this view"
							aria-label="Search this view"
							onBlur={() => {
								if (!searchDraft) setSearchExpanded(false);
							}}
							onKeyDown={(event) => {
								if (event.key !== "Escape") return;
								event.preventDefault();
								setSearchDraft("");
								setSearchExpanded(false);
							}}
							onChange={(event) => setSearchDraft(event.target.value)}
						/>
						{searchDraft ? (
							<button
								type="button"
								className="databaseToolbarSearchClear"
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => {
									setSearchDraft("");
									setSearchExpanded(false);
								}}
								title="Clear search"
								aria-label="Clear search"
							>
								<X size="var(--icon-sm)" />
							</button>
						) : null}
					</label>
				) : (
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className="databaseToolbarChip databaseToolbarSearchButton"
						onClick={() => {
							justExpandedRef.current = true;
							setSearchExpanded(true);
						}}
						title="Search view"
						aria-label="Search view"
					>
						<Search size="var(--icon-sm)" />
					</Button>
				)}
				{groupColumns.length > 0 ? (
					<label className="databaseToolbarGroupBy">
						<span className="databaseToolbarGroupByLabel">{groupByLabel}</span>
						<select
							className="databaseToolbarGroupBySelect"
							value={selectedGroupColumnId}
							title={
								selectedGroupColumn
									? `Grouping by ${selectedGroupColumn.label}`
									: "Choose a field to group by"
							}
							aria-label={groupByLabel}
							onChange={(event) =>
								onGroupColumnIdChange(event.target.value || null)
							}
						>
							{databaseView === "board" ? null : (
								<option value="">No grouping</option>
							)}
							{groupColumns.map((column) => (
								<option key={column.id} value={column.id}>
									{groupColumnOptionLabel(column)}
								</option>
							))}
						</select>
					</label>
				) : databaseView === "board" ? (
					<span className="databaseToolbarGroupByHint">
						Add a status, tag, or checkbox field to create lanes
					</span>
				) : null}
				<DatabaseViewOptionsPopover
					open={viewOptionsOpen}
					onOpenChange={onViewOptionsOpenChange}
					config={config}
					availableProperties={availableProperties}
					onChangeConfig={onChangeConfig}
				/>
			</div>
		</div>
	);
}
