import type { AppSettings, RecentFile } from "../../lib/settings";
import type {
	PersonCount,
	SearchResult,
	TagCount,
	WorkspaceDatabaseSummary,
} from "../../lib/tauri";
import type { TemplateEntry } from "../../lib/templates";
import { formatCompactRelativeTime } from "../../lib/compactRelativeTime";
import { displayFolderFromPath, displayNameFromPath } from "../../utils/path";
import { localizeSettingsSearchEntry, localizedSettingsTabLabel } from "../settings/settingsSearch";
import {
	type Command,
	type PaletteLaunchMode,
	parsePaletteQuery,
	rankPaletteResult,
} from "./commandPaletteHelpers";
import {
	PALETTE_SETTINGS_REGISTRY,
	type PaletteSettingControl,
	type PaletteSettingDefinition,
	paletteSettingOptionLabel,
	paletteSettingOptions,
} from "./settingsPaletteRegistry";
import { type RankedResult, foldNoteRows, splitScopedGroup } from "./paletteResultGroups";
import type { WorkspaceTab } from "./useTabManager";

const PALETTE_GROUP_ORDER = [
	"command",
	"setting",
	"open-tab",
	"note",
	"content",
	"folder",
	"tag",
	"person",
	"database",
	"template",
	"action",
	"destination",
] as const;

export type PaletteResultKind = (typeof PALETTE_GROUP_ORDER)[number];

export interface PaletteResult {
	id: string;
	kind: PaletteResultKind;
	label: string;
	description?: string;
	/** Full folder path when `description` shows only its leaf. */
	descriptionTooltip?: string;
	category: string;
	keywords: readonly string[];
	enabled?: boolean;
	rankBoost?: number;
	defaultVisible?: boolean;
	trailing?: string;
	checked?: boolean;
	previewPath?: string;
	command?: Command;
	target?: string;
	snippet?: string;
	/** 0-based occurrence index when this row is a body match. */
	matchIndex?: number;
	/** Query text to open find-in-note for. */
	searchQuery?: string;
	/** 1-based line number of a body match, shown in its own column. */
	matchLine?: number;
	/** Content matches the note has in this search, for the preview's metadata line. */
	matchCount?: number;
	/** Tab id when the note is already open; the row switches to that tab. */
	openTabId?: string;
	settingId?: string;
	settingControl?: PaletteSettingControl;
	/** Group header; defaults to the kind's own label. */
	group?: string;
	/** What a no-results row does. */
	actionId?: "create-note" | "search-text" | "create-folder";
}

const BROAD_GROUP_LIMIT = 8;
/** With no query the command palette shows a short list of core commands and recent notes. */
const EMPTY_QUERY_GROUP_LIMIT = 5;
/** Content rows are one per occurrence, so this group is a match list, not a
 * note list, and needs room to show several hits from the same note. */
const CONTENT_GROUP_LIMIT = 50;

interface PaletteResultSources {
	commands: readonly Command[];
	settings: AppSettings | undefined;
	settingValue: (definition: PaletteSettingDefinition) => string | number | boolean | null;
	tabs: readonly WorkspaceTab[];
	titleMatches: readonly SearchResult[];
	contentMatches: readonly SearchResult[];
	recentFiles: readonly RecentFile[];
	folders: readonly string[];
	tags: readonly TagCount[];
	people: readonly PersonCount[];
	databases: readonly WorkspaceDatabaseSummary[];
	templates: readonly TemplateEntry[];
}

interface BuildPaletteResultsInput {
	query: string;
	mode: PaletteLaunchMode;
	spacePath: string | null;
	templateFolder: string | null;
	/** The note already on screen is left out of the empty-query recents. */
	activePath?: string | null;
	language: string;
	t: (key: string, options?: Record<string, unknown>) => string;
	sources: PaletteResultSources;
}

/**
 * Rows show the note's leaf folder, with the full path as its tooltip. Folder notes live in a
 * folder of the same name; repeating it as the last segment is noise.
 */
function noteFolder(path: string, title: string, noFolderLabel: string) {
	const folder = displayFolderFromPath(path);
	const repeated = ` / ${title}`;
	const full =
		folder === title ? "" : folder.endsWith(repeated) ? folder.slice(0, -repeated.length) : folder;
	return {
		description: full ? (full.split(" / ").pop() ?? "") : noFolderLabel,
		descriptionTooltip: full || undefined,
	};
}

/**
 * The command palette lists each note once, at its first hit, with a count of the rest. The
 * search surface keeps one row per occurrence so each can be opened at its own position.
 */
function collapseContentMatches(matches: readonly SearchResult[]) {
	const counts = new Map<string, number>();
	for (const match of matches) counts.set(match.id, (counts.get(match.id) ?? 0) + 1);
	const seen = new Set<string>();
	return matches.flatMap((match) => {
		if (seen.has(match.id)) return [];
		seen.add(match.id);
		return [{ result: match, extraMatches: (counts.get(match.id) ?? 1) - 1 }];
	});
}

function displaySettingValue(
	definition: PaletteSettingDefinition,
	value: string | number | null,
	settings: AppSettings | undefined,
	t: BuildPaletteResultsInput["t"],
) {
	if (value === null || value === "") return t("commandPalette.notSet");
	const option = paletteSettingOptions(definition, settings).find(
		(candidate) => candidate.value === value,
	);
	if (option) return paletteSettingOptionLabel(option);
	return String(value);
}

export function buildPaletteResults({
	query,
	mode,
	spacePath,
	templateFolder,
	activePath,
	language,
	t,
	sources,
}: BuildPaletteResultsInput): PaletteResult[] {
	const parsedQuery = parsePaletteQuery(query);
	const candidates: PaletteResult[] = [];
	for (const [index, command] of sources.commands.entries()) {
		if (command.enabled === false) continue;
		candidates.push({
			id: `command:${command.id}`,
			kind: "command",
			label: command.label ?? command.id,
			category: command.category ?? t("commandPalette.sectionGeneral"),
			keywords: [command.id, ...(command.searchTerms ?? [])],
			defaultVisible: !command.hideWhenQueryEmpty && index < BROAD_GROUP_LIMIT,
			rankBoost: mode === "commands" ? 20 : 0,
			command,
		});
	}

	if (sources.settings) {
		for (const definition of PALETTE_SETTINGS_REGISTRY) {
			if (definition.scope === "space" && !spacePath) continue;
			const entry = localizeSettingsSearchEntry(
				{ id: definition.id, tab: definition.tab },
				language,
			);
			const value = sources.settingValue(definition);
			candidates.push({
				id: `setting:${definition.id}`,
				kind: "setting",
				label: entry.title,
				// The pane name is enough to place a setting; its section stays searchable.
				description: localizedSettingsTabLabel(entry.tab, language),
				category: t("commandPalette.groups.setting"),
				keywords: [
					"settings",
					entry.section ?? "",
					entry.description ?? "",
					...(entry.keywords ?? []),
				],
				// Settings only appear once the user types; the toggle itself shows on/off state.
				rankBoost: definition.scope === "space" && spacePath ? 10 : 0,
				checked: typeof value === "boolean" ? value : undefined,
				trailing:
					definition.control === "action" || typeof value === "boolean"
						? undefined
						: displaySettingValue(definition, value, sources.settings, t),
				settingId: definition.id,
				settingControl: definition.control,
			});
		}
	}

	for (const tab of sources.tabs) {
		if (tab.kind !== "file" || !tab.target) continue;
		const label = displayNameFromPath(tab.target);
		candidates.push({
			id: `open-tab:${tab.id}`,
			kind: "open-tab",
			label,
			...noteFolder(tab.target, label, t("folio.noFolder")),
			category: t("commandPalette.groups.open-tab"),
			keywords: [tab.target],
			defaultVisible: mode === "search",
			rankBoost: 35,
			previewPath: tab.target,
			target: tab.id,
		});
	}

	const contentSource =
		mode === "commands"
			? collapseContentMatches(sources.contentMatches)
			: sources.contentMatches.map((result) => ({ result, extraMatches: 0 }));
	const noteSource: {
		result: SearchResult;
		kind: "note" | "content";
		extraMatches: number;
		/** Set for recents, which are listed before a query. */
		openedAt?: number;
	}[] = query.trim()
		? [
				...sources.titleMatches.map((result) => ({
					result,
					kind: "note" as const,
					extraMatches: 0,
				})),
				...contentSource.map(({ result, extraMatches }) => ({
					result,
					kind: "content" as const,
					extraMatches,
				})),
			]
		: sources.recentFiles
				.filter((file) => file.path !== activePath)
				.map((file) => {
					const result: SearchResult = {
						id: file.path,
						title: displayNameFromPath(file.path),
						snippet: "",
						score: 0,
					};
					return {
						result,
						kind: "note" as const,
						extraMatches: 0,
						openedAt: file.openedAt,
					};
				});
	const matchCounts = new Map<string, number>();
	for (const match of sources.contentMatches) {
		matchCounts.set(match.id, (matchCounts.get(match.id) ?? 0) + 1);
	}
	const nowMs = Date.now();
	for (const { result, kind, extraMatches, openedAt } of noteSource) {
		const matchIndex = typeof result.match_index === "number" ? result.match_index : undefined;
		const matchLine = typeof result.line === "number" ? result.line : undefined;
		const label = result.title || displayNameFromPath(result.id);
		candidates.push({
			id:
				kind === "content" && matchIndex != null
					? `${kind}:${result.id}:${matchIndex}`
					: `${kind}:${result.id}`,
			kind,
			label,
			...noteFolder(result.id, label, t("folio.noFolder")),
			trailing:
				extraMatches > 0
					? t("commandPalette.moreMatches", { count: extraMatches })
					: openedAt !== undefined
						? formatCompactRelativeTime({
								timestampMs: openedAt,
								locale: language,
								nowMs,
								justNowLabel: t("folio.justNow"),
								absoluteDate: new Date(openedAt).toLocaleDateString(language),
							})
						: undefined,
			// Before a query the notes are what was opened lately, newest first.
			group: openedAt !== undefined ? t("commandPalette.groups.recent") : undefined,
			category: t(`commandPalette.groups.${kind}`),
			keywords: [result.id, parsedQuery.text],
			defaultVisible: !query.trim(),
			rankBoost: mode === "search" ? 25 : 0,
			previewPath: result.id,
			target: result.id,
			snippet: kind === "content" ? result.snippet : undefined,
			matchIndex,
			matchLine: kind === "content" ? matchLine : undefined,
			matchCount: matchCounts.get(result.id),
			// The backend owns query parsing, so it reports the literal text its
			// match index counts; reparsing here would drift on quotes and operators.
			searchQuery: result.match_query ?? undefined,
		});
	}

	for (const folder of sources.folders) {
		candidates.push({
			id: `folder:${folder}`,
			kind: "folder",
			label: folder,
			category: t("commandPalette.groups.folder"),
			keywords: [folder],
			target: folder,
		});
	}
	const references = [
		...sources.tags.map(({ tag, total_count }) => ({
			kind: "tag" as const,
			label: tag,
			count: total_count,
		})),
		...sources.people.map(({ handle, count }) => ({
			kind: "person" as const,
			label: handle,
			count,
		})),
	];
	for (const { kind, label, count } of references) {
		candidates.push({
			id: `${kind}:${label}`,
			kind,
			label,
			category: t(`commandPalette.groups.${kind}`),
			keywords: [label.slice(1)],
			trailing: String(count),
			target: label,
		});
	}
	for (const database of sources.databases) {
		candidates.push({
			id: `database:${database.id}`,
			kind: "database",
			label: database.name,
			description: database.source.value,
			category: t("commandPalette.groups.database"),
			keywords: [database.source.kind, database.source.value],
			rankBoost: database.pinned ? 20 : 0,
			target: database.id,
		});
	}
	for (const template of sources.templates) {
		const label = template.relPath.startsWith(`${templateFolder}/`)
			? template.relPath.slice((templateFolder?.length ?? 0) + 1)
			: template.relPath;
		candidates.push({
			id: `template:${template.relPath}`,
			kind: "template",
			label: label.replace(/\.md$/i, ""),
			description: template.relPath,
			category: t("commandPalette.groups.template"),
			keywords: [template.name, template.relPath],
			target: template.relPath,
		});
	}

	const ranked = foldNoteRows(
		candidates
			.map((result) => ({
				result,
				score: rankPaletteResult(result, parsedQuery),
			}))
			.filter((item): item is RankedResult => item.score !== null),
	);
	const scoped = parsedQuery.scope !== "all";
	const byKind = new Map<PaletteResultKind, typeof ranked>();
	for (const item of ranked) {
		const group = byKind.get(item.result.kind) ?? [];
		group.push(item);
		byKind.set(item.result.kind, group);
	}
	const groupOrder =
		mode === "search"
			? [
					"open-tab" as const,
					"note" as const,
					"content" as const,
					...PALETTE_GROUP_ORDER.filter(
						(kind) => kind !== "open-tab" && kind !== "note" && kind !== "content",
					),
				]
			: PALETTE_GROUP_ORDER;
	const emptyQuery = !query.trim();
	return groupOrder.flatMap((kind) => {
		const group = byKind.get(kind) ?? [];
		// With no query, keep source order: commands as registered, recent notes by recency.
		group.sort(
			(a, b) =>
				b.score - a.score || (emptyQuery ? 0 : a.result.label.localeCompare(b.result.label)),
		);
		const split = splitScopedGroup(group, parsedQuery.scope, language, t);
		if (split) return split.map(({ result }) => result);
		// Only the search surface is a match list; the command palette stays tight.
		const groupLimit =
			kind === "content" && mode === "search"
				? CONTENT_GROUP_LIMIT
				: emptyQuery && mode === "commands"
					? EMPTY_QUERY_GROUP_LIMIT
					: BROAD_GROUP_LIMIT;
		return group.slice(0, scoped ? undefined : groupLimit).map(({ result }) => result);
	});
}
