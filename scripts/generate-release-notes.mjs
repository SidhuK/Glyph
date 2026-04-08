import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateReleaseNotesArtifacts } from "./release-notes-lib.mjs";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const latestTag = process.env.LATEST_TAG ?? "";
const nextTag =
	process.env.NEXT_TAG ?? `v${process.env.npm_package_version ?? "0.0.0"}`;
const publishedAt = process.env.PUBLISHED_AT ?? new Date().toISOString();
const releaseNotesOutputPath =
	process.env.RELEASE_NOTES_OUT ?? `${REPO_ROOT}/RELEASE_NOTES.md`;

const { markdown } = generateReleaseNotesArtifacts({
	repoRoot: REPO_ROOT,
	latestTag,
	nextTag,
	publishedAt,
});

writeFileSync(releaseNotesOutputPath, markdown, "utf8");
