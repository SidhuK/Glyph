export const RELEASE_NOTE_CATEGORIES = [
	"Added",
	"Improved",
	"Fixed",
	"Removed",
] as const;

export type ReleaseNoteCategory = (typeof RELEASE_NOTE_CATEGORIES)[number];

export const PUBLIC_CHANGELOG_URL = "https://glyphformac.com/changelog";
