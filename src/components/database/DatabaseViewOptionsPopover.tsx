import { cn } from "@/lib/utils";
import {
	Cards01Icon,
	FilterMailIcon,
	GridViewIcon,
	SlidersVerticalIcon,
	TextFontIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { defaultDatabaseColumnIconName } from "../../lib/database/columnIcons";
import { createPropertyColumn } from "../../lib/database/config";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabaseFilter,
	DatabasePropertyOption,
	DatabaseSort,
} from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { ChevronRight, RefreshCw, Search } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import {
	CardFieldsPanel,
	visibleCardFieldCount,
} from "./DatabaseViewOptionsCardFieldsPanel";
import {
	type ColumnMenuEntry,
	ColumnsPanel,
} from "./DatabaseViewOptionsColumnsPanel";
import { FiltersPanel } from "./DatabaseViewOptionsFiltersPanel";
import { SortPanel } from "./DatabaseViewOptionsSortPanel";
import { SourcePanel } from "./DatabaseViewOptionsSourcePanel";
import {
	type DatabaseFilterPreset,
	type DatabaseSortPreset,
	ensurePresetColumn,
} from "./databaseViewPresets";

type OptionsPanel = "source" | "columns" | "filters" | "sort" | "card_fields";

function cardFieldsLabel(fields: string[] | undefined): string {
	const fieldCount = visibleCardFieldCount(fields);
	if (fieldCount === null) return "All shown";
	if (fieldCount === 0) return "Title only";
	return `${fieldCount} shown`;
}

interface DatabaseViewOptionsPopoverProps {
	config: DatabaseConfig;
	availableProperties: DatabasePropertyOption[];
	onChangeConfig: (config: DatabaseConfig) => Promise<void>;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

interface FilterKeyEntry {
	key: string;
	signature: string;
}

const RESTORE_DEFAULT_COLUMNS: DatabaseColumn[] = [
	{
		id: "title",
		type: "title",
		label: "Title",
		icon: defaultDatabaseColumnIconName({
			type: "title",
			property_kind: null,
		}),
		width: 320,
		visible: true,
	},
	{
		id: "tags",
		type: "tags",
		label: "Tags",
		icon: defaultDatabaseColumnIconName({
			type: "tags",
			property_kind: null,
		}),
		width: 220,
		visible: true,
	},
	{
		id: "updated",
		type: "updated",
		label: "Updated",
		icon: defaultDatabaseColumnIconName({
			type: "updated",
			property_kind: null,
		}),
		width: 180,
		visible: true,
	},
];

const RESERVED_PROPERTY_KEYS = new Set([
	"created",
	"folder",
	"glyph",
	"linked_notes",
	"path",
	"tags",
	"title",
	"updated",
]);

const builtInColumns: DatabaseColumn[] = [
	...RESTORE_DEFAULT_COLUMNS,
	{
		id: "folder",
		type: "folder",
		label: "Folder",
		icon: defaultDatabaseColumnIconName({
			type: "folder",
			property_kind: null,
		}),
		width: 220,
		visible: false,
	},
	{
		id: "path",
		type: "path",
		label: "Path",
		icon: defaultDatabaseColumnIconName({ type: "path", property_kind: null }),
		width: 260,
		visible: false,
	},
	{
		id: "linked_notes",
		type: "linked_notes",
		label: "Linked Notes",
		icon: defaultDatabaseColumnIconName({
			type: "linked_notes",
			property_kind: "relation",
		}),
		width: 220,
		visible: false,
		property_kind: "relation",
	},
	{
		id: "created",
		type: "created",
		label: "Created",
		icon: defaultDatabaseColumnIconName({
			type: "created",
			property_kind: null,
		}),
		width: 180,
		visible: false,
	},
];

function isReservedPropertyKey(key: string): boolean {
	return RESERVED_PROPERTY_KEYS.has(key.trim().toLowerCase());
}

function filterSignature(filter: DatabaseFilter): string {
	return JSON.stringify({
		columnId: filter.column_id,
		operator: filter.operator,
		valueText: filter.value_text ?? null,
		valueBool: filter.value_bool ?? null,
		valueList: filter.value_list,
	});
}

function sourceLabel(config: DatabaseConfig): string {
	switch (config.source.kind) {
		case "folder":
			return config.source.value || "Folder";
		case "tag":
			return config.source.value || "Tag";
		case "search":
			return config.source.value || "Search";
		case "all_notes":
			return "All notes";
	}
}

function sortLabel(
	sort: DatabaseSort | undefined,
	columns: DatabaseColumn[],
): string {
	if (!sort) return "None";
	return (
		columns.find((column) => column.id === sort.column_id)?.label ?? "Sort"
	);
}

function OptionMenuRow({
	icon,
	label,
	value,
	active,
	danger,
	onClick,
}: {
	icon: ReactNode;
	label: string;
	value?: string;
	active?: boolean;
	danger?: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				"databaseViewOptionsRow",
				active && "is-active",
				danger && "is-danger",
			)}
			onClick={onClick}
		>
			<span className="databaseViewOptionsRowIcon">{icon}</span>
			<span className="databaseViewOptionsRowLabel">{label}</span>
			{value ? <span className="databaseViewOptionsPill">{value}</span> : null}
			<ChevronRight size="var(--icon-lg)" aria-hidden="true" />
		</button>
	);
}

export function DatabaseViewOptionsPopover({
	config,
	availableProperties,
	onChangeConfig,
	open,
	onOpenChange,
}: DatabaseViewOptionsPopoverProps) {
	const [activePanel, setActivePanel] = useState<OptionsPanel | null>(null);
	const [filterError, setFilterError] = useState("");
	const [configError, setConfigError] = useState("");
	const filterKeyCounterRef = useRef(0);
	const previousFilterKeyEntriesRef = useRef<FilterKeyEntry[]>([]);
	const filtersRef = useRef(config.filters);
	const visibleCount = config.columns.filter((column) => column.visible).length;
	filtersRef.current = config.filters;

	const columnsById = useMemo(
		() => new Map(config.columns.map((column) => [column.id, column])),
		[config.columns],
	);
	const propertyColumnsByKey = useMemo(() => {
		const entries = new Map<string, DatabaseColumn>();
		for (const column of config.columns) {
			if (column.type !== "property" || !column.property_key) continue;
			entries.set(column.property_key.trim().toLowerCase(), column);
		}
		return entries;
	}, [config.columns]);

	const columnMenuEntries = useMemo<ColumnMenuEntry[]>(() => {
		const entries = new Map<string, ColumnMenuEntry>();
		for (const column of builtInColumns) {
			const existing = columnsById.get(column.id);
			entries.set(column.id, {
				key: column.id,
				column: existing ?? column,
				enabled: existing?.visible ?? column.visible,
			});
		}
		for (const property of availableProperties) {
			if (isReservedPropertyKey(property.key)) continue;
			const trimmedKey = property.key.trim();
			const propertyKey = trimmedKey.toLowerCase();
			const normalizedId = `property:${propertyKey}`;
			if (entries.has(normalizedId)) continue;
			const id = `property:${trimmedKey}`;
			const existing =
				columnsById.get(normalizedId) ??
				columnsById.get(id) ??
				propertyColumnsByKey.get(propertyKey);
			entries.set(normalizedId, {
				key: normalizedId,
				column:
					existing ?? createPropertyColumn({ ...property, key: trimmedKey }),
				enabled: existing?.visible ?? false,
			});
		}
		for (const column of config.columns) {
			const normalized = column.property_key?.trim().toLowerCase() ?? "";
			const normalizedId = `property:${normalized}`;
			if (
				column.type !== "property" ||
				!column.property_key ||
				isReservedPropertyKey(column.property_key) ||
				entries.has(normalizedId)
			) {
				continue;
			}
			entries.set(normalizedId, {
				key: normalizedId,
				column,
				enabled: column.visible,
			});
		}
		const orderById = new Map(
			config.columns.map((column, index) => [column.id, index]),
		);
		return [...entries.values()].sort((left, right) => {
			const leftOrder = orderById.get(left.column.id);
			const rightOrder = orderById.get(right.column.id);
			if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
			if (leftOrder != null && rightOrder != null)
				return leftOrder - rightOrder;
			if (leftOrder != null) return -1;
			if (rightOrder != null) return 1;
			return left.column.label.localeCompare(right.column.label);
		});
	}, [availableProperties, columnsById, config.columns, propertyColumnsByKey]);

	const deriveFilterUiKeys = useCallback(
		(filters: DatabaseFilter[], preferredKeys?: string[]) => {
			const nextEntries = (() => {
				if (preferredKeys && preferredKeys.length === filters.length) {
					return filters.map((filter, index) => ({
						key:
							preferredKeys[index] ?? `filter-${filterKeyCounterRef.current++}`,
						signature: filterSignature(filter),
					}));
				}
				const availableKeysBySignature = new Map<string, string[]>();
				for (const entry of previousFilterKeyEntriesRef.current) {
					const bucket = availableKeysBySignature.get(entry.signature);
					if (bucket) bucket.push(entry.key);
					else availableKeysBySignature.set(entry.signature, [entry.key]);
				}
				return filters.map((filter) => {
					const signature = filterSignature(filter);
					const bucket = availableKeysBySignature.get(signature);
					return {
						key: bucket?.shift() ?? `filter-${filterKeyCounterRef.current++}`,
						signature,
					};
				});
			})();
			previousFilterKeyEntriesRef.current = nextEntries;
			return nextEntries.map((entry) => entry.key);
		},
		[],
	);
	const filterSyncSignature = config.filters
		.map(filterSignature)
		.join("\u0001");
	const [filterUiKeys, setFilterUiKeys] = useState<string[]>(() =>
		deriveFilterUiKeys(config.filters),
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: filterSyncSignature intentionally gates filter array reference churn.
	useEffect(() => {
		setFilterUiKeys(deriveFilterUiKeys(filtersRef.current));
	}, [deriveFilterUiKeys, filterSyncSignature]);

	const updateConfig = async (nextConfig: DatabaseConfig) =>
		onChangeConfig(nextConfig)
			.then(() => {
				setConfigError("");
				return true;
			})
			.catch((cause) => {
				setConfigError(extractErrorMessage(cause));
				console.error("Failed to update config", cause);
				return false;
			});

	const updateColumns = async (
		updater: (columns: DatabaseColumn[]) => DatabaseColumn[],
	) => {
		await updateConfig({ ...config, columns: updater(config.columns) });
	};

	const setColumnEnabled = async (column: DatabaseColumn, enabled: boolean) => {
		const existing = columnsById.get(column.id);
		if (existing) {
			await updateColumns((columns) =>
				columns.map((entry) =>
					entry.id === column.id ? { ...entry, visible: enabled } : entry,
				),
			);
			return;
		}
		if (enabled) {
			await updateColumns((columns) => [
				...columns,
				{ ...column, visible: true },
			]);
		}
	};

	const updateFilters = async (
		updater: (filters: DatabaseFilter[]) => DatabaseFilter[],
		keyUpdater?: (keys: string[]) => string[],
	) => {
		const nextFilters = updater(config.filters);
		const nextKeys = keyUpdater?.(filterUiKeys);
		try {
			setFilterError("");
			const saved = await updateConfig({ ...config, filters: nextFilters });
			if (!saved) return;
			setFilterUiKeys(deriveFilterUiKeys(nextFilters, nextKeys));
		} catch (cause) {
			const message = extractErrorMessage(cause);
			console.error("Failed to update database filters", cause);
			setFilterError(message);
		}
	};

	const applyFilterPreset = async (preset: DatabaseFilterPreset) => {
		if (!preset.filter || !preset.column) return;
		const nextColumns = ensurePresetColumn(config.columns, preset.column);
		const nextFilters = [...config.filters, preset.filter];
		const saved = await updateConfig({
			...config,
			columns: nextColumns,
			filters: nextFilters,
		});
		if (!saved) return;
		setFilterUiKeys(deriveFilterUiKeys(nextFilters));
	};

	const defaultFilterColumn =
		config.columns.find((column) => column.visible) ??
		config.columns[0] ??
		null;
	const activeSort = config.sorts[0] ?? null;
	const sortColumn =
		config.columns.find((column) => column.id === activeSort?.column_id) ??
		config.columns.find((column) => column.visible) ??
		config.columns[0] ??
		null;
	const sortDirection = activeSort?.direction ?? "asc";

	const setSort = (patch: Partial<DatabaseSort>) => {
		if (!sortColumn && !patch.column_id) return;
		void updateConfig({
			...config,
			sorts: [
				{
					column_id:
						patch.column_id ??
						activeSort?.column_id ??
						sortColumn?.id ??
						"title",
					direction: patch.direction ?? activeSort?.direction ?? "asc",
				},
			],
		});
	};

	const applySortPreset = (preset: DatabaseSortPreset) => {
		if (!preset.sort || !preset.column) return;
		void updateConfig({
			...config,
			columns: ensurePresetColumn(config.columns, preset.column),
			sorts: [preset.sort],
		});
	};

	const resetViewOptions = () => {
		void updateConfig({
			...config,
			view: {
				...config.view,
				search: "",
				board_group_by: null,
				board_card_fields: undefined,
			},
			columns: RESTORE_DEFAULT_COLUMNS,
			sorts: [],
			filters: [],
		});
	};

	const togglePanel = (panel: OptionsPanel) => {
		setActivePanel((current) => (current === panel ? null : panel));
	};

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen) setActivePanel(null);
				onOpenChange?.(nextOpen);
			}}
		>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					className="databaseToolbarChip databaseViewOptionsTrigger"
					title="View settings"
					aria-label="View settings"
				>
					<HugeiconsIcon
						icon={SlidersVerticalIcon}
						size="var(--icon-md)"
						strokeWidth={0.9}
					/>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				className="databaseViewOptionsPopover"
				onOpenAutoFocus={(event) => event.preventDefault()}
				onKeyDown={(event) => event.stopPropagation()}
			>
				{activePanel === "source" ? (
					<SourcePanel config={config} updateConfig={updateConfig} />
				) : null}
				{activePanel === "columns" ? (
					<ColumnsPanel
						columnMenuEntries={columnMenuEntries}
						setColumnEnabled={setColumnEnabled}
						updateColumns={updateColumns}
						onRestoreDefaultColumns={() =>
							void updateConfig({
								...config,
								columns: RESTORE_DEFAULT_COLUMNS,
							})
						}
					/>
				) : null}
				{activePanel === "filters" ? (
					<FiltersPanel
						config={config}
						availableProperties={availableProperties}
						filterError={filterError}
						filterUiKeys={filterUiKeys}
						filterKeyCounterRef={filterKeyCounterRef}
						defaultFilterColumn={defaultFilterColumn}
						onApplyFilterPreset={applyFilterPreset}
						updateFilters={updateFilters}
					/>
				) : null}
				{activePanel === "sort" ? (
					<SortPanel
						config={config}
						availableProperties={availableProperties}
						activeSort={activeSort}
						sortColumn={sortColumn}
						sortDirection={sortDirection}
						setSort={setSort}
						onApplySortPreset={applySortPreset}
						updateConfig={updateConfig}
					/>
				) : null}
				{activePanel === "card_fields" ? (
					<CardFieldsPanel
						fields={config.view.board_card_fields}
						onChange={(fields) =>
							void onChangeConfig({
								...config,
								view: {
									...config.view,
									board_card_fields: fields,
								},
							})
						}
					/>
				) : null}
				<section className="databaseViewOptionsMenu" aria-label="View settings">
					{configError ? (
						<div className="databaseViewPanelError">{configError}</div>
					) : null}
					<OptionMenuRow
						icon={<Search size="var(--icon-lg)" />}
						label="Source"
						value={sourceLabel(config)}
						active={activePanel === "source"}
						onClick={() => togglePanel("source")}
					/>
					<OptionMenuRow
						icon={
							<HugeiconsIcon
								icon={GridViewIcon}
								size="var(--icon-lg)"
								strokeWidth={0.9}
							/>
						}
						label="Columns"
						value={`${visibleCount} selected`}
						active={activePanel === "columns"}
						onClick={() => togglePanel("columns")}
					/>
					<OptionMenuRow
						icon={
							<HugeiconsIcon
								icon={FilterMailIcon}
								size="var(--icon-lg)"
								strokeWidth={0.9}
							/>
						}
						label="Filter by"
						value={
							config.filters.length > 0
								? `${config.filters.length} applied`
								: "None"
						}
						active={activePanel === "filters"}
						onClick={() => togglePanel("filters")}
					/>
					<OptionMenuRow
						icon={
							<HugeiconsIcon
								icon={TextFontIcon}
								size="var(--icon-lg)"
								strokeWidth={0.9}
							/>
						}
						label="Sort by"
						value={sortLabel(activeSort ?? undefined, config.columns)}
						active={activePanel === "sort"}
						onClick={() => togglePanel("sort")}
					/>
					{config.view.layout === "board" ? (
						<OptionMenuRow
							icon={
								<HugeiconsIcon
									icon={Cards01Icon}
									size="var(--icon-lg)"
									strokeWidth={0.9}
								/>
							}
							label="Card fields"
							value={cardFieldsLabel(config.view.board_card_fields)}
							active={activePanel === "card_fields"}
							onClick={() => togglePanel("card_fields")}
						/>
					) : null}
					<button
						type="button"
						className="databaseViewRestoreButton"
						onClick={resetViewOptions}
					>
						<RefreshCw size="var(--icon-lg)" aria-hidden="true" />
						Restore defaults
					</button>
				</section>
			</PopoverContent>
		</Popover>
	);
}
