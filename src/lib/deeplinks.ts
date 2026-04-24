import type { SettingsTab } from "../components/settings/settingsConfig";
import { isMarkdownPath, normalizeRelPath } from "../utils/path";

export type GlyphDeepLink =
	| { kind: "note"; path: string }
	| { kind: "file"; path: string }
	| { kind: "daily-note" }
	| { kind: "all-docs" }
	| { kind: "calendar" }
	| { kind: "databases"; databaseId: string | null }
	| { kind: "settings"; tab: SettingsTab };

const SETTINGS_TABS = new Set<SettingsTab>([
	"general",
	"appearance",
	"ai",
	"space",
	"git",
	"advanced",
	"about",
]);

function decodeSegment(value: string): string | null {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

function hasTraversal(rawUrl: string): boolean {
	const decoded = decodeSegment(rawUrl);
	const value = decoded ?? rawUrl;
	return /(^|[/\\])\.\.([/\\]|$)/.test(value);
}

function decodePath(pathname: string): string | null {
	const trimmed = pathname.replace(/^\/+/, "");
	const decoded = decodeSegment(trimmed);
	if (decoded === null) return null;
	if (decoded.startsWith("/") || /^[a-z]:/i.test(decoded)) return null;
	const normalized = normalizeRelPath(decoded);
	if (
		!normalized ||
		normalized.startsWith("../") ||
		normalized.includes("/../")
	) {
		return null;
	}
	if (normalized === ".." || /^[a-z]:/i.test(normalized)) return null;
	return normalized;
}

function decodeRequiredValue(pathname: string): string | null {
	const decoded = decodePath(pathname);
	return decoded?.trim() || null;
}

function decodeRequiredSegment(pathname: string): string | null {
	const value = decodeRequiredValue(pathname);
	if (!value || value.includes("/")) return null;
	return value;
}

export function parseGlyphDeepLink(rawUrl: string): GlyphDeepLink | null {
	if (hasTraversal(rawUrl)) return null;

	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return null;
	}

	if (url.protocol !== "glyph:") return null;

	switch (url.hostname) {
		case "note": {
			const path = decodePath(url.pathname);
			if (!path || !isMarkdownPath(path)) return null;
			return { kind: "note", path };
		}
		case "file": {
			const path = decodePath(url.pathname);
			if (!path) return null;
			return { kind: "file", path };
		}
		case "daily-note":
			return url.pathname === "" || url.pathname === "/"
				? { kind: "daily-note" }
				: null;
		case "all-docs":
			return url.pathname === "" || url.pathname === "/"
				? { kind: "all-docs" }
				: null;
		case "calendar":
			return url.pathname === "" || url.pathname === "/"
				? { kind: "calendar" }
				: null;
		case "databases":
			if (url.pathname !== "" && url.pathname !== "/") return null;
			return { kind: "databases", databaseId: null };
		case "database": {
			const databaseId = decodeRequiredSegment(url.pathname);
			return databaseId ? { kind: "databases", databaseId } : null;
		}
		case "settings": {
			if (url.pathname === "" || url.pathname === "/") {
				return { kind: "settings", tab: "general" };
			}
			const tab = decodeRequiredValue(url.pathname);
			if (!tab || !SETTINGS_TABS.has(tab as SettingsTab)) return null;
			return { kind: "settings", tab: tab as SettingsTab };
		}
		default:
			return null;
	}
}

function encodeRelPath(path: string): string {
	return normalizeRelPath(path)
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
}

export function glyphDeepLinkForFile(path: string): string | null {
	const normalized = normalizeRelPath(path);
	if (!normalized) return null;
	const host = isMarkdownPath(normalized) ? "note" : "file";
	return `glyph://${host}/${encodeRelPath(normalized)}`;
}
