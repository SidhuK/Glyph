import { SETTINGS_TABS, type SettingsTab } from "./settingsConfig";

export interface SettingsSearchEntry {
	id: string;
	tab: SettingsTab;
	title: string;
	section?: string;
	description?: string;
	keywords?: readonly string[];
}

interface SettingsSearchMatch extends SettingsSearchEntry {
	tabLabel: string;
}

const SETTINGS_SEARCH_TARGET_CLASS = "settingsSearchTarget";

const SETTINGS_SEARCH_ITEMS = [
	{
		id: "general-license",
		tab: "general",
		title: "License",
		description: "Trial status, license key, activation, and official build.",
		keywords: ["trial", "activate", "activation", "subscription", "purchase"],
	},
	{
		id: "general-trial-status",
		tab: "general",
		section: "License",
		title: "Trial status",
		description: "Remaining time on the current trial for this device.",
		keywords: ["trial remaining", "expired"],
	},
	{
		id: "general-activated",
		tab: "general",
		section: "License",
		title: "Activated",
		description: "Activation date for the local Glyph license.",
		keywords: ["licensed", "license date"],
	},
	{
		id: "general-license-key",
		tab: "general",
		section: "License",
		title: "License key",
		description: "View the masked license key stored locally.",
		keywords: ["serial", "activation key"],
	},
	{
		id: "general-activate-glyph",
		tab: "general",
		section: "License",
		title: "Activate Glyph",
		description: "Enter a license key to unlock Glyph permanently.",
		keywords: ["activate", "buy", "official build"],
	},
	{
		id: "general-official-build",
		tab: "general",
		section: "License",
		title: "Official build",
		description:
			"Purchase an official license for support and automatic updates.",
		keywords: ["community build", "buy", "updates"],
	},
	{
		id: "general-license-help",
		tab: "general",
		section: "License",
		title: "Help",
		description: "Get help with licensing, lost keys, or purchase issues.",
		keywords: ["support", "remove local activation"],
	},
	{
		id: "appearance-theme-mode",
		tab: "appearance",
		section: "Theme",
		title: "Select Theme",
		description: "Choose system, light, or dark mode.",
		keywords: ["mode", "system", "light", "dark"],
	},
	{
		id: "appearance-light-theme",
		tab: "appearance",
		section: "Theme",
		title: "Light theme",
		keywords: ["theme", "color"],
	},
	{
		id: "appearance-dark-theme",
		tab: "appearance",
		section: "Theme",
		title: "Dark theme",
		keywords: ["theme", "color"],
	},
	{
		id: "appearance-translucent-app",
		tab: "appearance",
		section: "Theme",
		title: "Translucent app",
		keywords: ["window", "glass", "blur"],
	},
	{
		id: "appearance-accent",
		tab: "appearance",
		section: "Accent",
		title: "Palette",
		description: "Set the app accent color.",
		keywords: ["accent", "color", "palette"],
	},
	{
		id: "appearance-interface-font",
		tab: "appearance",
		section: "Typography",
		title: "Interface font",
		keywords: ["font", "ui", "sans"],
	},
	{
		id: "appearance-monospace-font",
		tab: "appearance",
		section: "Typography",
		title: "Monospace font",
		keywords: ["font", "code", "mono"],
	},
	{
		id: "appearance-editor-font",
		tab: "appearance",
		section: "Typography",
		title: "Editor font",
		keywords: ["font", "editor", "notes", "prose"],
	},
	{
		id: "appearance-ui-font-size",
		tab: "appearance",
		section: "Typography",
		title: "UI font size",
		keywords: ["font", "text", "interface"],
	},
	{
		id: "appearance-editor-font-size",
		tab: "appearance",
		section: "Typography",
		title: "Editor font size",
		keywords: ["font", "text", "notes"],
	},
	{
		id: "shortcuts-customize",
		tab: "shortcuts",
		section: "Customize Shortcuts",
		title: "Customize Shortcuts",
		description: "Edit keyboard shortcuts.",
		keywords: ["hotkeys", "keybindings", "commands"],
	},
	{
		id: "shortcuts-search",
		tab: "shortcuts",
		section: "Customize Shortcuts",
		title: "Search actions, categories, or shortcuts",
		description:
			"Filter shortcuts by action, category, binding, or description.",
		keywords: ["filter", "find shortcuts", "shortcut search"],
	},
	{
		id: "shortcuts-workspace",
		tab: "shortcuts",
		section: "Workspace",
		title: "Workspace shortcuts",
		keywords: ["space", "window", "workspace"],
	},
	{
		id: "shortcuts-navigation",
		tab: "shortcuts",
		section: "Navigation",
		title: "Navigation shortcuts",
		keywords: ["move", "go", "navigate"],
	},
	{
		id: "shortcuts-search-category",
		tab: "shortcuts",
		section: "Search",
		title: "Search shortcuts",
		keywords: ["find", "quick search", "command palette"],
	},
	{
		id: "shortcuts-file-operations",
		tab: "shortcuts",
		section: "File Operations",
		title: "File Operations shortcuts",
		keywords: ["file", "folder", "rename", "delete"],
	},
	{
		id: "shortcuts-tabs",
		tab: "shortcuts",
		section: "Tabs",
		title: "Tabs shortcuts",
		keywords: ["tab", "open tab", "close tab"],
	},
	{
		id: "shortcuts-ai",
		tab: "shortcuts",
		section: "AI",
		title: "AI shortcuts",
		keywords: ["assistant", "chat", "glyph ai"],
	},
	{
		id: "shortcuts-editor",
		tab: "shortcuts",
		section: "Editor",
		title: "Editor shortcuts",
		keywords: ["note", "markdown", "editing"],
	},
	{
		id: "ai-features",
		tab: "ai",
		section: "Availability",
		title: "AI features",
		description: "Turn AI tools on or off across Glyph.",
		keywords: ["assistant", "chat", "enable", "disable"],
	},
	{
		id: "ai-configuration",
		tab: "ai",
		section: "Availability",
		title: "Configuration",
		keywords: ["providers", "models", "account"],
	},
	{
		id: "ai-provider-service",
		tab: "ai",
		section: "Provider",
		title: "Service",
		keywords: ["provider", "openai", "anthropic", "ollama"],
	},
	{
		id: "ai-provider-model",
		tab: "ai",
		section: "Provider",
		title: "Model",
		keywords: ["provider", "model", "assistant"],
	},
	{
		id: "ai-reasoning-level",
		tab: "ai",
		section: "Provider",
		title: "Reasoning level",
		keywords: ["effort", "thinking"],
	},
	{
		id: "ai-base-url",
		tab: "ai",
		section: "Provider",
		title: "Base URL",
		keywords: ["endpoint", "local", "server"],
	},
	{
		id: "ai-local-network",
		tab: "ai",
		section: "Provider",
		title: "Allow local network",
		keywords: ["localhost", "lan", "network"],
	},
	{
		id: "ai-api-key",
		tab: "ai",
		section: "API Key",
		title: "Set key",
		keywords: ["secret", "token", "credential", "update key"],
	},
	{
		id: "ai-chatgpt-account",
		tab: "ai",
		section: "ChatGPT Account",
		title: "ChatGPT Account",
		keywords: ["codex", "account", "authentication", "rate limits"],
	},
	{
		id: "ai-chatgpt-identity",
		tab: "ai",
		section: "ChatGPT Account",
		title: "Identity",
		description: "The connected account Glyph is currently using for Codex.",
		keywords: ["email", "display name", "connect", "disconnect"],
	},
	{
		id: "ai-chatgpt-authentication",
		tab: "ai",
		section: "ChatGPT Account",
		title: "Authentication",
		description: "How the current ChatGPT session is authenticated.",
		keywords: ["auth mode", "session"],
	},
	{
		id: "ai-chatgpt-rate-limits",
		tab: "ai",
		section: "ChatGPT Account",
		title: "Rate limits",
		description: "Review remaining capacity for the connected account.",
		keywords: ["usage", "remaining", "resets"],
	},
	{
		id: "space-daily-notes-folder",
		tab: "space",
		section: "Daily Notes",
		title: "Folder",
		description: "Choose where daily notes are created.",
		keywords: ["journal", "today", "date"],
	},
	{
		id: "space-quick-notes-folder",
		tab: "space",
		section: "Quick Notes",
		title: "Folder",
		description: "Choose where quick notes are saved.",
		keywords: ["capture", "inbox"],
	},
	{
		id: "space-attachments-location",
		tab: "space",
		section: "Attachments",
		title: "Location",
		keywords: ["assets", "files", "images", "folder"],
	},
	{
		id: "space-template-folder",
		tab: "space",
		section: "Templates",
		title: "Template folder",
		keywords: ["templates", "folder"],
	},
	{
		id: "space-default-daily-template",
		tab: "space",
		section: "Templates",
		title: "Default daily note template",
		keywords: ["templates", "daily notes"],
	},
	{
		id: "space-search-index-status",
		tab: "space",
		section: "Search Index",
		title: "Status",
		keywords: ["index", "rebuild", "search"],
	},
	{
		id: "git-availability",
		tab: "git",
		section: "Connection",
		title: "Git availability",
		keywords: ["sync", "repository"],
	},
	{
		id: "git-repository-state",
		tab: "git",
		section: "Connection",
		title: "Repository state",
		keywords: ["repo", "sync", "branch"],
	},
	{
		id: "git-how-it-works",
		tab: "git",
		section: "Connection",
		title: "How it works",
		description: "Review remote connection details for the current repository.",
		keywords: ["remote url", "initialize git", "credentials"],
	},
	{
		id: "git-branch",
		tab: "git",
		section: "Connection",
		title: "Branch",
		keywords: ["repo", "sync"],
	},
	{
		id: "git-automatic-sync",
		tab: "git",
		section: "Sync",
		title: "Automatic sync",
		keywords: ["auto", "git"],
	},
	{
		id: "git-sync-interval",
		tab: "git",
		section: "Sync",
		title: "Interval",
		keywords: ["frequency", "minutes"],
	},
	{
		id: "git-sync-actions",
		tab: "git",
		section: "Sync",
		title: "Actions",
		keywords: ["run", "sync now", "push", "pull"],
	},
	{
		id: "git-conflict-policy",
		tab: "git",
		section: "Conflict Resolution",
		title: "Policy",
		keywords: ["merge", "conflict"],
	},
	{
		id: "git-include-templates",
		tab: "git",
		section: "Content",
		title: "Include templates",
		keywords: ["sync", "templates"],
	},
	{
		id: "git-include-attachments",
		tab: "git",
		section: "Content",
		title: "Include attachments",
		keywords: ["sync", "assets", "files"],
	},
	{
		id: "git-include-non-markdown",
		tab: "git",
		section: "Content",
		title: "Include non-markdown files",
		keywords: ["sync", "files"],
	},
	{
		id: "advanced-table-of-contents",
		tab: "advanced",
		section: "Editor",
		title: "Table of contents",
		keywords: ["toc", "outline"],
	},
	{
		id: "advanced-people-tags",
		tab: "advanced",
		section: "Editor",
		title: "People mentions as tags",
		keywords: ["mentions", "people", "tags"],
	},
	{
		id: "advanced-frontmatter",
		tab: "advanced",
		section: "Editor",
		title: "Show frontmatter in editor",
		keywords: ["properties", "yaml", "metadata"],
	},
	{
		id: "advanced-colorful-headings",
		tab: "advanced",
		section: "Editor",
		title: "Colorful headings",
		keywords: ["editor", "color"],
	},
	{
		id: "advanced-beautiful-tags",
		tab: "advanced",
		section: "Editor",
		title: "Beautiful Tags",
		keywords: ["tags", "editor"],
	},
	{
		id: "advanced-editor-width",
		tab: "advanced",
		section: "Editor",
		title: "Editor width",
		keywords: ["compact", "comfortable", "wide"],
	},
	{
		id: "advanced-collapsible-headings",
		tab: "advanced",
		section: "Editor",
		title: "Collapsible headings",
		keywords: ["fold", "collapse", "expand"],
	},
	{
		id: "advanced-vim-keybindings",
		tab: "advanced",
		section: "Editor",
		title: "Vim keybindings",
		keywords: ["vim", "keyboard", "modal"],
	},
	{
		id: "advanced-ai-tools",
		tab: "advanced",
		section: "AI",
		title: "AI chat has access to tools",
		keywords: ["assistant", "tool calls"],
	},
	{
		id: "advanced-folio-mode",
		tab: "advanced",
		section: "App",
		title: "Folio Mode",
		keywords: ["layout", "reading"],
	},
	{
		id: "advanced-folder-counts",
		tab: "advanced",
		section: "App",
		title: "Show folder file counts",
		keywords: ["sidebar", "counts"],
	},
	{
		id: "advanced-database-column-color",
		tab: "advanced",
		section: "Database",
		title: "Show database column color",
		keywords: ["collection", "database", "color"],
	},
	{
		id: "about-app",
		tab: "about",
		title: "Glyph",
		description: "View Glyph app name, version, attribution, and quick links.",
		keywords: ["about", "version", "karat sidhu"],
	},
	{
		id: "about-website",
		tab: "about",
		title: "Website",
		description: "Open the Glyph website.",
		keywords: ["glyphformac.com", "home"],
	},
	{
		id: "about-discord",
		tab: "about",
		title: "Discord",
		description: "Open the Glyph community Discord.",
		keywords: ["community", "support", "feedback"],
	},
	{
		id: "about-terms",
		tab: "about",
		title: "Terms",
		description: "Open the Glyph terms page.",
		keywords: ["legal", "terms of service"],
	},
	{
		id: "about-privacy",
		tab: "about",
		title: "Privacy",
		description: "Open the Glyph privacy page.",
		keywords: ["legal", "privacy policy"],
	},
	{
		id: "about-updates",
		tab: "about",
		section: "Updates",
		title: "App updates",
		keywords: ["release", "version", "update"],
	},
	{
		id: "about-alpha-releases",
		tab: "about",
		section: "Updates",
		title: "Alpha releases",
		description: "Receive early release builds before they become stable.",
		keywords: ["alpha", "prerelease", "beta", "release channel"],
	},
	{
		id: "about-license-status",
		tab: "about",
		section: "Updates",
		title: "License status",
		description: "Review whether this build can use automatic updates.",
		keywords: ["official build", "community build"],
	},
	{
		id: "about-community-build",
		tab: "about",
		section: "Updates",
		title: "Community build",
		keywords: ["license", "build"],
	},
	{
		id: "about-update-status",
		tab: "about",
		section: "Updates",
		title: "Status",
		description: "Latest updater activity from this window.",
		keywords: ["checking", "ready", "latest version"],
	},
	{
		id: "about-changelog",
		tab: "about",
		section: "Updates",
		title: "Changelog",
		description: "Open the published Glyph changelog.",
		keywords: ["release notes", "version", "updates"],
	},
] as const satisfies readonly SettingsSearchEntry[];

const SETTINGS_TAB_ENTRIES = SETTINGS_TABS.map((tab) => ({
	id: `${tab.id}-settings`,
	tab: tab.id,
	title: `${tab.label} settings`,
	description: `Open ${tab.label} settings.`,
	keywords: [tab.label],
})) satisfies readonly SettingsSearchEntry[];

export const SETTINGS_SEARCH_ENTRIES = [
	...SETTINGS_TAB_ENTRIES,
	...SETTINGS_SEARCH_ITEMS,
] as const satisfies readonly SettingsSearchEntry[];

const TAB_LABEL_BY_ID = new Map<SettingsTab, string>(
	SETTINGS_TABS.map((tab) => [tab.id, tab.label]),
);

function normalizeSearchText(value: string): string {
	return value.trim().toLowerCase();
}

function buildHaystack(entry: SettingsSearchEntry): string {
	const tabLabel = TAB_LABEL_BY_ID.get(entry.tab) ?? entry.tab;
	return [
		entry.title,
		entry.section ?? "",
		tabLabel,
		entry.description ?? "",
		...(entry.keywords ?? []),
	]
		.join(" ")
		.toLowerCase();
}

function scoreSettingsEntry(entry: SettingsSearchEntry, query: string): number {
	const title = entry.title.toLowerCase();
	const section = entry.section?.toLowerCase() ?? "";
	if (title === query) return 0;
	if (title.startsWith(query)) return 1;
	if (title.includes(query)) return 2;
	if (section.includes(query)) return 3;
	return 4;
}

export function searchSettingsEntries(
	query: string,
	limit = SETTINGS_SEARCH_ENTRIES.length,
): SettingsSearchMatch[] {
	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery) return [];
	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	return SETTINGS_SEARCH_ENTRIES.filter((entry) => {
		const haystack = buildHaystack(entry);
		return tokens.every((token) => haystack.includes(token));
	})
		.sort((a, b) => {
			const byScore =
				scoreSettingsEntry(a, normalizedQuery) -
				scoreSettingsEntry(b, normalizedQuery);
			if (byScore !== 0) return byScore;
			return a.title.localeCompare(b.title);
		})
		.slice(0, limit)
		.map((entry) => ({
			...entry,
			tabLabel: TAB_LABEL_BY_ID.get(entry.tab) ?? entry.tab,
		}));
}

const SETTINGS_SEARCH_HIGHLIGHT_DURATION_MS = 1600;
const SETTINGS_SEARCH_WAIT_TIMEOUT_MS = 5000;

let settingsSearchRequestId = 0;
let clearActiveSettingsSearchTarget: (() => void) | null = null;

function findSettingsTarget(
	root: ParentNode,
	entry: SettingsSearchEntry,
): HTMLElement | null {
	const rows = Array.from(
		root.querySelectorAll<HTMLElement>("[data-settings-row-title]"),
	);
	const matchingRow = rows.find((row) => {
		if (row.dataset.settingsRowTitle !== entry.title) return false;
		if (!entry.section) return true;
		const section = row.closest<HTMLElement>("[data-settings-section-title]");
		return section?.dataset.settingsSectionTitle === entry.section;
	});
	if (matchingRow) return matchingRow;

	const sections = Array.from(
		root.querySelectorAll<HTMLElement>("[data-settings-section-title]"),
	);
	return (
		sections.find(
			(section) =>
				section.dataset.settingsSectionTitle === entry.section ||
				section.dataset.settingsSectionTitle === entry.title,
		) ?? null
	);
}

function clearSettingsSearchTargets(root: ParentNode) {
	for (const active of root.querySelectorAll(
		`.${SETTINGS_SEARCH_TARGET_CLASS}`,
	)) {
		active.classList.remove(SETTINGS_SEARCH_TARGET_CLASS);
	}
}

function findSettingsTabPanel(entry: SettingsSearchEntry): HTMLElement | null {
	const root = document.querySelector<HTMLElement>(".settingsTabPanel");
	const tabLabel = TAB_LABEL_BY_ID.get(entry.tab);
	const activeTitle = root
		?.querySelector<HTMLElement>(".settingsPanelTitle")
		?.textContent?.trim();
	if (!root || (tabLabel && activeTitle !== tabLabel)) return null;
	return root;
}

export function scrollToSettingsSearchEntry(entry: SettingsSearchEntry) {
	settingsSearchRequestId += 1;
	const requestId = settingsSearchRequestId;
	clearActiveSettingsSearchTarget?.();
	clearActiveSettingsSearchTarget = null;

	let frameId: number | null = null;
	let observer: MutationObserver | null = null;
	let waitTimeoutId: number | null = null;

	const cancelPendingScroll = () => {
		if (frameId !== null) {
			window.cancelAnimationFrame(frameId);
			frameId = null;
		}
		observer?.disconnect();
		observer = null;
		if (waitTimeoutId !== null) {
			window.clearTimeout(waitTimeoutId);
			waitTimeoutId = null;
		}
	};

	const revealTarget = () => {
		if (requestId !== settingsSearchRequestId) {
			cancelPendingScroll();
			return true;
		}

		const root = findSettingsTabPanel(entry);
		if (!root) return false;
		const target = findSettingsTarget(root, entry);
		if (!target) return false;

		cancelPendingScroll();
		clearSettingsSearchTargets(root);
		target.classList.add(SETTINGS_SEARCH_TARGET_CLASS);
		target.scrollIntoView({ block: "center", behavior: "smooth" });

		let highlightTimeoutId: number | null = null;
		const clearHighlight = () => {
			if (highlightTimeoutId !== null) {
				window.clearTimeout(highlightTimeoutId);
				highlightTimeoutId = null;
			}
			target.classList.remove(SETTINGS_SEARCH_TARGET_CLASS);
		};
		highlightTimeoutId = window.setTimeout(() => {
			clearHighlight();
			if (clearActiveSettingsSearchTarget === clearHighlight) {
				clearActiveSettingsSearchTarget = null;
			}
		}, SETTINGS_SEARCH_HIGHLIGHT_DURATION_MS);
		clearActiveSettingsSearchTarget = clearHighlight;
		return true;
	};

	const scheduleReveal = () => {
		if (frameId !== null) return;
		frameId = window.requestAnimationFrame(() => {
			frameId = null;
			revealTarget();
		});
	};

	if (revealTarget()) return;

	const observerRoot = document.body ?? document.documentElement;
	if (!observerRoot) return;

	observer = new MutationObserver(scheduleReveal);
	observer.observe(observerRoot, { childList: true, subtree: true });
	scheduleReveal();
	waitTimeoutId = window.setTimeout(
		cancelPendingScroll,
		SETTINGS_SEARCH_WAIT_TIMEOUT_MS,
	);
}
