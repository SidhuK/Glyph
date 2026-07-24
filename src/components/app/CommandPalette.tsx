import { cn } from "@/lib/utils";
import { StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext } from "../../contexts";
import { nextCollectionName } from "../../lib/database/collection";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	invalidateDatabaseSummariesPrefetch,
	navigationQueryKeys,
} from "../../lib/navigationPrefetch";
import { invoke } from "../../lib/tauri";
import { listTemplates } from "../../lib/templates";
import { toast } from "../../lib/toast";
import { NotePreviewContent } from "../preview/NotePreviewContent";
import { NOTE_PREVIEW_OPEN_DELAY_MS } from "../preview/notePreviewShared";
import { useNotePreview } from "../preview/useNotePreview";
import { localizeSettingsSearchEntry } from "../settings/settingsSearch";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";
import { CommandList } from "./CommandList";
import { PaletteSettingEditor } from "./PaletteSettingEditor";
import {
	type Command,
	type PaletteLaunchMode,
	buildSearchQuery,
	movePaletteSelection,
	parsePaletteQuery,
	stepPaletteOption,
} from "./commandPaletteHelpers";
import { buildPaletteResults } from "./paletteResults";
import { PALETTE_SETTING_BY_ID } from "./settingsPaletteRegistry";
import { useCommandSearch } from "./useCommandSearch";
import { usePaletteSettings } from "./usePaletteSettings";
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
	const { rootEntries, childrenByDir, tags, people, ensureTagsFresh } =
		useFileTreeContext();
	const [query, setQuery] = useState(initialQuery);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [activeSettingId, setActiveSettingId] = useState<string | null>(null);
	const [activeTemplatePath, setActiveTemplatePath] = useState<string | null>(
		null,
	);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const parsedQuery = useMemo(() => parsePaletteQuery(query), [query]);
	const {
		settings,
		valueFor: settingValue,
		update: updateSetting,
		pending: settingPending,
		error: settingError,
		announcement: settingAnnouncement,
	} = usePaletteSettings(open, spacePath);
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
			open && searchEnabled,
			settings?.editor.enablePeopleMentionsAsTags ?? false,
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

	const folders = useMemo(
		() => flattenFolders(rootEntries, childrenByDir),
		[rootEntries, childrenByDir],
	);
	const results = buildPaletteResults({
		query,
		mode: initialMode,
		spacePath,
		templateFolder,
		language: i18n.language,
		t,
		sources: {
			commands,
			settings,
			settingValue,
			tabs,
			titleMatches,
			contentMatches,
			recentFiles,
			folders,
			tags,
			people,
			databases: databaseSummaries.data ?? [],
			templates: templatesQuery.data ?? [],
		},
	});

	const resolvedSelectedIndex = useMemo(() => {
		if (!results.length) return 0;
		const preservedIndex = selectedId
			? results.findIndex((result) => result.id === selectedId)
			: -1;
		if (preservedIndex >= 0 && results[preservedIndex]?.enabled !== false) {
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

	const adjustSetting = useCallback(
		(index: number, direction: -1 | 1) => {
			const result = results[index];
			const definition = result?.settingId
				? PALETTE_SETTING_BY_ID.get(result.settingId)
				: undefined;
			if (!result || result.enabled === false || !definition || !settings) {
				return false;
			}
			if (settingPending) {
				return (
					definition.control === "toggle" || definition.control === "choice"
				);
			}
			const current = settingValue(definition);
			if (definition.control === "toggle" && typeof current === "boolean") {
				updateSetting({ definition, value: !current });
				return true;
			}
			if (definition.control === "choice") {
				const nextValue = stepPaletteOption(
					definition.options ?? [],
					current ?? null,
					direction,
				);
				if (nextValue !== null) {
					updateSetting({ definition, value: nextValue });
					return true;
				}
			}
			return false;
		},
		[results, settings, settingPending, settingValue, updateSetting],
	);

	const selectResult = useCallback(
		(index: number, direction: -1 | 1 = 1) => {
			const result = results[index];
			if (!result || result.enabled === false) return;
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
					if (!definition || !settings) return;
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
			settings,
		],
	);

	const handleRootKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLElement>) => {
			if (event.target !== inputRef.current) return;
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
	const activeSettingValue = activeSetting ? settingValue(activeSetting) : null;
	const activeTemplate = templatesQuery.data?.find(
		(template) => template.relPath === activeTemplatePath,
	);
	useEffect(() => {
		if (open && !activeSettingId && !activeTemplatePath) {
			inputRef.current?.focus();
		}
	}, [activeSettingId, activeTemplatePath, open]);
	const normalizedQuery = query.trim();
	const canSaveSearch =
		parsedQuery.scope === "all" ||
		parsedQuery.scope === "tags" ||
		parsedQuery.scope === "people";
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
						pending={settingPending}
						error={settingError}
						onBack={() => {
							setActiveSettingId(null);
							window.requestAnimationFrame(() => inputRef.current?.focus());
						}}
						onChange={(value) =>
							updateSetting({ definition: activeSetting, value })
						}
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
							{normalizedQuery && canSaveSearch ? (
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
											className="size-[var(--icon-md)]"
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
