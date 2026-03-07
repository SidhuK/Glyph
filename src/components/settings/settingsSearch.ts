import type { SettingsTab } from "./settingsConfig";

export interface SettingsSearchRecord {
	id: string;
	tab: SettingsTab;
	section: string;
	label: string;
	description: string;
	keywords?: string[];
}

export interface SettingsSearchResult extends SettingsSearchRecord {
	score: number;
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchRecord[] = [
	{
		id: "general-assistant-default-view",
		tab: "general",
		section: "Assistant",
		label: "Assistant Default View",
		description: "Choose whether Glyph opens the assistant in Create or Chat.",
		keywords: ["assistant", "default", "view", "create", "chat"],
	},
	{
		id: "general-daily-notes-folder",
		tab: "general",
		section: "Daily Notes",
		label: "Daily Notes Folder",
		description:
			"Choose where new daily notes are created inside the current space.",
		keywords: ["daily", "notes", "folder", "journal", "path"],
	},
	{
		id: "general-license",
		tab: "general",
		section: "License",
		label: "License",
		description: "Manage trial status, activation, purchases, and support.",
		keywords: ["license", "trial", "activate", "buy", "support"],
	},
	{
		id: "appearance-theme-mode",
		tab: "appearance",
		section: "Theme",
		label: "Theme Mode",
		description: "Switch between light, dark, or system theme.",
		keywords: ["theme", "mode", "light", "dark", "system"],
	},
	{
		id: "appearance-accent",
		tab: "appearance",
		section: "Accent",
		label: "Accent Color",
		description: "Set the accent used for highlights and focus styling.",
		keywords: ["accent", "color", "palette", "highlight"],
	},
	{
		id: "appearance-font-family",
		tab: "appearance",
		section: "Typography",
		label: "Interface Font",
		description: "Choose the primary UI font family.",
		keywords: ["font", "typography", "ui", "family", "text"],
	},
	{
		id: "appearance-mono-font-family",
		tab: "appearance",
		section: "Typography",
		label: "Monospace Font",
		description: "Choose the monospace font used around the app.",
		keywords: ["font", "mono", "monospace", "code"],
	},
	{
		id: "appearance-font-size",
		tab: "appearance",
		section: "Typography",
		label: "Font Size",
		description: "Adjust the base UI text size used in Glyph.",
		keywords: ["font", "size", "scale", "readability"],
	},
	{
		id: "ai-active-profile",
		tab: "ai",
		section: "Profiles",
		label: "Active Profile",
		description: "Choose the AI profile Glyph should use.",
		keywords: ["ai", "profile", "provider", "active"],
	},
	{
		id: "ai-provider",
		tab: "ai",
		section: "Provider",
		label: "Provider",
		description:
			"Select the AI service, model, and advanced connection fields.",
		keywords: [
			"provider",
			"service",
			"model",
			"openai",
			"anthropic",
			"gemini",
			"ollama",
		],
	},
	{
		id: "ai-reasoning",
		tab: "ai",
		section: "Provider",
		label: "Reasoning Level",
		description: "Choose the reasoning effort when a model supports it.",
		keywords: ["reasoning", "effort", "codex", "model"],
	},
	{
		id: "ai-base-url",
		tab: "ai",
		section: "Provider",
		label: "Base URL",
		description: "Set a custom base URL for OpenAI-compatible providers.",
		keywords: ["base url", "endpoint", "openai compatible", "custom"],
	},
	{
		id: "ai-api-key",
		tab: "ai",
		section: "Authentication",
		label: "API Key",
		description: "Store or clear the provider API key in the secret store.",
		keywords: ["api key", "secret", "token", "auth"],
	},
	{
		id: "ai-chatgpt-account",
		tab: "ai",
		section: "Authentication",
		label: "ChatGPT Account",
		description: "Sign in with ChatGPT and review Codex account status.",
		keywords: ["chatgpt", "codex", "account", "sign in", "rate limits"],
	},
	{
		id: "ai-availability",
		tab: "ai",
		section: "Availability",
		label: "AI Features",
		description: "Turn AI features on or off across Glyph.",
		keywords: ["ai", "features", "enable", "disable"],
	},
	{
		id: "space-current-space",
		tab: "space",
		section: "Current Space",
		label: "Current Space",
		description: "Review the active space path.",
		keywords: ["space", "path", "workspace", "current"],
	},
	{
		id: "space-recent-spaces",
		tab: "space",
		section: "Recent Spaces",
		label: "Recent Spaces",
		description: "Review and clear recently opened spaces.",
		keywords: ["recent", "spaces", "history", "clear"],
	},
	{
		id: "space-search-index",
		tab: "space",
		section: "Search Index",
		label: "Search Index",
		description: "Rebuild the index if search results are stale or incomplete.",
		keywords: ["search", "index", "rebuild", "stale"],
	},
	{
		id: "space-task-sources",
		tab: "space",
		section: "Task Sources",
		label: "Task Sources",
		description: "Use the whole space or selected folders for the Tasks pane.",
		keywords: ["tasks", "folders", "scope", "sources"],
	},
	{
		id: "about-version",
		tab: "about",
		section: "App",
		label: "Version",
		description: "See the current Glyph version and build information.",
		keywords: ["version", "build", "identifier", "app info"],
	},
	{
		id: "about-updates",
		tab: "about",
		section: "App",
		label: "Updates",
		description: "Check for updates and install the latest release.",
		keywords: ["updates", "install", "download", "relaunch"],
	},
	{
		id: "about-diagnostics",
		tab: "about",
		section: "Support",
		label: "Diagnostics",
		description: "Copy diagnostics and open project links.",
		keywords: ["diagnostics", "copy", "github", "support", "twitter", "x"],
	},
];

function normalizeSearchText(value: string): string {
	return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function searchSettingsIndex(query: string): SettingsSearchResult[] {
	const normalizedQuery = normalizeSearchText(query.trim());
	if (!normalizedQuery) return [];

	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);

	return SETTINGS_SEARCH_INDEX.map((record) => {
		const searchableText = normalizeSearchText(
			[
				record.label,
				record.description,
				record.section,
				...(record.keywords ?? []),
			].join(" "),
		);

		let score = 0;
		for (const token of tokens) {
			if (!searchableText.includes(token)) continue;
			if (normalizeSearchText(record.label).includes(token)) score += 10;
			if (
				(record.keywords ?? []).some((keyword) =>
					normalizeSearchText(keyword).includes(token),
				)
			) {
				score += 5;
			}
			if (normalizeSearchText(record.section).includes(token)) score += 2;
			score += 1;
		}

		return {
			...record,
			score,
		};
	})
		.filter((record) => record.score > 0)
		.sort((left, right) => right.score - left.score);
}
