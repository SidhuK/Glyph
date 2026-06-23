import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "../Icons";
import { NotePreviewContent } from "../preview/NotePreviewContent";
import { NOTE_PREVIEW_OPEN_DELAY_MS } from "../preview/notePreviewShared";
import { useNotePreview } from "../preview/useNotePreview";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";
import { CommandList } from "./CommandList";
import { CommandPaletteFooter } from "./CommandPaletteFooter";
import { CommandSearchFilters } from "./CommandSearchFilters";
import { SearchResultsList } from "./CommandSearchResults";
import {
	type Command,
	type Tab,
	parseSearchQuery,
} from "./commandPaletteHelpers";
import { useCommandSearch } from "./useCommandSearch";

export type { Command } from "./commandPaletteHelpers";

function commandMatchesQuery(command: Command, normalizedQuery: string) {
	if (!normalizedQuery) return !command.hideWhenQueryEmpty;
	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	const queryTokens = command.hideWhenQueryEmpty
		? tokens.filter((token) => token !== "setting" && token !== "settings")
		: tokens;
	if (command.hideWhenQueryEmpty && queryTokens.length === 0) return true;
	const haystack = [
		command.label,
		command.category ?? "",
		command.id,
		...(command.searchTerms ?? []),
	]
		.join(" ")
		.toLowerCase();
	return queryTokens.every((token) => haystack.includes(token));
}

interface CommandPaletteProps {
	open: boolean;
	initialTab?: Tab;
	initialQuery?: string;
	commands: Command[];
	onClose: () => void;
	spacePath: string | null;
	onSelectSearchResult: (id: string) => void;
}

export function CommandPalette({
	open,
	initialTab = "commands",
	initialQuery = "",
	commands,
	onClose,
	spacePath,
	onSelectSearchResult,
}: CommandPaletteProps) {
	const canSearch = spacePath !== null;
	const [state, setState] = useState<{
		activeTab: Tab;
		query: string;
		selectedIndex: number;
		selectedId: string | null;
	}>(() => {
		const nextTab =
			initialTab === "search" && !canSearch ? "commands" : initialTab;
		return {
			activeTab: nextTab,
			query: nextTab === "search" ? initialQuery : "",
			selectedIndex: 0,
			selectedId: null,
		};
	});
	const { activeTab, query, selectedIndex } = state;
	const inputRef = useRef<HTMLInputElement | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);

	const {
		recentFiles,
		isSearching,
		titleMatches,
		contentMatches,
		searchItems,
		reset,
	} = useCommandSearch(activeTab, query, spacePath);

	const filtered = useMemo(() => {
		if (activeTab !== "commands") return [];
		const q = query.trim().toLowerCase();
		const matches = commands.filter((cmd) => commandMatchesQuery(cmd, q));
		return matches.filter((cmd) => cmd.enabled !== false);
	}, [commands, query, activeTab]);

	const itemCount =
		activeTab === "commands" ? filtered.length : searchItems.length;
	const parsedSearch = useMemo(() => parseSearchQuery(query), [query]);

	const switchTab = useCallback(
		(tab: Tab) => {
			if (tab === "search" && !canSearch) return;
			setState({
				activeTab: tab,
				query: tab === "search" ? initialQuery : "",
				selectedIndex: 0,
				selectedId: null,
			});
			reset();
			window.requestAnimationFrame(() => inputRef.current?.focus());
		},
		[initialQuery, reset, canSearch],
	);

	const resolvedSelectedIndex = useMemo(() => {
		if (activeTab !== "search") {
			return Math.min(selectedIndex, Math.max(itemCount - 1, 0));
		}
		if (searchItems.length === 0) return 0;
		const preservedIndex =
			state.selectedId === null
				? -1
				: searchItems.findIndex((item) => item.id === state.selectedId);
		return preservedIndex >= 0
			? preservedIndex
			: Math.min(selectedIndex, searchItems.length - 1);
	}, [activeTab, itemCount, searchItems, selectedIndex, state.selectedId]);

	const isSearchTab = activeTab === "search";
	const selectedItem = searchItems[resolvedSelectedIndex];
	const selectedPreviewPath =
		isSearchTab && selectedItem?.previewable ? selectedItem.id : null;
	const showPreviewColumn = selectedPreviewPath !== null;
	const notePreview = useNotePreview(selectedPreviewPath, {
		delayMs: NOTE_PREVIEW_OPEN_DELAY_MS,
	});

	useEffect(() => {
		if (!listRef.current) return;
		const selected =
			listRef.current.querySelector<HTMLElement>(
				`[data-command-index="${resolvedSelectedIndex}"], [data-search-index="${resolvedSelectedIndex}"]`,
			) ?? listRef.current.querySelector<HTMLElement>('[data-selected="true"]');
		selected?.scrollIntoView({ block: "nearest" });
	}, [resolvedSelectedIndex]);

	const runCommand = useCallback(
		(index: number) => {
			const cmd = filtered[index];
			if (!cmd) return;
			onClose();
			void cmd.action();
		},
		[filtered, onClose],
	);

	const selectSearchResult = useCallback(
		(index: number) => {
			const resultId = searchItems[index]?.id;
			if (!resultId) return;
			onClose();
			onSelectSearchResult(resultId);
		},
		[searchItems, onClose, onSelectSearchResult],
	);

	const handleSelect = useCallback(
		(index: number) => {
			if (activeTab === "commands") runCommand(index);
			else selectSearchResult(index);
		},
		[activeTab, runCommand, selectSearchResult],
	);

	const handleInputKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setState((curr) => {
					const nextIndex = itemCount
						? Math.min(curr.selectedIndex + 1, itemCount - 1)
						: 0;
					return {
						...curr,
						selectedIndex: nextIndex,
						selectedId:
							activeTab === "search"
								? (searchItems[nextIndex]?.id ?? null)
								: null,
					};
				});
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setState((curr) => {
					const nextIndex = curr.selectedIndex > 0 ? curr.selectedIndex - 1 : 0;
					return {
						...curr,
						selectedIndex: nextIndex,
						selectedId:
							activeTab === "search"
								? (searchItems[nextIndex]?.id ?? null)
								: null,
					};
				});
				return;
			}
			if (e.key === "Enter") {
				e.preventDefault();
				handleSelect(resolvedSelectedIndex);
				return;
			}
			if (e.key === "Tab") {
				if (activeTab === "commands" && !canSearch) return;
				e.preventDefault();
				switchTab(activeTab === "commands" ? "search" : "commands");
			}
		},
		[
			itemCount,
			resolvedSelectedIndex,
			handleSelect,
			activeTab,
			switchTab,
			canSearch,
			searchItems,
		],
	);

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent
				className={cn(
					"commandPalette top-[46%] gap-0 border-none bg-transparent p-0 shadow-none",
					isSearchTab ? "sm:max-w-[840px]" : "sm:max-w-[560px]",
				)}
				data-search-tab={isSearchTab ? "true" : "false"}
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">Command Palette</DialogTitle>

				<div className="commandPaletteHeader">
					<div className="commandPaletteInputWrapper">
						{activeTab === "search" && (
							<span className="commandPaletteSearchIcon">
								<Search size="var(--icon-lg)" />
							</span>
						)}
						<input
							ref={inputRef}
							className="commandPaletteInput"
							placeholder={
								activeTab === "commands" ? "Search Commands" : "Search notes…"
							}
							value={query}
							onChange={(e) =>
								setState((curr) => ({
									...curr,
									query: e.target.value,
									selectedIndex: 0,
									selectedId: null,
								}))
							}
							autoCorrect="off"
							autoCapitalize="off"
							spellCheck={false}
							onKeyDown={handleInputKeyDown}
						/>
					</div>
					{activeTab === "search" ? (
						<CommandSearchFilters
							request={parsedSearch.request}
							onChangeQuery={(nextQuery) =>
								setState((curr) => ({
									...curr,
									query: nextQuery,
									selectedIndex: 0,
									selectedId: null,
								}))
							}
						/>
					) : null}
				</div>

				<div
					className="commandPaletteBody"
					data-with-preview={showPreviewColumn ? "true" : "false"}
				>
					<div
						className="commandPaletteList"
						data-with-preview={showPreviewColumn ? "true" : "false"}
						ref={listRef}
					>
						{activeTab === "commands" ? (
							<CommandList
								filtered={filtered}
								selectedIndex={resolvedSelectedIndex}
								onSetSelectedIndex={(index) =>
									setState((curr) => ({
										...curr,
										selectedIndex: index,
										selectedId: null,
									}))
								}
								onRunCommand={runCommand}
							/>
						) : (
							<>
								{query.trim() ? (
									<div
										className="commandPaletteResultCountPill"
										aria-live="polite"
									>
										{isSearching
											? "Searching..."
											: `${searchItems.length.toLocaleString()} results`}
									</div>
								) : null}
								<SearchResultsList
									query={query}
									isSearching={isSearching}
									titleMatches={titleMatches}
									contentMatches={contentMatches}
									recentFiles={recentFiles}
									selectedIndex={resolvedSelectedIndex}
									onSetSelectedIndex={(index) =>
										setState((curr) => ({
											...curr,
											selectedIndex: index,
											selectedId: searchItems[index]?.id ?? null,
										}))
									}
									onSelectResult={selectSearchResult}
								/>
							</>
						)}
					</div>
					{showPreviewColumn ? (
						<aside className="commandPalettePreview" aria-label="Note preview">
							<div className="linkedNotePreviewBody">
								{notePreview ? <NotePreviewContent {...notePreview} /> : null}
							</div>
						</aside>
					) : null}
				</div>
				<CommandPaletteFooter activeTab={activeTab} canSearch={canSearch} />
			</DialogContent>
		</Dialog>
	);
}
