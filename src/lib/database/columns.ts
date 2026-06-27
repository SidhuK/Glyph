import { createPropertyColumn } from "./config";
import type { DatabaseColumn, DatabasePropertyOption } from "./types";

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

export function normalizeDatabasePropertyKey(value: string): string {
	return value.trim().toLowerCase();
}

export function isReservedDatabasePropertyKey(key: string): boolean {
	return RESERVED_PROPERTY_KEYS.has(normalizeDatabasePropertyKey(key));
}

export function resolveDatabaseColumns(
	columns: DatabaseColumn[],
	availableProperties: DatabasePropertyOption[] = [],
): DatabaseColumn[] {
	if (availableProperties.length === 0) return columns;

	const byId = new Map(columns.map((column) => [column.id, column]));
	const byPropertyKey = new Map<string, DatabaseColumn>();
	for (const column of columns) {
		if (column.type !== "property" || !column.property_key) continue;
		byPropertyKey.set(
			normalizeDatabasePropertyKey(column.property_key),
			column,
		);
	}

	let merged: DatabaseColumn[] | null = null;
	for (const property of availableProperties) {
		if (isReservedDatabasePropertyKey(property.key)) continue;
		const key = property.key.trim();
		if (!key) continue;
		const normalizedKey = normalizeDatabasePropertyKey(key);
		const exactId = `property:${key}`;
		const normalizedId = `property:${normalizedKey}`;
		if (
			byId.has(exactId) ||
			byId.has(normalizedId) ||
			byPropertyKey.has(normalizedKey)
		) {
			continue;
		}

		const column = {
			...createPropertyColumn({ ...property, key }),
			visible: false,
		};
		merged ??= [...columns];
		merged.push(column);
		byId.set(column.id, column);
		byPropertyKey.set(normalizedKey, column);
	}

	return merged ?? columns;
}

export function ensureDatabaseColumn(
	columns: DatabaseColumn[],
	column: DatabaseColumn,
): DatabaseColumn[] {
	if (columns.some((entry) => entry.id === column.id)) return columns;
	return [...columns, column];
}
