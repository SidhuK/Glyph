import { describe, expect, it } from "vitest";
import type { DatabaseColumn, DatabaseRow } from "../../lib/database/types";
import { compareDatabaseRowValues } from "./useDatabaseTable";

const numberColumn: DatabaseColumn = {
	id: "property:estimate",
	type: "property",
	label: "Estimate",
	visible: true,
	property_key: "estimate",
	property_kind: "number",
};

const datetimeColumn: DatabaseColumn = {
	id: "property:due",
	type: "property",
	label: "Due",
	visible: true,
	property_key: "due",
	property_kind: "datetime",
};

function rowWithProperty(
	note_path: string,
	key: string,
	kind: string,
	value_text: string,
): DatabaseRow {
	return {
		note_path,
		title: note_path,
		created: "2024-01-01T00:00:00Z",
		updated: "2024-01-01T00:00:00Z",
		tags: [],
		properties: {
			[key]: {
				kind,
				value_text,
				value_list: [],
			},
		},
	};
}

describe("compareDatabaseRowValues", () => {
	it("sorts numeric properties numerically", () => {
		const low = rowWithProperty("low.md", "estimate", "number", "2");
		const high = rowWithProperty("high.md", "estimate", "number", "10");

		expect(compareDatabaseRowValues(low, high, numberColumn)).toBeLessThan(0);
	});

	it("sorts datetime properties chronologically", () => {
		const early = rowWithProperty(
			"early.md",
			"due",
			"datetime",
			"2024-01-02T00:00:00Z",
		);
		const late = rowWithProperty(
			"late.md",
			"due",
			"datetime",
			"2024-02-01T00:00:00Z",
		);

		expect(compareDatabaseRowValues(early, late, datetimeColumn)).toBeLessThan(
			0,
		);
	});
});
