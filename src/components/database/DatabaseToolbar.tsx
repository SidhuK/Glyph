import type { DatabaseConfig } from "../../lib/database/types";
import {
	Database,
	FileText,
	FolderClosed,
	Grid3X3,
	Kanban,
	ListChecks,
	Plus,
	RefreshCw,
	Table,
} from "../Icons";
import { Button } from "../ui/shadcn/button";

interface DatabaseToolbarProps {
	mode: "database" | "markdown";
	databaseView: "table" | "board";
	config: DatabaseConfig;
	rowCount: number;
	truncated: boolean;
	selectedRowPath: string | null;
	onModeChange: (mode: "database" | "markdown") => void;
	onDatabaseViewChange: (view: "table" | "board") => void;
	onAddRow: () => void;
	onOpenSelected: () => void;
	onReload: () => void;
	onOpenSource: () => void;
	onOpenColumns: () => void;
	onOpenFilters: () => void;
}

function sourceKindLabel(config: DatabaseConfig): string {
	switch (config.source.kind) {
		case "folder":
			return "Folder";
		case "tag":
			return "Tag";
		case "search":
			return "Search";
	}
}

function sourceTitle(config: DatabaseConfig): string {
	switch (config.source.kind) {
		case "folder":
			return config.source.value || "Space root";
		case "tag":
			return config.source.value || "Tag";
		case "search":
			return config.source.value || "Search";
	}
}

function sourceMeta(
	config: DatabaseConfig,
	rowCount: number,
	truncated: boolean,
): string {
	const parts = [`${rowCount} row${rowCount === 1 ? "" : "s"}`];
	if (config.source.kind === "folder" && config.source.recursive) {
		parts.push("with subfolders");
	}
	if (config.filters.length > 0) {
		parts.push(
			`${config.filters.length} filter${config.filters.length === 1 ? "" : "s"}`,
		);
	}
	if (truncated) {
		parts.push("first 500");
	}
	return parts.join(" • ");
}

export function DatabaseToolbar({
	mode,
	databaseView,
	config,
	rowCount,
	truncated,
	selectedRowPath,
	onModeChange,
	onDatabaseViewChange,
	onAddRow,
	onOpenSelected,
	onReload,
	onOpenSource,
	onOpenColumns,
	onOpenFilters,
}: DatabaseToolbarProps) {
	const heading = sourceTitle(config);
	const kind = sourceKindLabel(config);
	const meta = sourceMeta(config, rowCount, truncated);

	return (
		<div className="databaseToolbar">
			<div className="databaseToolbarPrimary">
				<div
					className="databaseModeSwitch"
					role="tablist"
					aria-label="Database note mode"
				>
					<Button
						type="button"
						variant={mode === "database" ? "outline" : "ghost"}
						size="icon-sm"
						className={[
							"databaseToolbarChip",
							mode === "database" ? "is-active" : "",
						]
							.filter(Boolean)
							.join(" ")}
						onClick={() => onModeChange("database")}
						title="Database view"
						aria-label="Database view"
					>
						<Database size={14} />
					</Button>
					<Button
						type="button"
						variant={mode === "markdown" ? "outline" : "ghost"}
						size="icon-sm"
						className={[
							"databaseToolbarChip",
							mode === "markdown" ? "is-active" : "",
						]
							.filter(Boolean)
							.join(" ")}
						onClick={() => onModeChange("markdown")}
						title="Markdown view"
						aria-label="Markdown view"
					>
						<FileText size={14} />
					</Button>
				</div>
				{mode === "database" ? (
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
				) : null}
				<div className="databaseToolbarMeta">
					<div className="databaseToolbarTitle">{heading}</div>
					<div className="databaseToolbarSubtitle">
						<span className="databaseToolbarBadge">{kind}</span>
						<span>{meta}</span>
					</div>
				</div>
			</div>
			<div className="databaseToolbarActions">
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
					title="Source"
					aria-label="Source"
				>
					<FolderClosed size={14} />
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
					<Grid3X3 size={14} />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="databaseToolbarChip"
					onClick={onOpenFilters}
					title="Filters"
					aria-label="Filters"
				>
					<ListChecks size={14} />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="databaseToolbarChip"
					onClick={onOpenSelected}
					disabled={!selectedRowPath}
					title="Open note"
					aria-label="Open note"
				>
					<FileText size={14} />
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
