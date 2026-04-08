export interface ReleaseNotesManifestData {
	version: string;
	publishedAt: string | null;
	commits: string[];
}

export function generateReleaseNotesArtifacts(args: {
	repoRoot?: string;
	latestTag?: string;
	nextTag: string;
	publishedAt?: string;
}): {
	manifest: ReleaseNotesManifestData;
	markdown: string;
};
