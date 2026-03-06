import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface ChangelogEntry {
	hash: string;
	shortHash: string;
	date: string;
	message: string;
	category: string;
}

export interface ChangelogData {
	latestTag: string | null;
	previousTag: string | null;
	releasedEntries: ChangelogEntry[];
	unreleasedEntries: ChangelogEntry[];
}

export interface ChangelogRelease {
	tag: string;
	previousTag: string | null;
	entries: ChangelogEntry[];
}

export interface ChangelogPageData extends ChangelogData {
	repositoryUrl: string | null;
	releaseHistory: ChangelogRelease[];
}

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const FIELD_SEPARATOR = "\u001f";
const LINE_SEPARATOR = "\u001e";

function runGit(command: string): string {
	try {
		return execFileSync("sh", ["-lc", command], {
			cwd: REPO_ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "";
	}
}

function categorizeCommit(message: string): string {
	const lower = message.toLowerCase();
	if (
		lower.startsWith("fix") ||
		lower.includes(" bug") ||
		lower.includes("cursor") ||
		lower.includes("crash")
	) {
		return "Fix";
	}
	if (
		lower.startsWith("add") ||
		lower.startsWith("implement") ||
		lower.startsWith("create")
	) {
		return "Added";
	}
	if (
		lower.startsWith("update") ||
		lower.startsWith("polish") ||
		lower.startsWith("improve") ||
		lower.startsWith("refine")
	) {
		return "Improved";
	}
	if (lower.startsWith("refactor") || lower.startsWith("extract")) {
		return "Refactor";
	}
	if (lower.startsWith("release")) {
		return "Release";
	}
	return "Progress";
}

function parseLogOutput(output: string): ChangelogEntry[] {
	if (!output) return [];
	return output
		.split(LINE_SEPARATOR)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => line.split(FIELD_SEPARATOR))
		.filter((parts) => parts.length >= 3 && parts[0] && parts[1] && parts[2])
		.map(([hash, date, ...messageParts]) => {
			const message = messageParts.join(FIELD_SEPARATOR).trim();
			return {
				hash,
				shortHash: hash.slice(0, 7),
				date,
				message,
				category: categorizeCommit(message),
			};
		});
}

function getTags(): { latestTag: string | null; previousTag: string | null } {
	const tags = listTags();

	return {
		latestTag: tags[0] ?? null,
		previousTag: tags[1] ?? null,
	};
}

function listTags(): string[] {
	return runGit("git tag --sort=-version:refname")
		.split("\n")
		.map((tag) => tag.trim())
		.filter(Boolean);
}

function getRepositoryUrl(): string | null {
	const remote = runGit("git remote get-url origin");
	if (!remote) return null;

	if (remote.startsWith("git@github.com:")) {
		return `https://github.com/${remote
			.replace("git@github.com:", "")
			.replace(/\.git$/, "")}`;
	}

	if (remote.startsWith("https://github.com/")) {
		return remote.replace(/\.git$/, "");
	}

	return null;
}

function getLog(range: string, limit = 8): ChangelogEntry[] {
	const pretty = `%H%x1f%ad%x1f%s%x1e`;
	const output = runGit(
		`git log ${range} --no-merges --date=short --pretty=format:'${pretty}' -n ${limit}`,
	);
	return parseLogOutput(output);
}

export function getChangelogData(): ChangelogData {
	const { latestTag, previousTag } = getTags();

	if (!latestTag) {
		return {
			latestTag: null,
			previousTag: null,
			releasedEntries: [],
			unreleasedEntries: getLog("HEAD", 8),
		};
	}

	return {
		latestTag,
		previousTag,
		releasedEntries: previousTag ? getLog(`${previousTag}..${latestTag}`, 10) : [],
		unreleasedEntries: getLog(`${latestTag}..HEAD`, 8),
	};
}

export function getChangelogPageData(limit = 8): ChangelogPageData {
	const tags = listTags();
	const base = getChangelogData();
	const releaseHistory: ChangelogRelease[] = [];

	for (let index = 0; index < Math.min(tags.length, limit); index += 1) {
		const tag = tags[index];
		const previousTag = tags[index + 1] ?? null;
		const entries = previousTag ? getLog(`${previousTag}..${tag}`, 12) : [];

		releaseHistory.push({
			tag,
			previousTag,
			entries,
		});
	}

	return {
		...base,
		repositoryUrl: getRepositoryUrl(),
		releaseHistory,
	};
}
