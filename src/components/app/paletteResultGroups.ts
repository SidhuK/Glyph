import { SHORTCUT_CATEGORIES } from "../../lib/shortcuts/registry";
import { SETTINGS_TABS } from "../settings/settingsConfig";
import { localizedSettingsTabLabel } from "../settings/settingsSearch";
import type { ParsedPaletteQuery } from "./commandPaletteHelpers";
import type { PaletteResult } from "./paletteResults";
import { PALETTE_SETTING_BY_ID } from "./settingsPaletteRegistry";

export interface RankedResult {
	result: PaletteResult;
	score: number;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * One row per note. A title match absorbs the note's open tab and content matches, keeping the
 * first (best) snippet. Without a title match, the note's first content match absorbs the tab
 * and later occurrences keep their own rows so each can still be opened at its position.
 */
export function foldNoteRows(ranked: readonly RankedResult[]): RankedResult[] {
	const tabIds = new Map<string, string>();
	const titled = new Set<string>();
	const firstContent = new Map<string, PaletteResult>();
	for (const { result } of ranked) {
		const path = result.previewPath;
		if (!path) continue;
		if (result.kind === "open-tab" && result.target) tabIds.set(path, result.target);
		if (result.kind === "note") titled.add(path);
		if (result.kind === "content" && !firstContent.has(path)) firstContent.set(path, result);
	}
	return ranked.flatMap((item) => {
		const { result } = item;
		const path = result.previewPath;
		if (!path) return [item];
		const openTabId = tabIds.get(path);
		switch (result.kind) {
			case "open-tab":
				return titled.has(path) || firstContent.has(path) ? [] : [item];
			case "note":
				return [
					{
						...item,
						result: {
							...result,
							openTabId,
							snippet: result.snippet ?? firstContent.get(path)?.snippet,
						},
					},
				];
			case "content":
				if (titled.has(path)) return [];
				return firstContent.get(path) === result && openTabId
					? [{ ...item, result: { ...result, openTabId } }]
					: [item];
			default:
				return [item];
		}
	});
}

function rankOf(order: readonly string[], value: string | undefined) {
	const index = value ? order.indexOf(value) : -1;
	return index >= 0 ? index : order.length;
}

const SETTINGS_TAB_ORDER = SETTINGS_TABS.map((tab) => tab.id);

/**
 * Inside the ">" and "settings:" scopes one group would hold everything, so commands split by
 * their manifest category and settings by their pane, each in the order the app lists them.
 * The group header then names the pane, so setting rows drop it from their own line.
 */
export function splitScopedGroup(
	group: readonly RankedResult[],
	scope: ParsedPaletteQuery["scope"],
	language: string,
	t: Translate,
): RankedResult[] | null {
	if (scope === "commands") {
		return group
			.map((item) => ({
				item: {
					...item,
					result: {
						...item.result,
						group: item.result.command?.category ?? t("commandPalette.sectionGeneral"),
					},
				},
				rank: rankOf(SHORTCUT_CATEGORIES, item.result.command?.categoryId),
			}))
			.sort((a, b) => a.rank - b.rank)
			.map(({ item }) => item);
	}
	if (scope === "settings") {
		return group
			.map((item) => {
				const tab = item.result.settingId
					? PALETTE_SETTING_BY_ID.get(item.result.settingId)?.tab
					: undefined;
				return {
					item: {
						...item,
						result: {
							...item.result,
							description: undefined,
							group: tab ? localizedSettingsTabLabel(tab, language) : item.result.category,
						},
					},
					rank: rankOf(SETTINGS_TAB_ORDER, tab),
				};
			})
			.sort((a, b) => a.rank - b.rank)
			.map(({ item }) => item);
	}
	return null;
}

/** Scopes that never list notes, so searching note text is a way out of them. */
const NOTELESS_SCOPES = new Set<ParsedPaletteQuery["scope"]>([
	"commands",
	"settings",
	"folders",
	"templates",
]);

/** Next steps when nothing matched: create the note, or widen a scoped query to note text. */
export function noResultActions(
	parsed: ParsedPaletteQuery,
	spacePath: string | null,
	t: Translate,
): PaletteResult[] {
	const text = parsed.text.trim();
	if (!text || !spacePath) return [];
	const base = { kind: "action" as const, category: "", keywords: [], target: text };
	if (parsed.scope === "all") {
		return [
			{
				...base,
				id: "action:create-note",
				label: t("commandPalette.createNote", { title: text }),
				actionId: "create-note",
			},
		];
	}
	if (NOTELESS_SCOPES.has(parsed.scope)) {
		return [
			{
				...base,
				id: "action:search-text",
				label: t("commandPalette.searchNoteText", { query: text }),
				actionId: "search-text",
			},
		];
	}
	return [];
}
