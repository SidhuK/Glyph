import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { LayerIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { defaultDatabaseColumnIconName } from "../../lib/database/columnIcons";
import type { DatabaseColumn } from "../../lib/database/types";

export interface ColumnMenuEntry {
	key: string;
	column: DatabaseColumn;
	enabled: boolean;
}

function builtInColumn(
	id: DatabaseColumn["id"],
	type: DatabaseColumn["type"],
	label: string,
	width: number,
	visible: boolean,
	propertyKind: DatabaseColumn["property_kind"] = null,
): DatabaseColumn {
	return {
		id,
		type,
		label,
		icon: defaultDatabaseColumnIconName({ type, property_kind: propertyKind }),
		width,
		visible,
		...(propertyKind ? { property_kind: propertyKind } : {}),
	};
}

export const RESTORE_DEFAULT_COLUMNS: DatabaseColumn[] = [
	builtInColumn("title", "title", "Title", 320, true),
	builtInColumn("tags", "tags", "Tags", 220, true),
	builtInColumn("updated", "updated", "Updated", 180, true),
];

export const BUILT_IN_COLUMNS: DatabaseColumn[] = [
	...RESTORE_DEFAULT_COLUMNS,
	builtInColumn("folder", "folder", "Folder", 220, false),
	builtInColumn("path", "path", "Path", 260, false),
	builtInColumn("linked_notes", "linked_notes", "Linked notes", 220, false, "relation"),
	builtInColumn("created", "created", "Created", 180, false),
];

export interface PropertyChip {
	key: string;
	label: string;
	enabled: boolean;
	/** Always shown once enabled; the title anchors every row, so it can't be hidden here. */
	pinned?: boolean;
	/** The view groups by this field, so it shows as group headers or lanes, never per row. */
	grouped?: boolean;
}

interface PropertyChipsSectionProps {
	title: string;
	chips: PropertyChip[];
	onToggle: (key: string, enabled: boolean) => void;
	onShowAll: () => void;
	onReset: () => void;
}

/** Shown chips first, then the grouped field and hidden ones, keeping each run's order. */
export function sortPropertyChips(chips: PropertyChip[]): PropertyChip[] {
	const shown = (chip: PropertyChip) => chip.enabled && !chip.grouped;
	return [...chips].sort((left, right) => Number(shown(right)) - Number(shown(left)));
}

/** Linear's "Display properties": an even grid of toggle chips, filled when shown. */
export function PropertyChipsSection({
	title,
	chips,
	onToggle,
	onShowAll,
	onReset,
}: PropertyChipsSectionProps) {
	const { t } = useTranslation("shell");
	const groupedHint = t("collections.viewOptions.groupedBy");
	return (
		<section className="databaseViewOptionsSection" aria-label={title}>
			<div className="databaseViewOptionsSectionHeader">
				<span>{title}</span>
				<div className="databaseViewOptionsSectionActions">
					{chips.some((chip) => !chip.enabled) ? (
						<button type="button" className="databaseViewPanelReset" onClick={onShowAll}>
							{t("collections.viewOptions.showAll")}
						</button>
					) : null}
					<button type="button" className="databaseViewPanelReset" onClick={onReset}>
						{t("collections.viewOptions.reset")}
					</button>
				</div>
			</div>
			<div className="databaseViewPropertyChips">
				{chips.map((chip) =>
					chip.grouped ? (
						<button
							key={chip.key}
							type="button"
							className="databaseViewPropertyChip is-grouped"
							aria-pressed={false}
							aria-disabled="true"
							aria-label={`${chip.label}, ${groupedHint}`}
							title={groupedHint}
						>
							<span className="databaseViewPropertyChipLabel">{chip.label}</span>
							<HugeiconsIcon icon={LayerIcon} size="var(--icon-xs)" aria-hidden="true" />
						</button>
					) : (
						<button
							key={chip.key}
							type="button"
							className="databaseViewPropertyChip"
							aria-pressed={chip.enabled}
							disabled={chip.pinned && chip.enabled}
							title={chip.label}
							onClick={() => onToggle(chip.key, !chip.enabled)}
						>
							<span className="databaseViewPropertyChipLabel">{chip.label}</span>
						</button>
					),
				)}
			</div>
		</section>
	);
}
