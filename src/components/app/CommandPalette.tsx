import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { cn } from "@/lib/utils";
import { Bookmark01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
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
import { displayNameFromPath } from "../../utils/path";
import { SecretPaletteReveal } from "../easter-eggs/secret-palette/SecretPaletteReveal";
import { NotePreviewContent } from "../preview/NotePreviewContent";
import { NOTE_PREVIEW_OPEN_DELAY_MS } from "../preview/notePreviewShared";
import { useNotePreview } from "../preview/useNotePreview";
import { localizeSettingsSearchEntry } from "../settings/settingsSearch";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";
import { CommandList, paletteOptionId } from "./CommandList";
import { CommandPaletteEditorFooter, CommandPaletteFooter } from "./CommandPaletteFooter";
import { PaletteCommandDetails } from "./PaletteCommandDetails";
import { PaletteSettingEditor } from "./PaletteSettingEditor";
import { PaletteTemplateAction } from "./PaletteTemplateAction";
import {
	type Command,
	type PaletteLaunchMode,
	buildSearchQuery,
	movePaletteSelection,
	type PaletteQueryScope,
	parsePaletteQuery,
	splitScopePrefix,
	stepPaletteOption,
} from "./commandPaletteHelpers";
import { buildMoveResults, moveFoldersFromEntries } from "./movePickerResults";
import { noResultActions } from "./paletteResultGroups";
import { buildPaletteResults } from "./paletteResults";
import { PALETTE_SETTING_BY_ID, paletteSettingOptions } from "./settingsPaletteRegistry";
import { useCommandSearch } from "./useCommandSearch";
import { usePaletteSettings } from "./usePaletteSettings";
import type { WorkspaceTab } from "./useTabManager";

export type { Command } from "./commandPaletteHelpers";

const RESULTS_ID = "command-palette-results";

/** The group whose label names each scope's token. */
const SCOPE_GROUP: Record<Exclude<PaletteQueryScope, "all">, string> = {
	commands: "command",
	settings: "setting",
	folders: "folder",
	tags: "tag",
	people: "person",
	templates: "template",
};

interface CommandPaletteProps {
	open: boolean;
	initialMode?: PaletteLaunchMode;
	initialQuery?: string;
	commands: Command[];
	onClose: () => void;
	spacePath: string | null;
	tabs: WorkspaceTab[];
	onActivateTab: (id: string) => void;
	onSelectSearchResult: (id: string, options?: { query?: string; matchIndex?: number }) => void;
	onRevealFolder: (path: string) => void;
	onOpenDatabase: (id: string) => void;
	templateFolder: string | null;
	onCreateFromTemplate: (template: { relPath: string; label: string }) => void;
	onCreateNote: (title: string) => void;
	onEditShortcuts: () => void;
	/** The note the "move" mode relocates. */
	moveSourcePath: string | null;
	onMove: (sourcePath: string, directory: string) => void;
	onMoveToNewFolder: (sourcePath: string) => void;
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
	onCreateNote,
	onEditShortcuts,
	moveSourcePath,
	onMove,
	onMoveToNewFolder,
}: CommandPaletteProps) {
	const { t, i18n } = useTranslation("shell");
	const { rootEntries, childrenByDir, tags, people, ensureTagsFresh, activeFilePath } =
		useFileTreeContext();
	const [query, setQuery] = useState(initialQuery);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [activeSettingId, setActiveSettingId] = useState<string | null>(null);
	const [activeTemplatePath, setActiveTemplatePath] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const restoreFocusRef = useRef<HTMLElement | null>(null);
	const parsedQuery = useMemo(() => parsePaletteQuery(query), [query]);
	// Moving a note filters folders by plain text, so no prefix opens a scope there.
	const moveSource = initialMode === "move" ? moveSourcePath : null;
	const scopeInput = moveSource ? { prefix: "", rest: query } : splitScopePrefix(query);
	const scope = moveSource || parsedQuery.scope === "all" ? null : parsedQuery.scope;
	const normalizedQuery = query.trim();
	const normalizedSecretQuery = normalizedQuery.toLowerCase();
	const isSecretPalettePhrase = normalizedSecretQuery === "glyphglyph";
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
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		void ensureTagsFresh();
	}, [ensureTagsFresh, open]);

	const closeAndRestoreFocus = useCallback(() => {
		onClose();
		window.requestAnimationFrame(() => restoreFocusRef.current?.focus());
	}, [onClose]);

	// A bare "#" or "@" has nothing to search for yet; the tag and people lists cover it.
	const searchEnabled =
		!isSecretPalettePhrase &&
		!moveSource &&
		(parsedQuery.scope === "all" ||
			((parsedQuery.scope === "tags" || parsedQuery.scope === "people") &&
				Boolean(parsedQuery.text)));
	const searchQuery =
		parsedQuery.scope === "tags" || parsedQuery.scope === "people"
			? parsedQuery.raw
			: parsedQuery.text;
	const { recentFiles, isSearching, searchError, titleMatches, contentMatches } = useCommandSearch(
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
			const baseName = trimmed.length > 56 ? `${trimmed.slice(0, 53)}…` : trimmed;
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
	const matchedResults = buildPaletteResults({
		query,
		mode: initialMode,
		spacePath,
		templateFolder,
		activePath: activeFilePath,
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

	// Once the search settles empty, offer the next step instead of a dead end.
	const moveFolders = useQuery({
		queryKey: ["command-palette-move-folders", spacePath],
		queryFn: async () =>
			moveFoldersFromEntries(await invoke("space_list_dir", { recursive: true, limit: 50_000 })),
		enabled: open && Boolean(moveSource && spacePath),
	});
	const results = moveSource
		? buildMoveResults({
				query,
				sourcePath: moveSource,
				folders: moveFolders.data ?? [],
				spacePath,
				t,
			})
		: matchedResults.length || isSearching
			? matchedResults
			: noResultActions(parsedQuery, spacePath, t);

	const resolvedSelectedIndex = useMemo(() => {
		if (!results.length) return 0;
		const preservedIndex = selectedId
			? results.findIndex((result) => result.id === selectedId)
			: -1;
		if (preservedIndex >= 0 && results[preservedIndex]?.enabled !== false) {
			return preservedIndex;
		}
		const firstEnabledId = movePaletteSelection(results, null, 1);
		const firstEnabledIndex = results.findIndex((result) => result.id === firstEnabledId);
		return Math.max(firstEnabledIndex, 0);
	}, [results, selectedId]);
	const selectedResult = results[resolvedSelectedIndex];
	const selectedPreviewPath =
		!isSecretPalettePhrase && initialMode === "search"
			? (selectedResult?.previewPath ?? null)
			: null;
	// Commands describe themselves in the side pane, so ">" keeps the sheet at full width.
	const showCommandDetails =
		!isSecretPalettePhrase &&
		initialMode === "search" &&
		!selectedPreviewPath &&
		(selectedResult?.kind === "command" || parsedQuery.scope === "commands");
	const withSidePane = Boolean(selectedPreviewPath) || showCommandDetails;
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
				return definition.control === "toggle" || definition.control === "choice";
			}
			const current = settingValue(definition);
			if (definition.control === "toggle" && typeof current === "boolean") {
				updateSetting({ definition, value: !current });
				return true;
			}
			if (definition.control === "choice") {
				const nextValue = stepPaletteOption(
					paletteSettingOptions(definition, settings),
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
		(index: number, direction?: -1 | 1) => {
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
					// A title match has no position to jump to, so an open note just regains its tab.
					if (result.kind === "note" && result.openTabId) {
						onActivateTab(result.openTabId);
						return;
					}
					onSelectSearchResult(result.target, {
						query: result.searchQuery,
						matchIndex: result.matchIndex,
					});
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
				case "destination":
					if (!moveSource) return;
					closeAndRestoreFocus();
					if (result.actionId === "create-folder") onMoveToNewFolder(moveSource);
					else if (result.target !== undefined) onMove(moveSource, result.target);
					return;
				case "action":
					if (!result.target) return;
					if (result.actionId === "create-note") {
						closeAndRestoreFocus();
						onCreateNote(result.target);
						return;
					}
					setQuery(result.target);
					setSelectedId(null);
					return;
				case "setting": {
					// Enter and click toggle switches in place; choices open their option list,
					// while the arrow keys still step through them.
					const stepsInPlace = result.settingControl !== "choice" || direction !== undefined;
					if (stepsInPlace && adjustSetting(index, direction ?? 1)) return;
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
			onCreateNote,
			moveSource,
			onMove,
			onMoveToNewFolder,
			adjustSetting,
			settings,
		],
	);

	const handleRootKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLElement>) => {
			if (event.target !== inputRef.current) return;
			if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) {
				return;
			}
			if (isSecretPalettePhrase && event.key !== "Escape") return;
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
			// ⌫ at the start of the input removes the scope token, keeping what was typed after it.
			if (
				event.key === "Backspace" &&
				scopeInput.prefix &&
				inputRef.current?.selectionStart === 0 &&
				inputRef.current.selectionEnd === 0
			) {
				event.preventDefault();
				setQuery(scopeInput.rest);
				setSelectedId(null);
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
		[
			results,
			resolvedSelectedIndex,
			selectResult,
			query,
			scopeInput.prefix,
			scopeInput.rest,
			closeAndRestoreFocus,
			isSecretPalettePhrase,
		],
	);

	const activeSetting = activeSettingId ? PALETTE_SETTING_BY_ID.get(activeSettingId) : undefined;
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
	const canSaveSearch =
		!isSecretPalettePhrase &&
		!moveSource &&
		(parsedQuery.scope === "all" || parsedQuery.scope === "tags" || parsedQuery.scope === "people");
	const isCurrentSearchSaved = databaseSummaries.data?.some(
		(collection) =>
			collection.source.kind === "search" && collection.source.value === normalizedQuery,
	);

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && closeAndRestoreFocus()}>
			<DialogContent
				className={cn(
					"commandPalette top-[round(15vh,1px)] translate-y-0 gap-0 border-none bg-transparent p-0 shadow-none",
					withSidePane ? "sm:max-w-[840px]" : "sm:max-w-[560px]",
				)}
				data-with-preview={withSidePane ? "true" : "false"}
				onKeyDownCapture={activeSetting || activeTemplate ? undefined : handleRootKeyDown}
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">{t("commandPalette.title")}</DialogTitle>

				{activeSetting && activeSettingEntry ? (
					<>
						<PaletteSettingEditor
							key={activeSetting.id}
							entry={activeSettingEntry}
							definition={activeSetting}
							settings={settings}
							value={activeSettingValue}
							folders={folders}
							pending={settingPending}
							error={settingError}
							onBack={() => {
								setActiveSettingId(null);
								window.requestAnimationFrame(() => inputRef.current?.focus());
							}}
							onChange={(value) => updateSetting({ definition: activeSetting, value })}
						/>
						<CommandPaletteEditorFooter control={activeSetting.control} />
					</>
				) : activeTemplate ? (
					<PaletteTemplateAction
						template={activeTemplate}
						onBack={() => setActiveTemplatePath(null)}
						onCreate={() => {
							closeAndRestoreFocus();
							onCreateFromTemplate({
								relPath: activeTemplate.relPath,
								label: activeTemplate.name,
							});
						}}
					/>
				) : (
					<>
						<div className="commandPaletteHeader">
							<div className="commandPaletteInputWrapper">
								{moveSource ? (
									<span className="commandPaletteScopeToken">
										{t("commandPalette.moveToken", { title: displayNameFromPath(moveSource) })}
									</span>
								) : null}
								{scope ? (
									<span className="commandPaletteScopeToken">
										{t(`commandPalette.groups.${SCOPE_GROUP[scope]}`)}
										<button
											type="button"
											className="commandPaletteScopeTokenRemove"
											aria-label={t("commandPalette.removeScope")}
											onMouseDown={(event) => event.preventDefault()}
											onClick={() => {
												setQuery(scopeInput.rest);
												setSelectedId(null);
											}}
										>
											<HugeiconsIcon icon={Cancel01Icon} size="var(--icon-xs)" />
										</button>
									</span>
								) : null}
								<input
									ref={inputRef}
									className="commandPaletteInput"
									role="combobox"
									aria-controls={RESULTS_ID}
									aria-expanded="true"
									aria-activedescendant={
										selectedResult ? paletteOptionId(RESULTS_ID, resolvedSelectedIndex) : undefined
									}
									placeholder={
										moveSource
											? t("commandPalette.scopePlaceholder.folders")
											: scope
												? t(`commandPalette.scopePlaceholder.${scope}`)
												: t("commandPalette.searchEverything")
									}
									value={scope ? scopeInput.rest : query}
									onChange={(event) => {
										setQuery(scopeInput.prefix + event.target.value);
										setSelectedId(null);
										// A new query selects its first result, which must be in view.
										listRef.current?.scrollTo({ top: 0 });
									}}
									autoCorrect="off"
									autoCapitalize="off"
									spellCheck={false}
								/>
							</div>
							{moveFolders.error ? (
								<p role="alert" className="commandPaletteSearchError">
									{t("commandPalette.moveFoldersFailed")}
								</p>
							) : null}
							{searchError ? (
								<p role="alert" className="commandPaletteSearchError">
									{t("commandPalette.searchFailed")}
								</p>
							) : null}
							{normalizedQuery && canSaveSearch ? (
								<div className="commandSearchActions">
									<button
										type="button"
										className="commandSearchSaveButton"
										data-saved={isCurrentSearchSaved ? "true" : "false"}
										disabled={
											!databaseSummaries.data || saveSearch.isPending || isCurrentSearchSaved
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
										<HugeiconsIcon icon={Bookmark01Icon} size="var(--icon-md)" />
									</button>
								</div>
							) : null}
						</div>
						<div className="commandPaletteBody" data-with-preview={withSidePane ? "true" : "false"}>
							<div
								ref={listRef}
								className="commandPaletteList"
								data-with-preview={withSidePane ? "true" : "false"}
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
								{isSecretPalettePhrase ? (
									<SecretPaletteReveal />
								) : (
									<CommandList
										id={RESULTS_ID}
										results={results}
										selectedIndex={resolvedSelectedIndex}
										onSetSelectedIndex={(index) => setSelectedId(results[index]?.id ?? null)}
										onSelectResult={selectResult}
										emptyHint={
											scope
												? t("commandPalette.noScopedResults", {
														scope: t(`commandPalette.groups.${SCOPE_GROUP[scope]}`),
													})
												: t("commandPalette.noResultsHint")
										}
									/>
								)}
							</div>
							{selectedPreviewPath ? (
								<aside
									className="commandPalettePreview"
									aria-label={t("commandPalette.notePreview")}
								>
									<div className="linkedNotePreviewBody">
										{notePreview ? (
											<NotePreviewContent
												{...notePreview}
												highlightQuery={selectedResult?.searchQuery ?? parsedQuery.text}
												matchCount={selectedResult?.matchCount}
												showMeta
											/>
										) : null}
									</div>
								</aside>
							) : null}
							{showCommandDetails ? (
								<aside
									className="commandPalettePreview"
									aria-label={t("commandPalette.commandKind")}
								>
									<PaletteCommandDetails
										command={selectedResult?.command}
										onEditShortcut={() => {
											onClose();
											onEditShortcuts();
										}}
									/>
								</aside>
							) : null}
						</div>
						<CommandPaletteFooter
							selectedResult={isSecretPalettePhrase ? undefined : selectedResult}
							escapeLabel={query ? "clear" : moveSource ? "cancel" : "close"}
							showScopes={!scope && !moveSource}
							canRemoveScope={Boolean(scope) && !scopeInput.rest}
						/>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
