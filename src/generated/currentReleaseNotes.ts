import type { ReleaseNotesManifest } from "../lib/releaseNotes";

export const currentReleaseNotes = {
	version: "0.2.1",
	publishedAt: "2026-04-03T11:33:34.774Z",
	sections: [
		{
			category: "Improved",
			items: [
				"Polish settings and database UI",
				"chore(website): update download link to v0.1.73",
			],
		},
		{
			category: "Fixed",
			items: ["Fix database and settings UI regressions"],
		},
	],
} satisfies ReleaseNotesManifest;
