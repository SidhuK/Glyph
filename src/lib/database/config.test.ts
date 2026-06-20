import { describe, expect, it } from "vitest";
import { createPropertyColumn } from "./config";

describe("database config helpers", () => {
	it("assigns default icons to property columns from their kind", () => {
		expect(
			createPropertyColumn({
				key: "status",
				kind: "checkbox",
				count: 1,
			}).icon,
		).toBe("check-circle");
	});
});
