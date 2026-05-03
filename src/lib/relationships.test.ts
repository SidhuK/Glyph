import { describe, expect, it } from "vitest";
import {
	groupRelationshipsByField,
	relationshipTargetLabel,
} from "./relationships";
import type { NoteRelationship } from "./tauri";

function relationship(
	field_key: string,
	target_title: string,
	ordinal: number,
): NoteRelationship {
	return {
		from_id: "source.md",
		field_key,
		to_id: null,
		to_title: target_title,
		target_title,
		ordinal,
	};
}

describe("relationships", () => {
	it("groups by field and preserves ordinal order", () => {
		const groups = groupRelationshipsByField([
			relationship("related", "B", 1),
			relationship("project", "A", 0),
			relationship("related", "A", 0),
		]);

		expect(groups.map((group) => group.field_key)).toEqual([
			"project",
			"related",
		]);
		expect(groups[1].items.map((item) => item.target_title)).toEqual([
			"A",
			"B",
		]);
	});

	it("uses the durable frontmatter target as the display label", () => {
		expect(relationshipTargetLabel(relationship("project", "Launch", 0))).toBe(
			"Launch",
		);
	});
});
