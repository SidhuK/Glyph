import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	buildReleaseManifest,
	collectReleaseNoteEntries,
	extractReleaseNoteEntries,
	formatReleaseNotesMarkdown,
	generateReleaseNotesArtifacts,
	writeReleaseManifestTs,
} from "../../scripts/release-notes-lib.mjs";
import { resolveWhatsNewState } from "./releaseNotes";

describe("release note generator", () => {
	it("extracts release-note trailers with category", () => {
		expect(
			extractReleaseNoteEntries(`Fix template path normalization

Release-note: Daily note templates now handle nested template folders correctly.
Release-category: Fixed`),
		).toEqual([
			{
				category: "Fixed",
				text: "Daily note templates now handle nested template folders correctly.",
			},
		]);
	});

	it("supports category lines before the note trailers too", () => {
		expect(
			extractReleaseNoteEntries(`Fix template path normalization

Release-category: Fixed
Release-note: Daily note templates now handle nested template folders correctly.`),
		).toEqual([
			{
				category: "Fixed",
				text: "Daily note templates now handle nested template folders correctly.",
			},
		]);
	});

	it("defaults unknown categories to Improved", () => {
		expect(
			extractReleaseNoteEntries(`Refactor things

Release-note: The command palette feels cleaner and more consistent.
Release-category: Polished`),
		).toEqual([
			{
				category: "Improved",
				text: "The command palette feels cleaner and more consistent.",
			},
		]);
	});

	it("ignores unknown categories instead of overwriting the current category", () => {
		expect(
			extractReleaseNoteEntries(`Mixed release copy

Release-category: Fixed
Release-category: Addded
Release-note: Fixed the startup crash.`),
		).toEqual([
			{
				category: "Fixed",
				text: "Fixed the startup crash.",
			},
		]);
	});

	it("applies categories to notes in sequence instead of collapsing to the last one", () => {
		expect(
			extractReleaseNoteEntries(`Mixed release copy

Release-category: Added
Release-note: Added note templates.
Release-category: Fixed
Release-note: Fixed the template reset race.`),
		).toEqual([
			{
				category: "Added",
				text: "Added note templates.",
			},
			{
				category: "Fixed",
				text: "Fixed the template reset race.",
			},
		]);
	});

	it("ignores commits without release-note trailers", () => {
		expect(
			collectReleaseNoteEntries([
				{
					hash: "abc123",
					body: "Fix template path normalization",
				},
			]),
		).toEqual([]);
	});

	it("emits sections in stable category order with maintenance fallback", () => {
		expect(
			buildReleaseManifest({
				version: "0.2.0",
				publishedAt: "2026-03-19T00:00:00.000Z",
				entries: [
					{ category: "Fixed", text: "Resolved a crash while exporting HTML." },
					{ category: "Added", text: "Added HTML export for markdown notes." },
				],
			}),
		).toEqual({
			version: "0.2.0",
			publishedAt: "2026-03-19T00:00:00.000Z",
			sections: [
				{ category: "Added", items: ["Added HTML export for markdown notes."] },
				{
					category: "Fixed",
					items: ["Resolved a crash while exporting HTML."],
				},
			],
		});

		expect(
			buildReleaseManifest({
				version: "0.2.1",
				publishedAt: null,
				entries: [],
			}),
		).toEqual({
			version: "0.2.1",
			publishedAt: null,
			sections: [
				{
					category: "Improved",
					items: ["Maintenance and polish release."],
				},
			],
		});
	});

	it("formats markdown from the structured manifest", () => {
		expect(
			formatReleaseNotesMarkdown(
				{
					version: "0.2.0",
					publishedAt: null,
					sections: [
						{ category: "Added", items: ["Added note templates."] },
						{ category: "Fixed", items: ["Fixed a startup race."] },
					],
				},
				"Official build licensing copy.",
			),
		).toContain("### Added");
		expect(
			formatReleaseNotesMarkdown(
				{
					version: "0.2.0",
					publishedAt: null,
					sections: [
						{ category: "Added", items: ["Added note templates."] },
						{ category: "Fixed", items: ["Fixed a startup race."] },
					],
				},
				"Official build licensing copy.",
			),
		).toContain("## Licensing");
	});

	it("fails fast when nextTag is missing", () => {
		expect(() =>
			generateReleaseNotesArtifacts({
				nextTag: "",
			}),
		).toThrowError("nextTag is required to generate release artifacts");
	});

	it("writes a biome-formatted TypeScript manifest", () => {
		const tempDir = mkdtempSync(path.join(tmpdir(), "glyph-release-notes-"));
		const outputPath = path.join(tempDir, "currentReleaseNotes.ts");

		try {
			writeReleaseManifestTs(
				{
					version: "0.2.0",
					publishedAt: "2026-03-19T04:19:28.156Z",
					sections: [
						{
							category: "Improved",
							items: ["Maintenance and polish release."],
						},
					],
				},
				outputPath,
			);

			expect(readFileSync(outputPath, "utf8")).toContain('version: "0.2.0"');
			expect(readFileSync(outputPath, "utf8")).not.toContain('"version":');
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});

describe("resolveWhatsNewState", () => {
	it("seeds the current version on first install without auto-opening", () => {
		expect(
			resolveWhatsNewState({
				appVersion: "0.1.10",
				manifestVersion: "0.1.10",
				lastAcknowledgedVersion: null,
			}),
		).toEqual({
			available: true,
			shouldSeedVersion: true,
			shouldAutoOpen: false,
		});
	});

	it("opens after an upgrade when the manifest matches the running version", () => {
		expect(
			resolveWhatsNewState({
				appVersion: "0.1.11",
				manifestVersion: "0.1.11",
				lastAcknowledgedVersion: "0.1.10",
			}),
		).toEqual({
			available: true,
			shouldSeedVersion: false,
			shouldAutoOpen: true,
		});
	});

	it("suppresses the dialog when the manifest does not match the running version", () => {
		expect(
			resolveWhatsNewState({
				appVersion: "0.1.11",
				manifestVersion: "0.1.10",
				lastAcknowledgedVersion: "0.1.10",
			}),
		).toEqual({
			available: false,
			shouldSeedVersion: false,
			shouldAutoOpen: false,
		});
	});
});
