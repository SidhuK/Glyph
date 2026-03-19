import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RELEASE_NOTE_CATEGORY_ORDER = [
	"Added",
	"Improved",
	"Fixed",
	"Removed",
];

const VALID_CATEGORIES = new Set(RELEASE_NOTE_CATEGORY_ORDER);
const DEFAULT_CATEGORY = "Improved";
const DEFAULT_MAINTENANCE_NOTE = "Maintenance and polish release.";
const FIELD_SEPARATOR = "\u0000";
const RECORD_SEPARATOR = "\u001e";
const DEFAULT_REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

function toVersionString(value) {
	return String(value ?? "")
		.trim()
		.replace(/^v/i, "");
}

function toVersionLabel(value) {
	const version = toVersionString(value);
	return version ? `v${version}` : "v0.0.0";
}

function normalizeCategory(value) {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase();
	if (normalized === "added" || normalized === "add") return "Added";
	if (
		normalized === "improved" ||
		normalized === "improve" ||
		normalized === "changed" ||
		normalized === "change"
	) {
		return "Improved";
	}
	if (
		normalized === "fixed" ||
		normalized === "fix" ||
		normalized === "bugfix" ||
		normalized === "bug"
	) {
		return "Fixed";
	}
	if (
		normalized === "removed" ||
		normalized === "remove" ||
		normalized === "deprecated"
	) {
		return "Removed";
	}
	return DEFAULT_CATEGORY;
}

export function extractReleaseNoteEntries(commitBody) {
	const items = [];
	let category = DEFAULT_CATEGORY;
	let categoryPinned = false;
	let pendingNoteIndexes = [];

	for (const line of String(commitBody ?? "").split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const categoryMatch = /^Release-category:\s*(.+)$/i.exec(trimmed);
		if (categoryMatch) {
			category = normalizeCategory(categoryMatch[1]);
			if (pendingNoteIndexes.length > 0) {
				for (const index of pendingNoteIndexes) {
					items[index].category = category;
				}
				pendingNoteIndexes = [];
			}
			categoryPinned = true;
			continue;
		}

		const noteMatch = /^Release-note:\s*(.+)$/i.exec(trimmed);
		if (noteMatch) {
			const text = noteMatch[1].trim();
			if (text) {
				const entry = {
					category,
					text,
				};
				items.push(entry);
				if (!categoryPinned) {
					pendingNoteIndexes.push(items.length - 1);
				}
			}
		}
	}

	return items;
}

export function parseGitLogOutput(output) {
	return String(output ?? "")
		.split(RECORD_SEPARATOR)
		.map((record) => record.trim())
		.filter(Boolean)
		.map((record) => record.split(FIELD_SEPARATOR))
		.filter((parts) => parts.length >= 2 && parts[0] && parts[1])
		.map(([hash, body]) => ({
			hash,
			body,
		}));
}

export function collectReleaseNoteEntries(commits) {
	const entries = [];

	for (const commit of commits) {
		for (const item of extractReleaseNoteEntries(commit.body)) {
			entries.push({
				hash: commit.hash,
				category: item.category,
				text: item.text,
			});
		}
	}

	return entries;
}

export function buildReleaseManifest({ version, publishedAt = null, entries }) {
	const grouped = new Map(
		RELEASE_NOTE_CATEGORY_ORDER.map((category) => [category, []]),
	);

	for (const entry of entries) {
		const category = VALID_CATEGORIES.has(entry.category)
			? entry.category
			: DEFAULT_CATEGORY;
		const text = String(entry.text ?? "").trim();
		if (!text) continue;
		grouped.get(category)?.push(text);
	}

	const sections = RELEASE_NOTE_CATEGORY_ORDER.map((category) => ({
		category,
		items: grouped.get(category) ?? [],
	})).filter((section) => section.items.length > 0);

	return {
		version,
		publishedAt,
		sections:
			sections.length > 0
				? sections
				: [{ category: DEFAULT_CATEGORY, items: [DEFAULT_MAINTENANCE_NOTE] }],
	};
}

export function formatReleaseNotesMarkdown(manifest, licensingMarkdown = "") {
	const lines = [`## Changes in ${toVersionLabel(manifest.version)}`, ""];

	for (const section of manifest.sections) {
		lines.push(`### ${section.category}`);
		lines.push("");
		for (const item of section.items) {
			lines.push(`- ${item}`);
		}
		lines.push("");
	}

	const trimmedLicensing = String(licensingMarkdown ?? "").trim();
	if (trimmedLicensing) {
		lines.push("## Licensing");
		lines.push("");
		lines.push(trimmedLicensing);
		lines.push("");
	}

	return `${lines.join("\n").trim()}\n`;
}

function extractLicensingMarkdown(docText) {
	const lines = String(docText ?? "").split(/\r?\n/);
	const startIndex = lines.findIndex((line) =>
		/^\s*> Official Glyph binaries/.test(line),
	);
	if (startIndex < 0) return "";

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

	return collected.join("\n").trim();
}

function runGitLog(range, repoRoot) {
	const pretty = "%H%x00%B%x1e";
	const args = ["log"];
	if (range && range !== "HEAD") {
		args.push(range);
	}
	args.push("--no-merges", `--pretty=format:${pretty}`);

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

export function generateReleaseNotesArtifacts({
	repoRoot = DEFAULT_REPO_ROOT,
	latestTag = "",
	nextTag,
	publishedAt = new Date().toISOString(),
}) {
	const version = toVersionString(nextTag);
	if (!version) {
		throw new Error("nextTag is required to generate release artifacts");
	}

	const range = latestTag ? `${latestTag}..HEAD` : "HEAD";
	const commits = parseGitLogOutput(runGitLog(range, repoRoot));
	const entries = collectReleaseNoteEntries(commits);
	const manifest = buildReleaseManifest({
		version,
		publishedAt,
		entries,
	});
	const licensingDocPath = `${repoRoot}/docs/release-notes-licensed-binaries.md`;
	let licensingDoc = "";
	if (existsSync(licensingDocPath)) {
		licensingDoc = readFileSync(licensingDocPath, "utf8");
	} else {
		console.warn(
			`Release notes licensing doc not found at ${licensingDocPath}; continuing without licensing copy.`,
		);
	}
	const markdown = formatReleaseNotesMarkdown(
		manifest,
		extractLicensingMarkdown(licensingDoc),
	);

	return {
		manifest,
		markdown,
	};
}

export function writeReleaseManifestTs(manifest, outputPath) {
	const releaseNotesPath = path.join(
		DEFAULT_REPO_ROOT,
		"src",
		"lib",
		"releaseNotes.ts",
	);
	const relativeImportPath = path
		.relative(path.dirname(outputPath), releaseNotesPath)
		.replaceAll(path.sep, "/")
		.replace(/\.ts$/, "");
	const importPath = relativeImportPath.startsWith(".")
		? relativeImportPath
		: `./${relativeImportPath}`;
	const serialized = JSON.stringify(manifest, null, "\t");
	const source = [
		`import type { ReleaseNotesManifest } from "${importPath}";`,
		"",
		`export const currentReleaseNotes = ${serialized} satisfies ReleaseNotesManifest;`,
		"",
	].join("\n");
	writeFileSync(outputPath, source, "utf8");
}
