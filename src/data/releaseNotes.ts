import type { ReleaseNoteCategory } from "../lib/releaseNotes";

export interface VersionReleaseNotes {
	version: string;
	sections: {
		category: ReleaseNoteCategory;
		items: string[];
	}[];
}

export interface ChangelogData {
	versions: VersionReleaseNotes[];
}

import changelogJson from "./release-notes.json";

export const MAX_CHANGELOG_VERSIONS = 6;

const changelogData = changelogJson as ChangelogData;

export const CHANGELOG_DATA: ChangelogData = {
	...changelogData,
	versions: changelogData.versions.slice(0, MAX_CHANGELOG_VERSIONS),
};
