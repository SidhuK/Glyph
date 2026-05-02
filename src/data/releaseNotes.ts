import type { ReleaseNoteCategory } from "../lib/releaseNotes";
import changelogJson from "./release-notes.json";

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

export const CHANGELOG_DATA = changelogJson as ChangelogData;
