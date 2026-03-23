import { describe, expect, it } from "vitest";
import { insertTaskIntoDailyNote } from "./calendar";

describe("insertTaskIntoDailyNote", () => {
	it("creates a tasks section when the note has none", () => {
		expect(
			insertTaskIntoDailyNote("# 2026-03-23\n", "Ship planner", "2026-03-23"),
		).toContain("## Tasks\n\n- [ ] Ship planner ⏳ 2026-03-23\n");
	});

	it("inserts inside an existing tasks section", () => {
		const markdown =
			"# 2026-03-23\n\n## Tasks\n\n- [ ] Existing task ⏳ 2026-03-23\n\n## Notes\n\nBody\n";
		const next = insertTaskIntoDailyNote(markdown, "New task", "2026-03-23");
		expect(next).toContain(
			"- [ ] Existing task ⏳ 2026-03-23\n\n- [ ] New task ⏳ 2026-03-23\n\n## Notes",
		);
	});

	it("preserves CRLF files", () => {
		const markdown = "# 2026-03-23\r\n\r\n";
		const next = insertTaskIntoDailyNote(
			markdown,
			"Windows task",
			"2026-03-23",
		);
		expect(next).toContain(
			"\r\n## Tasks\r\n\r\n- [ ] Windows task ⏳ 2026-03-23\r\n",
		);
	});
});
