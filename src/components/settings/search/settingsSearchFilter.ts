import type { SettingsTab } from "../settingsConfig";
import { type SettingsSearchMatch, searchSettingsEntries } from "../settingsSearch";

export interface SettingsSearchFilter {
	query: string;
	tokens: readonly string[];
	matches: readonly SettingsSearchMatch[];
	matchedTabs: ReadonlySet<SettingsTab>;
}

export interface SettingsPaneFilter {
	filter: SettingsSearchFilter;
	tab: SettingsTab;
	matches: readonly SettingsSearchMatch[];
}

function tabEntryId(tab: SettingsTab) {
	return `${tab}-settings`;
}

export function buildSettingsSearchFilter(
	query: string,
	language: string,
	isTabVisible: (tab: SettingsTab) => boolean,
): SettingsSearchFilter | null {
	const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return null;
	const matches = searchSettingsEntries(query, undefined, language).filter((match) =>
		isTabVisible(match.tab),
	);
	return {
		query: query.trim(),
		tokens,
		matches,
		matchedTabs: new Set(matches.map((match) => match.tab)),
	};
}

export function paneFilterFor(
	filter: SettingsSearchFilter | null,
	tab: SettingsTab,
): SettingsPaneFilter | null {
	if (!filter) return null;
	const tabLabel = filter.matches.find((match) => match.tab === tab)?.tabLabel.toLowerCase();
	if (tabLabel && filter.tokens.every((token) => tabLabel.includes(token))) return null;
	const tabMatches = filter.matches.filter(
		(match) => match.tab === tab && match.id !== tabEntryId(tab),
	);
	if (tabMatches.length === 0) return null;
	return { filter, tab, matches: tabMatches };
}

export function isMatchedRow(pane: SettingsPaneFilter, row: { searchId?: string; title: string }) {
	return pane.matches.some(
		(match) =>
			(row.searchId !== undefined && match.id === row.searchId) || match.title === row.title,
	);
}

export interface HighlightedText {
	before: string;
	match: string;
	after: string;
}

export function splitFirstMatch(text: string, tokens: readonly string[]): HighlightedText | null {
	const lower = text.toLowerCase();
	const hits = tokens
		.map((token) => ({ token, index: lower.indexOf(token) }))
		.filter((hit) => hit.index >= 0)
		.sort((a, b) => a.index - b.index);
	const first = hits[0];
	if (!first) return null;
	const end = first.index + first.token.length;
	return {
		before: text.slice(0, first.index),
		match: text.slice(first.index, end),
		after: text.slice(end),
	};
}
