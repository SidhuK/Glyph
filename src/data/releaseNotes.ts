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

// Import the JSON data with type assertion
import changelogJson from "./release-notes.json";

export const CHANGELOG_DATA: ChangelogData = changelogJson as ChangelogData;

export function getLatestVersion(): VersionReleaseNotes | undefined {
	return CHANGELOG_DATA.versions[0];
}

export function getVersion(version: string): VersionReleaseNotes | undefined {
	return CHANGELOG_DATA.versions.find((v) => v.version === version);
}
