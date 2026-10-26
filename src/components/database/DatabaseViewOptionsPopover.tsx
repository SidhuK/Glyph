import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	FilterIcon,
	Folder01Icon,
	NotebookIcon,
	Search01Icon,
	SlidersVerticalIcon,
	Tag01Icon,
} from "@hugeicons/core-free-icons";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	databaseColumnLabel,
	ensureDatabaseColumn,
	isReservedDatabasePropertyKey,
	normalizeDatabasePropertyKey,
	resolveDatabaseColumns,
} from "../../lib/database/columns";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabaseFilter,
	DatabasePropertyOption,
	DatabaseSort,
} from "../../lib/database/types";
import { extractErrorMessage } from "../../lib/errorUtils";
import { Button } from "../ui/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";
import {
	ALL_CARD_FIELDS,
	cardFieldChips,
	toggledCardFields,
} from "./DatabaseViewOptionsCardFieldsPanel";
import {
	BUILT_IN_COLUMNS,
	type ColumnMenuEntry,
	PropertyChipsSection,
	RESTORE_DEFAULT_COLUMNS,
	sortPropertyChips,
} from "./DatabaseViewOptionsColumnsPanel";
import { FiltersPanel, nextFilterForColumn } from "./DatabaseViewOptionsFiltersPanel";
import {
	type DatabaseGrouping,
	DisclosureRow,
	GroupingRow,
	OrderingRow,
} from "./DatabaseViewOptionsRows";
import { SourcePanel } from "./DatabaseViewOptionsSourcePanel";
import { type DatabaseFilterPreset, ensurePresetColumn } from "./databaseViewPresets";

type ExpandedSection = "filters" | "source";

const SOURCE_KIND_ICONS = {
	all_notes: NotebookIcon,
	folder: Folder01Icon,
	tag: Tag01Icon,
	search: Search01Icon,
} as const satisfies Record<DatabaseConfig["source"]["kind"], unknown>;

interface DatabaseViewOptionsPopoverProps {
	config: DatabaseConfig;
	availableProperties: DatabasePropertyOption[];
	onChangeConfig: (config: DatabaseConfig) => Promise<void>;
	grouping: DatabaseGrouping;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

interface FilterKeyEntry {
	key: string;
	signature: string;
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

function sourceLabel(config: DatabaseConfig, t: TFunction<"shell">): string {
	switch (config.source.kind) {
		case "folder":
			return config.source.value || t("collections.source.folder");
		case "tag":
			return config.source.value || t("collections.source.tag");
		case "search":
			return config.source.value || t("collections.source.searchQuery");
		case "all_notes":
			return t("collections.source.kinds.all_notes");
	}
}

export function DatabaseViewOptionsPopover({
	config,
	availableProperties,
	onChangeConfig,
	grouping,
	open,
	onOpenChange,
}: DatabaseViewOptionsPopoverProps) {
	const { t } = useTranslation("shell");
	const displayLabel = t("collections.viewOptions.display");
	const [expanded, setExpanded] = useState<ExpandedSection | null>(null);
	const [filterError, setFilterError] = useState("");
	const [configError, setConfigError] = useState("");
	const filterKeyCounterRef = useRef(0);
	const previousFilterKeyEntriesRef = useRef<FilterKeyEntry[]>([]);
	const filtersRef = useRef(config.filters);
	const isTableView = config.view.layout === "table";
	filtersRef.current = config.filters;
	const resolvedColumns = useMemo(
		() => resolveDatabaseColumns(config.columns, availableProperties),
		[availableProperties, config.columns],
	);

	const columnsById = useMemo(
		() => new Map(config.columns.map((column) => [column.id, column])),
		[config.columns],
	);

	const columnMenuEntries = useMemo<ColumnMenuEntry[]>(() => {
		const entries = new Map<string, ColumnMenuEntry>();
		for (const column of BUILT_IN_COLUMNS) {
			const existing = columnsById.get(column.id);
			entries.set(column.id, {
				key: column.id,
				column: existing ?? column,
				enabled: existing?.visible ?? column.visible,
			});
		}
		for (const column of resolvedColumns) {
			const propertyKey = column.property_key
				? normalizeDatabasePropertyKey(column.property_key)
				: "";
			const normalizedId = `property:${propertyKey}`;
			if (
				column.type !== "property" ||
				!column.property_key ||
				isReservedDatabasePropertyKey(column.property_key) ||
				entries.has(normalizedId)
			) {
				continue;
			}
			entries.set(normalizedId, {
				key: normalizedId,
				column,
				enabled: columnsById.get(column.id)?.visible ?? false,
			});
		}
		const orderById = new Map(config.columns.map((column, index) => [column.id, index]));
		return [...entries.values()].sort((left, right) => {
			const leftOrder = orderById.get(left.column.id);
			const rightOrder = orderById.get(right.column.id);
			if (left.enabled !== right.enabled) return left.enabled ? -1 : 1;
			if (leftOrder != null && rightOrder != null) return leftOrder - rightOrder;
			if (leftOrder != null) return -1;
			if (rightOrder != null) return 1;
			return left.column.label.localeCompare(right.column.label);
		});
	}, [columnsById, config.columns, resolvedColumns]);

	const deriveFilterUiKeys = useCallback((filters: DatabaseFilter[], preferredKeys?: string[]) => {
		const nextEntries = (() => {
			if (preferredKeys && preferredKeys.length === filters.length) {
				return filters.map((filter, index) => ({
					key: preferredKeys[index] ?? `filter-${filterKeyCounterRef.current++}`,
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
	}, []);
	const filterSyncSignature = config.filters.map(filterSignature).join("\u0001");
	const [filterUiKeys, setFilterUiKeys] = useState<string[]>(() =>
		deriveFilterUiKeys(config.filters),
	);

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

	const updateColumns = async (updater: (columns: DatabaseColumn[]) => DatabaseColumn[]) => {
		await updateConfig({ ...config, columns: updater(config.columns) });
	};

	const setColumnEnabled = async (column: DatabaseColumn, enabled: boolean) => {
		const existing = columnsById.get(column.id);
		if (existing) {
			await updateColumns((columns) =>
				columns.map((entry) => (entry.id === column.id ? { ...entry, visible: enabled } : entry)),
			);
			return;
		}
		if (enabled) {
			await updateColumns((columns) => [...columns, { ...column, visible: true }]);
		}
	};

	const updateFilters = async (
		updater: (filters: DatabaseFilter[]) => DatabaseFilter[],
		keyUpdater?: (keys: string[]) => string[],
		columns: DatabaseColumn[] = config.columns,
	) => {
		const nextFilters = updater(config.filters);
		const nextKeys = keyUpdater?.(filterUiKeys);
		try {
			setFilterError("");
			const saved = await updateConfig({
				...config,
				columns,
				filters: nextFilters,
			});
			if (!saved) return;
			setFilterUiKeys(deriveFilterUiKeys(nextFilters, nextKeys));
		} catch (cause) {
			const message = extractErrorMessage(cause);
			console.error("Failed to update database filters", cause);
			setFilterError(message);
		}
	};

	const changeFilterColumn = (index: number, column: DatabaseColumn | null) => {
		void updateFilters(
			(filters) =>
				filters.map((entry, i) => (i === index ? nextFilterForColumn(entry, column) : entry)),
			undefined,
			column ? ensureDatabaseColumn(config.columns, column) : config.columns,
		);
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
		resolvedColumns.find((column) => column.visible) ?? resolvedColumns[0] ?? null;
	const activeSort = config.sorts[0] ?? null;

	const setSort = (sort: DatabaseSort | null) => {
		const column = sort
			? (resolvedColumns.find((entry) => entry.id === sort.column_id) ?? null)
			: null;
		void updateConfig({
			...config,
			columns: column ? ensureDatabaseColumn(config.columns, column) : config.columns,
			sorts: sort ? [sort] : [],
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

	const toggleSection = (section: ExpandedSection) => {
		setExpanded((current) => (current === section ? null : section));
	};

	const groupColumnId = grouping.selectedColumn?.id ?? null;
	const columnChips = sortPropertyChips(
		columnMenuEntries.map((entry) => ({
			key: entry.key,
			label: databaseColumnLabel(entry.column),
			enabled: entry.enabled,
			pinned: entry.column.type === "title",
			grouped: entry.column.type !== "title" && entry.column.id === groupColumnId,
		})),
	);

	const showAllColumns = () =>
		void updateColumns((columns) => {
			const existing = new Map(columns.map((column) => [column.id, column]));
			const missing = columnMenuEntries
				.map((entry) => entry.column)
				.filter((column) => !existing.has(column.id));
			return [
				...columns.map((column) => ({ ...column, visible: true })),
				...missing.map((column) => ({ ...column, visible: true })),
			];
		});

	const setCardFields = (fields: string[]) =>
		void updateConfig({ ...config, view: { ...config.view, board_card_fields: fields } });

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setExpanded(null);
				onOpenChange?.(nextOpen);
			}}
		>
			<PopoverTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="databaseToolbarChip databaseViewOptionsTrigger"
						title={displayLabel}
					/>
				}
			>
				<HugeiconsIcon icon={SlidersVerticalIcon} size="var(--icon-sm)" aria-hidden="true" />
				<span>{displayLabel}</span>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				className="databaseDisplayPanel"
				aria-label={displayLabel}
				initialFocus={false}
				// Pointer dismissals leave focus alone so the trigger never flashes a focus ring.
				finalFocus={(closeType) => closeType === "keyboard"}
				onKeyDown={(event) => {
					// Keep typing out of app shortcuts, but let Escape reach the popover's dismiss handler.
					if (event.key !== "Escape") event.stopPropagation();
				}}
			>
				{configError ? <div className="databaseViewPanelError">{configError}</div> : null}
				<div className="databaseViewOptionsRows">
					<GroupingRow grouping={grouping} />
					<OrderingRow columns={resolvedColumns} activeSort={activeSort} onChange={setSort} />
					<DisclosureRow
						icon={FilterIcon}
						label={t("collections.viewOptions.filter")}
						value={
							config.filters.length > 0
								? t("collections.viewOptions.filtersApplied", { count: config.filters.length })
								: t("collections.viewOptions.none")
						}
						expanded={expanded === "filters"}
						onToggle={() => toggleSection("filters")}
					>
						<FiltersPanel
							config={config}
							columns={resolvedColumns}
							availableProperties={availableProperties}
							filterError={filterError}
							filterUiKeys={filterUiKeys}
							filterKeyCounterRef={filterKeyCounterRef}
							defaultFilterColumn={defaultFilterColumn}
							onApplyFilterPreset={applyFilterPreset}
							onChangeFilterColumn={changeFilterColumn}
							updateFilters={updateFilters}
						/>
					</DisclosureRow>
					<DisclosureRow
						icon={SOURCE_KIND_ICONS[config.source.kind]}
						label={t("collections.source.title")}
						value={sourceLabel(config, t)}
						expanded={expanded === "source"}
						onToggle={() => toggleSection("source")}
					>
						<SourcePanel config={config} updateConfig={updateConfig} />
					</DisclosureRow>
				</div>
				{isTableView ? (
					<PropertyChipsSection
						title={t("collections.viewOptions.columns")}
						chips={columnChips}
						onToggle={(key, enabled) => {
							const entry = columnMenuEntries.find((candidate) => candidate.key === key);
							if (entry) void setColumnEnabled(entry.column, enabled);
						}}
						onShowAll={showAllColumns}
						onReset={resetViewOptions}
					/>
				) : (
					<PropertyChipsSection
						title={t("collections.viewOptions.cardFields")}
						chips={sortPropertyChips(
							cardFieldChips(config.view.board_card_fields, grouping.selectedColumn, t),
						)}
						onToggle={(key, enabled) =>
							setCardFields(toggledCardFields(config.view.board_card_fields, key, enabled))
						}
						onShowAll={() => setCardFields(ALL_CARD_FIELDS)}
						onReset={resetViewOptions}
					/>
				)}
			</PopoverContent>
		</Popover>
	);
}
