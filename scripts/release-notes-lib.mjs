import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

function runGitLog(range, repoRoot) {
	const args = ["log", "--no-merges", "--pretty=format:%s"];
	if (range && range !== "HEAD") {
		args.push(range);
	}

	try {
		return execFileSync("git", args, {
			cwd: repoRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (error) {
		const stderr =
			error && typeof error === "object" && "stderr" in error
				? String(error.stderr ?? "").trim()
				: "";
		const stdout =
			error && typeof error === "object" && "stdout" in error
				? String(error.stdout ?? "").trim()
				: "";
		const details = [stderr, stdout].filter(Boolean).join("\n");
		throw new Error(
			details
				? `Failed to read git history for release notes:\n${details}`
				: "Failed to read git history for release notes.",
		);
	}
}

function extractLicensingMarkdown(docText) {
	const lines = String(docText ?? "").split(/\r?\n/);
	const startIndex = lines.findIndex((line) =>
		/^\s*> Official Glyph binaries/.test(line),
	);
	if (startIndex < 0) {
		console.warn(
			"Release notes licensing block not found; continuing without licensing copy.",
		);
		return "";
	}

	const collected = [];
	for (let index = startIndex; index < lines.length; index += 1) {
		const line = lines[index];
		if (line.trim() === "" && collected.length > 0) break;
		if (!/^\s*>/.test(line)) {
			if (collected.length > 0) break;
			continue;
		}
		collected.push(line.replace(/^\s*>\s?/, ""));
	}

	const markdown = collected.join("\n").trim();
	if (!markdown) {
		console.warn(
			"Release notes licensing block was empty; continuing without licensing copy.",
		);
	}
	return markdown;
}

export function generateReleaseNotesArtifacts({
	repoRoot = DEFAULT_REPO_ROOT,
	latestTag = "",
	nextTag,
	publishedAt = new Date().toISOString(),
}) {
	const range = latestTag ? `${latestTag}..HEAD` : "HEAD";
	const logOutput = runGitLog(range, repoRoot);
	const commits = logOutput
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("Merge "));

	const version = String(nextTag ?? "").replace(/^v/i, "") || "0.0.0";

	const lines = [`## Changes in v${version}`, ""];

	for (const commit of commits) {
		lines.push(`- ${commit}`);
	}
	lines.push("");

	const licensingDocPath = `${repoRoot}/docs/release-notes-licensed-binaries.md`;
	let licensingDoc = "";
	if (existsSync(licensingDocPath)) {
		licensingDoc = readFileSync(licensingDocPath, "utf8");
	}

	const trimmedLicensing = extractLicensingMarkdown(licensingDoc).trim();
	if (trimmedLicensing) {
		lines.push("## Licensing");
		lines.push("");
		lines.push(trimmedLicensing);
		lines.push("");
	}

	const markdown = `${lines.join("\n").trim()}\n`;

	return {
		manifest: { version, publishedAt, commits },
		markdown,
	};
}
