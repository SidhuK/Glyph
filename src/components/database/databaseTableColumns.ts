import type { DatabaseColumn } from "../../lib/database/types";

/** Status is the title's marker: a 16px inset plus a 14px glyph slot, so it sits about 10px from
    the title (the title cell keeps an 8px inset). */
export const DATABASE_TABLE_STATUS_WIDTH = 30;

/** Linear list: status is a fixed icon slot ahead of the title, the title grows to fill the row
    (its size is only the flex basis), and every other column packs against the trailing edge. */
const DATABASE_TABLE_COLUMN_SIZE_LIMITS = {
	title: { minSize: 240, maxSize: 560 },
	status: { minSize: DATABASE_TABLE_STATUS_WIDTH, maxSize: DATABASE_TABLE_STATUS_WIDTH },
	other: { minSize: 64, maxSize: 360 },
} as const;

export function isStatusColumn(column: DatabaseColumn): boolean {
	return column.type === "property" && column.property_kind === "status";
}

export function columnSizeLimits(column: DatabaseColumn) {
	if (column.type === "title") return DATABASE_TABLE_COLUMN_SIZE_LIMITS.title;
	if (isStatusColumn(column)) return DATABASE_TABLE_COLUMN_SIZE_LIMITS.status;
	return DATABASE_TABLE_COLUMN_SIZE_LIMITS.other;
}

/** A column's width until the user resizes it, sized to what its values need: compact dates
    (with room for a "Completed on" header), a priority glyph and label, a toggle, a few tags. */
function defaultTableColumnWidth(column: DatabaseColumn): number {
	if (column.type === "title") return DATABASE_TABLE_COLUMN_SIZE_LIMITS.title.minSize;
	if (isStatusColumn(column)) return DATABASE_TABLE_STATUS_WIDTH;
	if (column.type === "tags" || column.property_kind === "tags") return 200;
	if (
		column.type === "created" ||
		column.type === "updated" ||
		column.property_kind === "date" ||
		column.property_kind === "datetime"
	) {
		return 104;
	}
	if (column.property_kind === "priority") return 112;
	if (column.property_kind === "checkbox") return 72;
	return 152;
}

export function tableColumnSize(column: DatabaseColumn): number {
	return column.width ?? defaultTableColumnWidth(column);
}
