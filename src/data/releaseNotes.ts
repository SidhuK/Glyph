import type { ReleaseNoteCategory } from "../lib/releaseNotes";

export interface VersionReleaseNotes {
	version: string;
	publishedAt: string;
	sections: {
		category: ReleaseNoteCategory;
		items: string[];
	}[];
}

export interface ChangelogData {
	versions: VersionReleaseNotes[];
}

import changelogJson from "./release-notes.json";

export const CHANGELOG_DATA: ChangelogData = changelogJson as ChangelogData;
