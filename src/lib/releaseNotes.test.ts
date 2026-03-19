import { describe, expect, it } from "vitest";
import {
	buildReleaseManifest,
	collectFallbackReleaseEntries,
	collectReleaseEntries,
	collectReleaseNoteEntries,
	extractReleaseNoteEntries,
	formatReleaseNotesMarkdown,
	generateReleaseNotesArtifacts,
	renderReleaseManifestTs,
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

	it("falls back to commit subjects when no release-note trailers exist", () => {
		expect(
			collectReleaseEntries([
				{
					hash: "abc123",
					body: "Add HTML export for markdown notes",
				},
				{
					hash: "def456",
					body: "Fix startup race in note switching",
				},
			]),
		).toEqual([
			{
				hash: "abc123",
				category: "Added",
				text: "Add HTML export for markdown notes",
			},
			{
				hash: "def456",
				category: "Fixed",
				text: "Fix startup race in note switching",
			},
		]);
	});

	it("prefers curated release-note trailers over commit-subject fallback", () => {
		expect(
			collectReleaseEntries([
				{
					hash: "abc123",
					body: `Add HTML export for markdown notes

Release-category: Added
Release-note: Added HTML export for markdown notes.`,
				},
				{
					hash: "def456",
					body: "Fix startup race in note switching",
				},
			]),
		).toEqual([
			{
				hash: "abc123",
				category: "Added",
				text: "Added HTML export for markdown notes.",
			},
		]);
	});

	it("uses non-release commit subjects first and deduplicates fallback entries", () => {
		expect(
			collectFallbackReleaseEntries([
				{
					hash: "abc123",
					body: "[Release] Improved release notes formatting",
				},
				{
					hash: "def456",
					body: "Add HTML export for markdown notes",
				},
				{
					hash: "ghi789",
					body: "Add HTML export for markdown notes",
				},
			]),
		).toEqual([
			{
				hash: "def456",
				category: "Added",
				text: "Add HTML export for markdown notes",
			},
		]);
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
		const rendered = renderReleaseManifestTs(
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
			"../lib/releaseNotes",
		);

		expect(rendered).toContain('version: "0.2.0"');
		expect(rendered).not.toContain('"version":');
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
