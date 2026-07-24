import { cn } from "@/lib/utils";
import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext } from "../../contexts";
import { nextCollectionName } from "../../lib/database/collection";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	invalidateDatabaseSummariesPrefetch,
	navigationQueryKeys,
} from "../../lib/navigationPrefetch";
import { loadSettings } from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { listTemplates } from "../../lib/templates";
import { toast } from "../../lib/toast";
import { displayFolderFromPath, displayNameFromPath } from "../../utils/path";
import { NotePreviewContent } from "../preview/NotePreviewContent";
import { NOTE_PREVIEW_OPEN_DELAY_MS } from "../preview/notePreviewShared";
import { useNotePreview } from "../preview/useNotePreview";
import {
	localizeSettingsSearchEntry,
	localizedSettingsTabLabel,
} from "../settings/settingsSearch";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";
import { CommandList } from "./CommandList";
import { PaletteSettingEditor } from "./PaletteSettingEditor";
import {
	type Command,
	type PaletteLaunchMode,
	buildSearchQuery,
	movePaletteSelection,
	parsePaletteQuery,
	rankPaletteResult,
	stepPaletteOption,
} from "./commandPaletteHelpers";
import { PALETTE_GROUP_ORDER, type PaletteResult } from "./paletteResults";
import {
	PALETTE_SETTINGS_REGISTRY,
	PALETTE_SETTING_BY_ID,
	type PaletteSettingDefinition,
} from "./settingsPaletteRegistry";
import { useCommandSearch } from "./useCommandSearch";
import type { WorkspaceTab } from "./useTabManager";

export type { Command } from "./commandPaletteHelpers";

interface CommandPaletteProps {
	open: boolean;
	initialMode?: PaletteLaunchMode;
	initialQuery?: string;
	commands: Command[];
	onClose: () => void;
	spacePath: string | null;
	tabs: WorkspaceTab[];
	onActivateTab: (id: string) => void;
	onSelectSearchResult: (id: string) => void;
	onRevealFolder: (path: string) => void;
	onOpenDatabase: (id: string) => void;
	templateFolder: string | null;
	onCreateFromTemplate: (template: { relPath: string; label: string }) => void;
}

interface SettingMutationVariables {
	definition: PaletteSettingDefinition;
	value: string | number | boolean | null;
}

const SETTINGS_QUERY_ROOT = "command-palette-settings";
const BROAD_GROUP_LIMIT = 8;

function displaySettingValue(
	definition: PaletteSettingDefinition,
	value: string | number | boolean | null,
	t: (key: string, options?: Record<string, unknown>) => string,
) {
	if (typeof value === "boolean") {
		return t(value ? "commandPalette.on" : "commandPalette.off");
	}
	if (value === null || value === "") return t("commandPalette.notSet");
	if (definition.control === "choice") {
		const option = definition.options?.find(
			(candidate) => candidate.value === value,
		);
		if (option) return option.label;
	}
	return String(value);
}

function hasOwnValue(
	values: Record<string, string | number | boolean | null>,
	id: string,
) {
	return Object.prototype.hasOwnProperty.call(values, id);
}

function flattenFolders(
	rootEntries: ReturnType<typeof useFileTreeContext>["rootEntries"],
	childrenByDir: ReturnType<typeof useFileTreeContext>["childrenByDir"],
) {
	const folders = new Set<string>();
	for (const entry of rootEntries) {
		if (entry.kind === "dir") folders.add(entry.rel_path);
	}
	for (const entries of Object.values(childrenByDir)) {
		for (const entry of entries ?? []) {
			if (entry.kind === "dir") folders.add(entry.rel_path);
		}
	}
	return [...folders].sort((a, b) => a.localeCompare(b));
}

export function CommandPalette({
	open,
	initialMode = "commands",
	initialQuery = "",
	commands,
	onClose,
	spacePath,
	tabs,
	onActivateTab,
	onSelectSearchResult,
	onRevealFolder,
	onOpenDatabase,
	templateFolder,
	onCreateFromTemplate,
}: CommandPaletteProps) {
	const { t, i18n } = useTranslation("shell");
	const queryClient = useQueryClient();
	const { rootEntries, childrenByDir, tags, people, ensureTagsFresh } =
		useFileTreeContext();
	const [query, setQuery] = useState(initialQuery);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [activeSettingId, setActiveSettingId] = useState<string | null>(null);
	const [activeTemplatePath, setActiveTemplatePath] = useState<string | null>(
		null,
	);
	const [optimisticValues, setOptimisticValues] = useState<
		Record<string, string | number | boolean | null>
	>({});
	const [mutationError, setMutationError] = useState<string | null>(null);
	const [settingAnnouncement, setSettingAnnouncement] = useState("");
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const parsedQuery = useMemo(() => parsePaletteQuery(query), [query]);
	const settingsQueryKey = [SETTINGS_QUERY_ROOT, spacePath] as const;

	const settingsQuery = useQuery({
		queryKey: settingsQueryKey,
		queryFn: () => loadSettings({ spacePath }),
		enabled: open,
	});
	useTauriEvent("settings:updated", () => {
		void queryClient.invalidateQueries({ queryKey: [SETTINGS_QUERY_ROOT] });
	});
	useEffect(() => {
		if (!open) return;
		restoreFocusRef.current =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		void ensureTagsFresh();
	}, [ensureTagsFresh, open]);

	const closeAndRestoreFocus = useCallback(() => {
		onClose();
		window.requestAnimationFrame(() => restoreFocusRef.current?.focus());
	}, [onClose]);

	const searchEnabled =
		parsedQuery.scope === "all" ||
		parsedQuery.scope === "tags" ||
		parsedQuery.scope === "people";
	const searchQuery =
		parsedQuery.scope === "tags" || parsedQuery.scope === "people"
			? parsedQuery.raw
			: parsedQuery.text;
	const { recentFiles, isSearching, titleMatches, contentMatches } =
		useCommandSearch(
			searchQuery,
			spacePath,
			searchEnabled,
			settingsQuery.data?.editor.enablePeopleMentionsAsTags ?? false,
		);

	const databaseSummaries = useQuery({
		queryKey: navigationQueryKeys.databaseSummaries(),
		queryFn: () => invoke("databases_list"),
		enabled: open && Boolean(spacePath),
	});
	const templatesQuery = useQuery({
		queryKey: ["command-palette-templates", spacePath, templateFolder],
		queryFn: () => listTemplates(templateFolder ?? ""),
		enabled: open && Boolean(spacePath && templateFolder),
	});
	const saveSearch = useMutation({
		mutationFn: async (rawQuery: string) => {
			const trimmed = rawQuery.trim();
			const summaries = databaseSummaries.data;
			if (!summaries) throw new Error(t("commandPalette.saveSearchFailed"));
			const baseName =
				trimmed.length > 56 ? `${trimmed.slice(0, 53)}…` : trimmed;
			return invoke("databases_create", {
				name: nextCollectionName(summaries, baseName),
				folder: null,
				source: { kind: "search", value: trimmed, recursive: false },
				pinned: true,
			});
		},
		onSuccess: () => {
			invalidateDatabaseSummariesPrefetch();
			toast.success(t("commandPalette.searchSaved"));
		},
		onError: (cause) => {
			toast.error(t("commandPalette.saveSearchFailed"), {
				description: extractErrorMessage(cause),
			});
		},
	});

	const settingMutation = useMutation({
		mutationFn: async ({ definition, value }: SettingMutationVariables) => {
			if (!definition.write) throw new Error(t("commandPalette.readOnly"));
			if (definition.scope === "space" && !spacePath) {
				throw new Error(t("commandPalette.spaceRequired"));
			}
			await definition.write(value, spacePath);
		},
		onMutate: ({ definition, value }) => {
			setMutationError(null);
			setSettingAnnouncement("");
			setOptimisticValues((current) => ({
				...current,
				[definition.id]: value,
			}));
		},
		onSuccess: async (_, { definition }) => {
			await queryClient.invalidateQueries({ queryKey: settingsQueryKey });
			setSettingAnnouncement(t("commandPalette.settingUpdated"));
			setOptimisticValues((current) => {
				const next = { ...current };
				delete next[definition.id];
				return next;
			});
		},
		onError: (cause, { definition }) => {
			const message = extractErrorMessage(cause);
			setMutationError(message);
			setOptimisticValues((current) => {
				const next = { ...current };
				delete next[definition.id];
				return next;
			});
			toast.error(t("commandPalette.settingUpdateFailed"), {
				description: message,
			});
		},
	});

	const folders = useMemo(
		() => flattenFolders(rootEntries, childrenByDir),
		[rootEntries, childrenByDir],
	);
	const candidates = useMemo(() => {
		const next: PaletteResult[] = [];
		for (const [index, command] of commands.entries()) {
			if (command.enabled === false) continue;
			next.push({
				id: `command:${command.id}`,
				kind: "command",
				label: command.label ?? command.id,
				category: command.category ?? t("commandPalette.sectionGeneral"),
				keywords: [command.id, ...(command.searchTerms ?? [])],
				enabled: true,
				defaultVisible:
					!command.hideWhenQueryEmpty && index < BROAD_GROUP_LIMIT,
				rankBoost: initialMode === "commands" ? 20 : 0,
				command,
			});
		}

		const settings = settingsQuery.data;
		if (settings) {
			for (const definition of PALETTE_SETTINGS_REGISTRY) {
				if (!definition.write || (definition.scope === "space" && !spacePath)) {
					continue;
				}
				const entry = localizeSettingsSearchEntry(
					{
						id: definition.id,
						tab: definition.tab,
					},
					i18n.language,
				);
				const hasOptimisticValue = hasOwnValue(optimisticValues, definition.id);
				const value = hasOptimisticValue
					? (optimisticValues[definition.id] ?? null)
					: definition.read(settings);
				next.push({
					id: `setting:${definition.id}`,
					kind: "setting",
					label: entry.title,
					description: [
						localizedSettingsTabLabel(entry.tab, i18n.language),
						entry.section,
					]
						.filter(Boolean)
						.join(" / "),
					category: t("commandPalette.groups.setting"),
					keywords: definition.sensitive
						? ["settings", ...(entry.keywords ?? [])]
						: ["settings", entry.description ?? "", ...(entry.keywords ?? [])],
					enabled: true,
					defaultVisible: definition.defaultVisible,
					rankBoost: definition.scope === "space" && spacePath ? 10 : 0,
					checked: typeof value === "boolean" ? value : undefined,
					trailing:
						definition.control === "action"
							? undefined
							: definition.sensitive
								? t("commandPalette.secretMasked")
								: displaySettingValue(definition, value, t),
					settingId: definition.id,
					settingControl: definition.control,
				});
			}
		}

		for (const tab of tabs) {
			if (tab.kind !== "file" || !tab.target) continue;
			next.push({
				id: `open-tab:${tab.id}`,
				kind: "open-tab",
				label: displayNameFromPath(tab.target),
				description: displayFolderFromPath(tab.target),
				category: t("commandPalette.groups.open-tab"),
				keywords: [tab.target],
				enabled: true,
				defaultVisible: true,
				rankBoost: 35,
				previewPath: tab.target,
				target: tab.id,
			});
		}

		const noteSource = query.trim()
			? [
					...titleMatches.map((result) => ({ result, kind: "note" as const })),
					...contentMatches.map((result) => ({
						result,
						kind: "content" as const,
					})),
				]
			: recentFiles.map((file) => ({
					result: {
						id: file.path,
						title: displayNameFromPath(file.path),
						snippet: "",
					},
					kind: "note" as const,
				}));
		for (const { result, kind } of noteSource) {
			next.push({
				id: `${kind}:${result.id}`,
				kind,
				label: result.title || displayNameFromPath(result.id),
				description: displayFolderFromPath(result.id),
				category: t(`commandPalette.groups.${kind}`),
				keywords: [result.id, parsedQuery.text],
				enabled: true,
				defaultVisible: !query.trim(),
				rankBoost: initialMode === "search" ? 25 : 0,
				previewPath: result.id,
				target: result.id,
				snippet: kind === "content" ? result.snippet : undefined,
			});
		}

		for (const folder of folders) {
			next.push({
				id: `folder:${folder}`,
				kind: "folder",
				label: folder,
				category: t("commandPalette.groups.folder"),
				keywords: [folder],
				enabled: true,
				target: folder,
			});
		}
		for (const tag of tags) {
			next.push({
				id: `tag:${tag.tag}`,
				kind: "tag",
				label: tag.tag,
				category: t("commandPalette.groups.tag"),
				keywords: [tag.tag.replace(/^#/, "")],
				enabled: true,
				trailing: String(tag.total_count),
				target: tag.tag,
			});
		}
		for (const person of people) {
			next.push({
				id: `person:${person.handle}`,
				kind: "person",
				label: person.handle,
				category: t("commandPalette.groups.person"),
				keywords: [person.handle.replace(/^@/, "")],
				enabled: true,
				trailing: String(person.count),
				target: person.handle,
			});
		}
		for (const database of databaseSummaries.data ?? []) {
			next.push({
				id: `database:${database.id}`,
				kind: "database",
				label: database.name,
				description: database.source.value,
				category: t("commandPalette.groups.database"),
				keywords: [database.source.kind, database.source.value],
				enabled: true,
				rankBoost: database.pinned ? 20 : 0,
				target: database.id,
			});
		}
		for (const template of templatesQuery.data ?? []) {
			const label = template.relPath.startsWith(`${templateFolder}/`)
				? template.relPath.slice((templateFolder?.length ?? 0) + 1)
				: template.relPath;
			next.push({
				id: `template:${template.relPath}`,
				kind: "template",
				label: label.replace(/\.md$/i, ""),
				description: template.relPath,
				category: t("commandPalette.groups.template"),
				keywords: [template.name, template.relPath],
				enabled: true,
				target: template.relPath,
			});
		}
		return next;
	}, [
		commands,
		settingsQuery.data,
		optimisticValues,
		tabs,
		query,
		titleMatches,
		contentMatches,
		recentFiles,
		folders,
		tags,
		people,
		databaseSummaries.data,
		templatesQuery.data,
		templateFolder,
		i18n.language,
		initialMode,
		parsedQuery.text,
		spacePath,
		t,
	]);

	const results = useMemo(() => {
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
		const byKind = new Map<string, typeof ranked>();
		for (const item of ranked) {
			const group = byKind.get(item.result.kind) ?? [];
			group.push(item);
			byKind.set(item.result.kind, group);
		}
		const ordered: PaletteResult[] = [];
		const groupOrder =
			initialMode === "search"
				? [
						"open-tab",
						"note",
						"content",
						...PALETTE_GROUP_ORDER.filter(
							(kind) =>
								kind !== "open-tab" && kind !== "note" && kind !== "content",
						),
					]
				: PALETTE_GROUP_ORDER;
		for (const kind of groupOrder) {
			const group = byKind.get(kind) ?? [];
			group.sort(
				(a, b) =>
					b.score - a.score || a.result.label.localeCompare(b.result.label),
			);
			ordered.push(
				...group
					.slice(0, scoped ? undefined : BROAD_GROUP_LIMIT)
					.map(({ result }) => result),
			);
		}
		return ordered;
	}, [candidates, initialMode, parsedQuery]);

	const resolvedSelectedIndex = useMemo(() => {
		if (!results.length) return 0;
		const preservedIndex = selectedId
			? results.findIndex((result) => result.id === selectedId)
			: -1;
		if (preservedIndex >= 0 && results[preservedIndex]?.enabled) {
			return preservedIndex;
		}
		const firstEnabledId = movePaletteSelection(results, null, 1);
		const firstEnabledIndex = results.findIndex(
			(result) => result.id === firstEnabledId,
		);
		return Math.max(firstEnabledIndex, 0);
	}, [results, selectedId]);
	const selectedResult = results[resolvedSelectedIndex];
	const selectedPreviewPath =
		initialMode === "search" ? (selectedResult?.previewPath ?? null) : null;
	const notePreview = useNotePreview(selectedPreviewPath, {
		delayMs: NOTE_PREVIEW_OPEN_DELAY_MS,
	});

	useEffect(() => {
		const selected = listRef.current?.querySelector<HTMLElement>(
			`[data-command-index="${resolvedSelectedIndex}"]`,
		);
		selected?.scrollIntoView({ block: "nearest" });
	}, [resolvedSelectedIndex]);

	const updateSetting = useCallback(
		(
			definition: PaletteSettingDefinition,
			value: string | number | boolean | null,
		) => settingMutation.mutate({ definition, value }),
		[settingMutation],
	);

	const adjustSetting = useCallback(
		(index: number, direction: -1 | 1) => {
			const result = results[index];
			const definition = result?.settingId
				? PALETTE_SETTING_BY_ID.get(result.settingId)
				: undefined;
			const snapshot = settingsQuery.data;
			if (!result?.enabled || !definition || !snapshot) {
				return false;
			}
			if (settingMutation.isPending) {
				return (
					definition.control === "toggle" || definition.control === "choice"
				);
			}
			const current = hasOwnValue(optimisticValues, definition.id)
				? optimisticValues[definition.id]
				: definition.read(snapshot);
			if (definition.control === "toggle" && typeof current === "boolean") {
				updateSetting(definition, !current);
				return true;
			}
			if (definition.control === "choice") {
				const nextValue = stepPaletteOption(
					definition.options ?? [],
					current ?? null,
					direction,
				);
				if (nextValue !== null) {
					updateSetting(definition, nextValue);
					return true;
				}
			}
			return false;
		},
		[
			results,
			settingsQuery.data,
			settingMutation.isPending,
			optimisticValues,
			updateSetting,
		],
	);

	const selectResult = useCallback(
		(index: number, direction: -1 | 1 = 1) => {
			const result = results[index];
			if (!result?.enabled) return;
			switch (result.kind) {
				case "command":
					closeAndRestoreFocus();
					void result.command?.action();
					return;
				case "note":
				case "content":
					if (!result.target) return;
					closeAndRestoreFocus();
					onSelectSearchResult(result.target);
					return;
				case "open-tab":
					if (!result.target) return;
					closeAndRestoreFocus();
					onActivateTab(result.target);
					return;
				case "folder":
					if (!result.target) return;
					closeAndRestoreFocus();
					onRevealFolder(result.target);
					return;
				case "tag":
					setQuery(
						buildSearchQuery({
							tags: [result.target ?? result.label],
							people: [],
							title_only: false,
							tag_only: false,
						}),
					);
					setSelectedId(null);
					return;
				case "person":
					setQuery(
						buildSearchQuery({
							tags: [],
							people: [result.target ?? result.label],
							title_only: false,
							tag_only: false,
						}),
					);
					setSelectedId(null);
					return;
				case "database":
					if (!result.target) return;
					closeAndRestoreFocus();
					onOpenDatabase(result.target);
					return;
				case "template":
					setActiveTemplatePath(result.target ?? null);
					return;
				case "setting": {
					if (adjustSetting(index, direction)) return;
					const definition = result.settingId
						? PALETTE_SETTING_BY_ID.get(result.settingId)
						: undefined;
					const snapshot = settingsQuery.data;
					if (!definition || !snapshot) return;
					setMutationError(null);
					setActiveSettingId(definition.id);
				}
			}
		},
		[
			results,
			closeAndRestoreFocus,
			onSelectSearchResult,
			onActivateTab,
			onRevealFolder,
			onOpenDatabase,
			adjustSetting,
			settingsQuery.data,
		],
	);

	const handleRootKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLElement>) => {
			if (
				event.nativeEvent.isComposing ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey
			) {
				return;
			}
			if (event.key === "ArrowDown" || event.key === "ArrowUp") {
				event.preventDefault();
				if (!results.length) return;
				const nextId = movePaletteSelection(
					results,
					results[resolvedSelectedIndex]?.id ?? null,
					event.key === "ArrowDown" ? 1 : -1,
				);
				setSelectedId(nextId);
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				selectResult(resolvedSelectedIndex);
				return;
			}
			if (
				event.key === " " &&
				!query &&
				typeof results[resolvedSelectedIndex]?.checked === "boolean"
			) {
				event.preventDefault();
				selectResult(resolvedSelectedIndex);
				return;
			}
			if (event.key === "ArrowRight") {
				if (results[resolvedSelectedIndex]?.settingControl !== "choice") return;
				event.preventDefault();
				selectResult(resolvedSelectedIndex, 1);
				return;
			}
			if (event.key === "ArrowLeft") {
				if (results[resolvedSelectedIndex]?.settingControl !== "choice") return;
				event.preventDefault();
				selectResult(resolvedSelectedIndex, -1);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				if (query) {
					setQuery("");
					setSelectedId(null);
				} else {
					closeAndRestoreFocus();
				}
			}
		},
		[results, resolvedSelectedIndex, selectResult, query, closeAndRestoreFocus],
	);

	const activeSetting = activeSettingId
		? PALETTE_SETTING_BY_ID.get(activeSettingId)
		: undefined;
	const activeSettingEntry = activeSetting
		? localizeSettingsSearchEntry(
				{
					id: activeSetting.id,
					tab: activeSetting.tab,
				},
				i18n.language,
			)
		: null;
	const activeSettingValue =
		activeSetting && settingsQuery.data
			? hasOwnValue(optimisticValues, activeSetting.id)
				? (optimisticValues[activeSetting.id] ?? null)
				: activeSetting.read(settingsQuery.data)
			: null;
	const activeTemplate = templatesQuery.data?.find(
		(template) => template.relPath === activeTemplatePath,
	);
	useEffect(() => {
		if (open && !activeSettingId && !activeTemplatePath) {
			inputRef.current?.focus();
		}
	}, [activeSettingId, activeTemplatePath, open]);
	const normalizedQuery = query.trim();
	const isCurrentSearchSaved = databaseSummaries.data?.some(
		(collection) =>
			collection.source.kind === "search" &&
			collection.source.value === normalizedQuery,
	);

	return (
		<Dialog
			open={open}
			onOpenChange={(isOpen) => !isOpen && closeAndRestoreFocus()}
		>
			<DialogContent
				className={cn(
					"commandPalette top-[46%] gap-0 border-none bg-transparent p-0 shadow-none",
					selectedPreviewPath ? "sm:max-w-[840px]" : "sm:max-w-[560px]",
				)}
				data-with-preview={selectedPreviewPath ? "true" : "false"}
				onKeyDownCapture={
					activeSetting || activeTemplate ? undefined : handleRootKeyDown
				}
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">
					{t("commandPalette.title")}
				</DialogTitle>

				{activeSetting && activeSettingEntry ? (
					<PaletteSettingEditor
						key={activeSetting.id}
						entry={activeSettingEntry}
						definition={activeSetting}
						value={activeSettingValue}
						folders={folders}
						pending={settingMutation.isPending}
						error={mutationError}
						onBack={() => {
							setActiveSettingId(null);
							setMutationError(null);
							window.requestAnimationFrame(() => inputRef.current?.focus());
						}}
						onChange={(value) => updateSetting(activeSetting, value)}
					/>
				) : activeTemplate ? (
					<div
						className="commandPaletteSettingEditor"
						onKeyDown={(event) => {
							if (event.key !== "Escape" && event.key !== "ArrowLeft") return;
							event.preventDefault();
							event.stopPropagation();
							setActiveTemplatePath(null);
						}}
					>
						<button
							type="button"
							className="commandPaletteBreadcrumb"
							onClick={() => setActiveTemplatePath(null)}
						>
							<span className="commandPaletteBackIcon" aria-hidden="true">
								←
							</span>
							<span>{t("commandPalette.templateBreadcrumb")}</span>
						</button>
						<div className="commandPaletteTemplateAction">
							<strong>{activeTemplate.name.replace(/\.md$/i, "")}</strong>
							<span>{activeTemplate.relPath}</span>
							<button
								type="button"
								className="commandPaletteSettingSave"
								onClick={() => {
									closeAndRestoreFocus();
									onCreateFromTemplate({
										relPath: activeTemplate.relPath,
										label: activeTemplate.name,
									});
								}}
							>
								{t("commandPalette.createFromTemplate")}
							</button>
						</div>
					</div>
				) : (
					<>
						<div className="commandPaletteHeader">
							<div className="commandPaletteInputWrapper">
								<input
									ref={inputRef}
									className="commandPaletteInput"
									role="combobox"
									aria-controls="command-palette-results"
									aria-expanded="true"
									aria-activedescendant={selectedResult?.id}
									placeholder={t("commandPalette.searchEverything")}
									value={query}
									onChange={(event) => {
										setQuery(event.target.value);
										setSelectedId(null);
									}}
									autoCorrect="off"
									autoCapitalize="off"
									spellCheck={false}
								/>
							</div>
							{normalizedQuery ? (
								<div className="commandSearchActions">
									<button
										type="button"
										className="commandSearchSaveButton"
										data-saved={isCurrentSearchSaved ? "true" : "false"}
										disabled={
											!databaseSummaries.data ||
											saveSearch.isPending ||
											isCurrentSearchSaved
										}
										onClick={() => saveSearch.mutate(query)}
										title={t(
											isCurrentSearchSaved
												? "commandPalette.searchSaved"
												: "commandPalette.saveSearch",
										)}
										aria-label={t(
											isCurrentSearchSaved
												? "commandPalette.searchSaved"
												: "commandPalette.saveSearch",
										)}
									>
										<HugeiconsIcon
											icon={StarIcon}
											size="var(--icon-md)"
											strokeWidth={0.9}
										/>
									</button>
								</div>
							) : null}
						</div>
						<div
							className="commandPaletteBody"
							data-with-preview={selectedPreviewPath ? "true" : "false"}
						>
							<div
								id="command-palette-results"
								className="commandPaletteList"
								data-with-preview={selectedPreviewPath ? "true" : "false"}
								ref={listRef}
							>
								{query.trim() ? (
									<output className="sr-only" aria-live="polite">
										{isSearching
											? t("commandPalette.searching")
											: t("commandPalette.results", {
													count: results.length,
												})}
									</output>
								) : null}
								{settingAnnouncement ? (
									<output className="sr-only" aria-live="polite">
										{settingAnnouncement}
									</output>
								) : null}
								<CommandList
									results={results}
									selectedIndex={resolvedSelectedIndex}
									onSetSelectedIndex={(index) =>
										setSelectedId(results[index]?.id ?? null)
									}
									onSelectResult={selectResult}
								/>
							</div>
							{selectedPreviewPath ? (
								<aside
									className="commandPalettePreview"
									aria-label={t("commandPalette.notePreview")}
								>
									<div className="linkedNotePreviewBody">
										{notePreview ? (
											<NotePreviewContent {...notePreview} />
										) : null}
									</div>
								</aside>
							) : null}
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
