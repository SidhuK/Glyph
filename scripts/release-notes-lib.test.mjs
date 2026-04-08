import { describe, expect, it } from "vitest";
import { generateReleaseNotesArtifacts } from "./release-notes-lib.mjs";

describe("generateReleaseNotesArtifacts", () => {
	it("throws when nextTag is missing", () => {
		expect(() =>
			generateReleaseNotesArtifacts({
				repoRoot: "/tmp",
				nextTag: "",
			}),
		).toThrowError("nextTag is required to generate release artifacts");
	});
});
