export const RELEASE_NOTE_CATEGORIES = [
	"Added",
	"Improved",
	"Fixed",
	"Removed",
] as const;

export type ReleaseNoteCategory = (typeof RELEASE_NOTE_CATEGORIES)[number];

export interface ReleaseNotesSection {
	category: ReleaseNoteCategory;
	items: string[];
}

export interface ReleaseNotesManifest {
	version: string;
	publishedAt: string | null;
	sections: ReleaseNotesSection[];
}

export interface WhatsNewResolution {
	available: boolean;
	shouldSeedVersion: boolean;
	shouldAutoOpen: boolean;
}

export const PUBLIC_CHANGELOG_URL = "https://glyphformac.com/changelog";

export function resolveWhatsNewState({
	appVersion,
	manifestVersion,
	lastAcknowledgedVersion,
}: {
	appVersion: string | null;
	manifestVersion: string;
	lastAcknowledgedVersion: string | null;
}): WhatsNewResolution {
	if (!appVersion || appVersion !== manifestVersion) {
		return {
			available: false,
			shouldSeedVersion: false,
			shouldAutoOpen: false,
		};
	}

	if (!lastAcknowledgedVersion) {
		return {
			available: true,
			shouldSeedVersion: true,
			shouldAutoOpen: false,
		};
	}

	return {
		available: true,
		shouldSeedVersion: false,
		shouldAutoOpen: lastAcknowledgedVersion !== appVersion,
	};
}
