export interface ReleaseNotesManifestData {
	version: string;
	commits: string[];
}

export function generateReleaseNotesArtifacts(args: {
	repoRoot?: string;
	latestTag?: string;
	nextTag: string;
}): {
	manifest: ReleaseNotesManifestData;
	markdown: string;
};
