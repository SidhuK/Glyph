import { describe, expect, it } from "vitest";
import { findDecoratedTokens } from "./tagDecorations";

describe("findDecoratedTokens", () => {
	it("finds tag and person tokens but skips emails", () => {
		expect(
			findDecoratedTokens(
				"Reach out to @alice about #roadmap, not alice@example.com",
			),
		).toEqual([
			{ kind: "tag", value: "roadmap" },
			{ kind: "person", value: "alice" },
		]);
	});
});
