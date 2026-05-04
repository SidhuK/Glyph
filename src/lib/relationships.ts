import type { NoteRelationship } from "./tauri";

export interface RelationshipGroup {
	field_key: string;
	items: NoteRelationship[];
}

export function groupRelationshipsByField(
	relationships: NoteRelationship[],
): RelationshipGroup[] {
	const groups = new Map<string, NoteRelationship[]>();
	for (const relationship of relationships) {
		const key = relationship.field_key.trim();
		if (!key) continue;
		const items = groups.get(key) ?? [];
		items.push(relationship);
		groups.set(key, items);
	}

	return Array.from(groups.entries())
		.map(([field_key, items]) => ({
			field_key,
			items: items.sort((left, right) => left.ordinal - right.ordinal),
		}))
		.sort((left, right) => left.field_key.localeCompare(right.field_key));
}

export function relationshipTargetLabel(
	relationship: NoteRelationship,
): string {
	return (
		relationship.target_title ||
		relationship.to_title ||
		relationship.to_id ||
		"Untitled"
	);
}
