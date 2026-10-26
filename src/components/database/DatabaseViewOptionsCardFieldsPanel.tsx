import type { TFunction } from "i18next";
import type { DatabaseColumn } from "../../lib/database/types";
import type { PropertyChip } from "./DatabaseViewOptionsColumnsPanel";

const CARD_FIELD_IDS = ["date", "task_progress", "status", "priority", "tags"] as const;
const CARD_FIELD_ID_SET = new Set<string>(CARD_FIELD_IDS);
const TITLE_ONLY_CARD_FIELDS = ["__glyph_title_only__"];

function activeCardFields(fields: string[] | undefined): Set<string> {
	return new Set(
		fields && fields.length > 0
			? fields.filter((field) => CARD_FIELD_ID_SET.has(field))
			: CARD_FIELD_IDS,
	);
}

/** Cards never repeat the value their lane already names, so that field reads as grouped. */
function cardFieldForGroupColumn(column: DatabaseColumn | null): string | null {
	if (!column) return null;
	if (column.type === "tags" || column.property_kind === "tags") return "tags";
	if (column.property_kind === "status" || column.property_kind === "priority") {
		return column.property_kind;
	}
	return null;
}

export function cardFieldChips(
	fields: string[] | undefined,
	groupColumn: DatabaseColumn | null,
	t: TFunction<"shell">,
): PropertyChip[] {
	const active = activeCardFields(fields);
	const groupedField = cardFieldForGroupColumn(groupColumn);
	return CARD_FIELD_IDS.map((id) => ({
		key: id,
		label: t(`collections.viewOptions.cardFieldLabels.${id}`),
		enabled: active.has(id),
		grouped: id === groupedField,
	}));
}

export function toggledCardFields(
	fields: string[] | undefined,
	fieldId: string,
	enabled: boolean,
): string[] {
	const next = activeCardFields(fields);
	if (enabled) next.add(fieldId);
	else next.delete(fieldId);
	return next.size === 0 ? TITLE_ONLY_CARD_FIELDS : Array.from(next);
}

export const ALL_CARD_FIELDS: string[] = [...CARD_FIELD_IDS];
