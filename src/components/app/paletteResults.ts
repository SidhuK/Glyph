import type { AppSettings, RecentFile } from "../../lib/settings";
import type {
	PersonCount,
	SearchResult,
	TagCount,
	WorkspaceDatabaseSummary,
} from "../../lib/tauri";
import type { TemplateEntry } from "../../lib/templates";
import { displayFolderFromPath, displayNameFromPath } from "../../utils/path";
import {
	localizeSettingsSearchEntry,
	localizedSettingsTabLabel,
} from "../settings/settingsSearch";
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
} from "./settingsPaletteRegistry";
import type { WorkspaceTab } from "./useTabManager";

export const PALETTE_GROUP_ORDER = [
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
] as const;

export type PaletteResultKind = (typeof PALETTE_GROUP_ORDER)[number];

export interface PaletteResult {
	id: string;
	kind: PaletteResultKind;
	label: string;
	description?: string;
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
	/** 1-based line number for display. */
	matchLine?: number;
	settingId?: string;
	settingControl?: PaletteSettingControl;
}

const BROAD_GROUP_LIMIT = 8;
/** Content rows are one per occurrence, so this group is a match list, not a
 * note list, and needs room to show several hits from the same note. */
const CONTENT_GROUP_LIMIT = 50;

interface PaletteResultSources {
	commands: readonly Command[];
	settings: AppSettings | undefined;
	settingValue: (
		definition: PaletteSettingDefinition,
	) => string | number | boolean | null;
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
	language: string;
	t: (key: string, options?: Record<string, unknown>) => string;
	sources: PaletteResultSources;
}

function displaySettingValue(
	definition: PaletteSettingDefinition,
	value: string | number | boolean | null,
	t: BuildPaletteResultsInput["t"],
) {
	if (typeof value === "boolean") {
		return t(value ? "commandPalette.on" : "commandPalette.off");
	}
	if (value === null || value === "") return t("commandPalette.notSet");
	const option = definition.options?.find(
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
				description: [
					localizedSettingsTabLabel(entry.tab, language),
					entry.section,
				]
					.filter(Boolean)
					.join(" / "),
				category: t("commandPalette.groups.setting"),
				keywords: [
					"settings",
					entry.description ?? "",
					...(entry.keywords ?? []),
				],
				defaultVisible: definition.defaultVisible,
				rankBoost: definition.scope === "space" && spacePath ? 10 : 0,
				checked: typeof value === "boolean" ? value : undefined,
				trailing:
					definition.control === "action"
						? undefined
						: displaySettingValue(definition, value, t),
				settingId: definition.id,
				settingControl: definition.control,
			});
		}
	}

	for (const tab of sources.tabs) {
		if (tab.kind !== "file" || !tab.target) continue;
		candidates.push({
			id: `open-tab:${tab.id}`,
			kind: "open-tab",
			label: displayNameFromPath(tab.target),
			description: displayFolderFromPath(tab.target),
			category: t("commandPalette.groups.open-tab"),
			keywords: [tab.target],
			defaultVisible: true,
			rankBoost: 35,
			previewPath: tab.target,
			target: tab.id,
		});
	}

	const noteSource = query.trim()
		? [
				...sources.titleMatches.map((result) => ({
					result,
					kind: "note" as const,
				})),
				...sources.contentMatches.map((result) => ({
					result,
					kind: "content" as const,
				})),
			]
		: sources.recentFiles.map((file) => {
				const result: SearchResult = {
					id: file.path,
					title: displayNameFromPath(file.path),
					snippet: "",
					score: 0,
				};
				return { result, kind: "note" as const };
			});
	for (const { result, kind } of noteSource) {
		const matchIndex =
			typeof result.match_index === "number" ? result.match_index : undefined;
		const matchLine = typeof result.line === "number" ? result.line : undefined;
		const folder = displayFolderFromPath(result.id);
		const description =
			kind === "content" && matchLine != null
				? folder
					? `${folder} · L${matchLine}`
					: `L${matchLine}`
				: folder;
		candidates.push({
			id:
				kind === "content" && matchIndex != null
					? `${kind}:${result.id}:${matchIndex}`
					: `${kind}:${result.id}`,
			kind,
			label: result.title || displayNameFromPath(result.id),
			description,
			category: t(`commandPalette.groups.${kind}`),
			keywords: [result.id, parsedQuery.text],
			defaultVisible: !query.trim(),
			rankBoost: mode === "search" ? 25 : 0,
			previewPath: result.id,
			target: result.id,
			snippet: kind === "content" ? result.snippet : undefined,
			matchIndex,
			matchLine,
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

	const ranked = candidates
		.map((result) => ({
			result,
			score: rankPaletteResult(result, parsedQuery),
		}))
		.filter(
			(item): item is { result: PaletteResult; score: number } =>
				item.score !== null,
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
						(kind) =>
							kind !== "open-tab" && kind !== "note" && kind !== "content",
					),
				]
			: PALETTE_GROUP_ORDER;
	return groupOrder.flatMap((kind) => {
		const group = byKind.get(kind) ?? [];
		group.sort(
			(a, b) =>
				b.score - a.score || a.result.label.localeCompare(b.result.label),
		);
		// Only the search surface is a match list; the command palette stays tight.
		const groupLimit =
			kind === "content" && mode === "search"
				? CONTENT_GROUP_LIMIT
				: BROAD_GROUP_LIMIT;
		return group
			.slice(0, scoped ? undefined : groupLimit)
			.map(({ result }) => result);
	});
}
