export interface ReleaseNoteEntry {
	hash: string;
	category: string;
	text: string;
}

export interface ReleaseNoteCommit {
	hash: string;
	body: string;
}

export interface ReleaseNotesManifestData {
	version: string;
	publishedAt: string | null;
	sections: Array<{
		category: string;
		items: string[];
	}>;
}

export const RELEASE_NOTE_CATEGORY_ORDER: string[];

export function extractReleaseNoteEntries(
	commitBody: string,
): Array<{ category: string; text: string }>;

export function parseGitLogOutput(output: string): ReleaseNoteCommit[];

export function collectReleaseNoteEntries(
	commits: ReleaseNoteCommit[],
): ReleaseNoteEntry[];

export function collectFallbackReleaseEntries(
	commits: ReleaseNoteCommit[],
): ReleaseNoteEntry[];

export function collectReleaseEntries(
	commits: ReleaseNoteCommit[],
): ReleaseNoteEntry[];

export function buildReleaseManifest(args: {
	version: string;
	publishedAt?: string | null;
	entries: Array<{ category: string; text: string }>;
}): ReleaseNotesManifestData;

export function formatReleaseNotesMarkdown(
	manifest: ReleaseNotesManifestData,
	licensingMarkdown?: string,
): string;

export function generateReleaseNotesArtifacts(args: {
	repoRoot?: string;
	latestTag?: string;
	nextTag: string;
	publishedAt?: string;
}): {
	manifest: ReleaseNotesManifestData;
	markdown: string;
};

export function writeReleaseManifestTs(
	manifest: ReleaseNotesManifestData,
	outputPath: string,
): void;

export function renderReleaseManifestTs(
	manifest: ReleaseNotesManifestData,
	importPath: string,
): string;
