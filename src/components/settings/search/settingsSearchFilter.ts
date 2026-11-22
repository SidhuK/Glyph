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

interface SearchableRow {
	searchId?: string;
	title?: string;
	description?: string;
	sectionTitle?: string;
}

interface SearchableSection {
	searchId?: string;
	title?: string;
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
	const tabMatches = filter.matches.filter((match) => match.tab === tab);
	if (tabMatches.some((match) => match.id === tabEntryId(tab))) return null;
	if (tabMatches.length === 0) return null;
	return { filter, tab, matches: tabMatches };
}

export function textMatchesTokens(text: string | undefined, tokens: readonly string[]) {
	if (!text) return false;
	const haystack = text.toLowerCase();
	return tokens.every((token) => haystack.includes(token));
}

export function sectionMatches(pane: SettingsPaneFilter, section: SearchableSection) {
	return (
		(section.searchId !== undefined &&
			pane.matches.some((match) => match.id === section.searchId)) ||
		(section.title !== undefined && pane.matches.some((match) => match.title === section.title)) ||
		textMatchesTokens(section.title, pane.filter.tokens)
	);
}

export function rowMatches(pane: SettingsPaneFilter, row: SearchableRow) {
	if (row.searchId !== undefined && pane.matches.some((match) => match.id === row.searchId)) {
		return true;
	}
	const titleMatch = pane.matches.some(
		(match) =>
			match.title === row.title &&
			(match.section === undefined || match.section === row.sectionTitle),
	);
	return (
		titleMatch ||
		textMatchesTokens(`${row.title ?? ""} ${row.description ?? ""}`, pane.filter.tokens)
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
