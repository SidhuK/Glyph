import { describe, expect, it } from "vitest";
import { buildTemplateVariables, renderTemplate } from "./templates";

describe("buildTemplateVariables", () => {
	it("derives title and destination metadata from the destination path", () => {
		const variables = buildTemplateVariables({
			destinationPath: "projects/my-new-note.md",
			spaceRootPath: "/Users/tester/Notes",
			date: new Date(2026, 2, 18, 9, 5, 7),
		});

		expect(variables.title).toBe("my new note");
		expect(variables.title_slug).toBe("my-new-note");
		expect(variables.file_name).toBe("my-new-note.md");
		expect(variables.file_stem).toBe("my-new-note");
		expect(variables.destination_dir).toBe("projects");
		expect(variables.space_name).toBe("Notes");
	});

	it("renders expansive date and time built-ins from the provided date", () => {
		const variables = buildTemplateVariables({
			destinationPath: "daily/2026-03-18.md",
			date: new Date(2026, 2, 18, 9, 5, 7),
		});

		expect(variables.date).toBe("2026-03-18");
		expect(variables.time).toBe("09:05");
		expect(variables.datetime).toBe("2026-03-18 09:05:07");
		expect(variables.year).toBe("2026");
		expect(variables.month).toBe("03");
		expect(variables.month_name).toBe("March");
		expect(variables.month_short).toBe("Mar");
		expect(variables.day).toBe("18");
		expect(variables.weekday).toBe("Wednesday");
		expect(variables.weekday_short).toBe("Wed");
		expect(variables.hour).toBe("09");
		expect(variables.minute).toBe("05");
		expect(variables.second).toBe("07");
		expect(variables.iso_week).toBe("12");
		expect(variables.quarter).toBe("1");
	});
});

describe("renderTemplate", () => {
	it("replaces supported built-ins and keeps unknown placeholders intact", () => {
		const rendered = renderTemplate(
			[
				"# {{title}}",
				"- Slug: {{ title_slug }}",
				"- Path: {{destination_path}}",
				"- Space: {{space_name}}",
				"- Date: {{date}}",
				"- Unknown: {{custom_field}}",
			].join("\n"),
			{
				destinationPath: "projects/my-note.md",
				spaceRootPath: "/Users/tester/Glyph Space",
				date: new Date(2026, 0, 2, 11, 22, 33),
			},
		);

		expect(rendered).toContain("# my note");
		expect(rendered).toContain("- Slug: my-note");
		expect(rendered).toContain("- Path: projects/my-note.md");
		expect(rendered).toContain("- Space: Glyph Space");
		expect(rendered).toContain("- Date: 2026-01-02");
		expect(rendered).toContain("- Unknown: {{custom_field}}");
	});
});
