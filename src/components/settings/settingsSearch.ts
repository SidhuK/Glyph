import { i18n } from "../../i18n";
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

interface SettingsSearchDef {
	id: string;
	tab: SettingsTab;
}

const SETTINGS_SEARCH_TARGET_CLASS = "settingsSearchTarget";

const SETTINGS_SEARCH_DEFS: readonly SettingsSearchDef[] = [
	{ id: "general-license", tab: "general" },
	{ id: "general-trial-status", tab: "general" },
	{ id: "general-activated", tab: "general" },
	{ id: "general-license-key", tab: "general" },
	{ id: "general-activate-glyph", tab: "general" },
	{ id: "general-official-build", tab: "general" },
	{ id: "general-license-help", tab: "general" },
	{ id: "general-language", tab: "general" },
	{ id: "general-resume-last-session", tab: "general" },
	{ id: "appearance-theme-mode", tab: "appearance" },
	{ id: "appearance-light-theme", tab: "appearance" },
	{ id: "appearance-dark-theme", tab: "appearance" },
	{ id: "appearance-translucent-app", tab: "appearance" },
	{ id: "appearance-accent", tab: "appearance" },
	{ id: "appearance-light-theme-colors", tab: "appearance" },
	{ id: "appearance-dark-theme-colors", tab: "appearance" },
	{ id: "appearance-interface-font", tab: "appearance" },
	{ id: "appearance-monospace-font", tab: "appearance" },
	{ id: "appearance-editor-font", tab: "appearance" },
	{ id: "appearance-ui-font-size", tab: "appearance" },
	{ id: "appearance-editor-font-size", tab: "appearance" },
	{ id: "shortcuts-customize", tab: "shortcuts" },
	{ id: "shortcuts-search", tab: "shortcuts" },
	{ id: "shortcuts-workspace", tab: "shortcuts" },
	{ id: "shortcuts-navigation", tab: "shortcuts" },
	{ id: "shortcuts-search-category", tab: "shortcuts" },
	{ id: "shortcuts-file-operations", tab: "shortcuts" },
	{ id: "shortcuts-tabs", tab: "shortcuts" },
	{ id: "shortcuts-ai", tab: "shortcuts" },
	{ id: "shortcuts-editor", tab: "shortcuts" },
	{ id: "ai-features", tab: "ai" },
	{ id: "ai-configuration", tab: "ai" },
	{ id: "ai-provider-service", tab: "ai" },
	{ id: "ai-provider-model", tab: "ai" },
	{ id: "ai-reasoning-level", tab: "ai" },
	{ id: "ai-base-url", tab: "ai" },
	{ id: "ai-local-network", tab: "ai" },
	{ id: "ai-api-key", tab: "ai" },
	{ id: "ai-chatgpt-account", tab: "ai" },
	{ id: "ai-chatgpt-identity", tab: "ai" },
	{ id: "ai-chatgpt-authentication", tab: "ai" },
	{ id: "ai-chatgpt-rate-limits", tab: "ai" },
	{ id: "space-daily-notes-folder", tab: "space" },
	{ id: "space-quick-notes-folder", tab: "space" },
	{ id: "space-attachments-location", tab: "space" },
	{ id: "space-template-folder", tab: "space" },
	{ id: "space-default-daily-template", tab: "space" },
	{ id: "space-search-index-status", tab: "space" },
	{ id: "git-availability", tab: "git" },
	{ id: "git-repository-state", tab: "git" },
	{ id: "git-how-it-works", tab: "git" },
	{ id: "git-branch", tab: "git" },
	{ id: "git-automatic-sync", tab: "git" },
	{ id: "git-sync-interval", tab: "git" },
	{ id: "git-sync-actions", tab: "git" },
	{ id: "git-conflict-policy", tab: "git" },
	{ id: "git-include-templates", tab: "git" },
	{ id: "git-include-attachments", tab: "git" },
	{ id: "git-include-non-markdown", tab: "git" },
	{ id: "general-editor-table-of-contents", tab: "general" },
	{ id: "space-search-index-people-tags", tab: "space" },
	{ id: "general-editor-frontmatter", tab: "general" },
	{ id: "general-editor-colorful-headings", tab: "general" },
	{ id: "appearance-editor-presentation-beautiful-tags", tab: "appearance" },
	{ id: "appearance-editor-presentation-width", tab: "appearance" },
	{ id: "general-editor-collapsible-headings", tab: "general" },
	{ id: "general-editor-spell-check", tab: "general" },
	{ id: "general-editor-vim-keybindings", tab: "general" },
	{ id: "ai-assistant-behavior-tools", tab: "ai" },
	{ id: "appearance-layout-folio-mode", tab: "appearance" },
	{ id: "appearance-layout-classic-all-notes", tab: "appearance" },
	{ id: "general-file-tree-folder-counts", tab: "general" },
	{ id: "general-file-tree-non-markdown-files", tab: "general" },
	{ id: "general-file-tree-sort", tab: "general" },
	{ id: "appearance-database-column-color", tab: "appearance" },
	{ id: "about-app", tab: "about" },
	{ id: "about-website", tab: "about" },
	{ id: "about-discord", tab: "about" },
	{ id: "about-terms", tab: "about" },
	{ id: "about-privacy", tab: "about" },
	{ id: "about-updates", tab: "about" },
	{ id: "about-alpha-releases", tab: "about" },
	{ id: "about-license-status", tab: "about" },
	{ id: "about-community-build", tab: "about" },
	{ id: "about-update-status", tab: "about" },
	{ id: "about-changelog", tab: "about" },
];

const SETTINGS_TAB_DEFS: readonly SettingsSearchDef[] = SETTINGS_TABS.map(
	(tab) => ({
		id: `${tab.id}-settings`,
		tab: tab.id,
	}),
);

export const SETTINGS_SEARCH_ENTRIES: readonly SettingsSearchDef[] = [
	...SETTINGS_TAB_DEFS,
	...SETTINGS_SEARCH_DEFS,
];

function readKeywords(
	nsKey: string,
	language: string,
): readonly string[] | undefined {
	const keywords = i18n.t(nsKey, {
		lng: language,
		returnObjects: true,
	});
	return Array.isArray(keywords) ? (keywords as string[]) : undefined;
}

export function localizedSettingsTabLabel(
	tab: SettingsTab,
	language: string = i18n.language,
): string {
	return i18n.t(`settings.search:tabs.${tab}`, { lng: language });
}

export function localizeSettingsSearchEntry(
	def: SettingsSearchDef,
	language: string = i18n.language,
): SettingsSearchEntry {
	const isTabEntry =
		def.id.endsWith("-settings") && def.id === `${def.tab}-settings`;
	const base = isTabEntry
		? `settings.search:tabEntry.${def.tab}`
		: `settings.search:entries.${def.id}`;

	const localized = i18n.t(base, {
		lng: language,
		returnObjects: true,
	});
	if (!localized || typeof localized !== "object" || Array.isArray(localized)) {
		return {
			id: def.id,
			tab: def.tab,
			title: def.id,
		};
	}

	const record = localized as Record<string, unknown>;
	const title = typeof record.title === "string" ? record.title : def.id;
	const section =
		typeof record.section === "string" ? record.section : undefined;
	const description =
		typeof record.description === "string" ? record.description : undefined;
	const keywords = Array.isArray(record.keywords)
		? (record.keywords as string[])
		: readKeywords(`${base}.keywords`, language);

	return {
		id: def.id,
		tab: def.tab,
		title,
		section,
		description,
		keywords,
	};
}

function normalizeSearchText(value: string): string {
	return value.trim().toLowerCase();
}

function buildHaystack(entry: SettingsSearchEntry, language: string): string {
	const tabLabel = localizedSettingsTabLabel(entry.tab, language);
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
	language: string = i18n.language,
): SettingsSearchMatch[] {
	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery) return [];
	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	const localizedEntries = SETTINGS_SEARCH_ENTRIES.map((def) =>
		localizeSettingsSearchEntry(def, language),
	);
	return localizedEntries
		.filter((entry) => {
			const haystack = buildHaystack(entry, language);
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
			tabLabel: localizedSettingsTabLabel(entry.tab, language),
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
	const tabLabel = localizedSettingsTabLabel(entry.tab);
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
