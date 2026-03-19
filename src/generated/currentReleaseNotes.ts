import type { ReleaseNotesManifest } from "../lib/releaseNotes";

export const currentReleaseNotes = {
	version: "0.1.10",
	publishedAt: null,
	sections: [
		{
			category: "Improved",
			items: ["Maintenance and polish release."],
		},
	],
} satisfies ReleaseNotesManifest;
