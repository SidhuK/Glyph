import type { FsEntry } from "../../lib/tauri";
import { normalizeRelPath, parentDir } from "../../utils/path";

export function basename(path: string): string {
	const parts = path.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

export function fileTitleFromPath(path: string): string {
	return basename(path).replace(/\.md$/i, "").trim() || "Untitled";
}

export function normalizeWikiLinkTarget(target: string): string {
	return target.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

export function resolveWikiLinkPath(
	target: string,
	entries: FsEntry[],
): string | null {
	const normalized = normalizeWikiLinkTarget(target).replace(/\.md$/i, "");
	if (!normalized) return null;
	const lowered = normalized.toLowerCase();

	const exactPath = entries.find(
		(entry) => entry.rel_path.replace(/\.md$/i, "").toLowerCase() === lowered,
	);
	if (exactPath) return exactPath.rel_path;

	const exactTitle = entries.find((entry) => {
		const title = fileTitleFromPath(entry.rel_path).toLowerCase();
		return title === lowered;
	});
	if (exactTitle) return exactTitle.rel_path;

	const suffixPath = entries.find((entry) =>
		entry.rel_path.replace(/\.md$/i, "").toLowerCase().endsWith(`/${lowered}`),
	);
	return suffixPath?.rel_path ?? null;
}

function normalizeSegments(path: string): string {
	const stack: string[] = [];
	for (const part of path.split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") {
			stack.pop();
			continue;
		}
		stack.push(part);
	}
	return stack.join("/");
}

export function resolveMarkdownLinkPath(
	href: string,
	sourcePath: string,
	entries: FsEntry[],
): string | null {
	const raw = href.split("#", 1)[0]?.trim().replace(/\\/g, "/") ?? "";
	if (!raw || raw.startsWith("http://") || raw.startsWith("https://")) {
		return null;
	}
	const sourceDir = parentDir(sourcePath);
	const normalizedRaw = raw.replace(/^\.\/+/, "");
	const candidates = new Set<string>();

	if (raw.startsWith("/")) {
		candidates.add(normalizeSegments(raw));
	} else {
		candidates.add(normalizeSegments(`${sourceDir}/${normalizedRaw}`));
		candidates.add(normalizeSegments(normalizedRaw));
	}

	for (const candidate of [...candidates]) {
		if (!candidate.toLowerCase().endsWith(".md")) {
			candidates.add(`${candidate}.md`);
		}
	}

	for (const candidate of candidates) {
		const match = entries.find(
			(entry) => normalizeRelPath(entry.rel_path).toLowerCase() === candidate.toLowerCase(),
		);
		if (match) return match.rel_path;
	}
	return null;
}

export function aiNoteFileName(): string {
	const now = new Date();
	const pad = (n: number) => n.toString().padStart(2, "0");
	return `AI Note ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
		now.getDate(),
	)} ${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(
		now.getSeconds(),
	)}.md`;
}

export { normalizeRelPath, parentDir };
