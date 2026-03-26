import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "../Icons";
import { directionVariants } from "../ui/animations";
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
	const [state, setState] = useState<{
		activeTab: Tab;
		query: string;
		selectedIndex: number;
		selectedId: string | null;
	}>({
		activeTab: "commands",
		query: "",
		selectedIndex: 0,
		selectedId: null,
	});
	const [transitionDirection, setTransitionDirection] = useState<
		"left" | "right"
	>("left");
	const { activeTab, query, selectedIndex } = state;
	const canSearch = spacePath !== null;
	const inputRef = useRef<HTMLInputElement | null>(null);
	const previousFocusRef = useRef<Element | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);

	const { recentFiles, isSearching, titleMatches, contentMatches, reset } =
		useCommandSearch(open, activeTab, query, spacePath);

	const filtered = useMemo(() => {
		if (activeTab !== "commands") return [];
		const q = query.trim().toLowerCase();
		const matches = q
			? commands.filter((cmd) => {
					const category = cmd.category?.toLowerCase() ?? "";
					return (
						cmd.label.toLowerCase().includes(q) ||
						category.includes(q) ||
						cmd.id.toLowerCase().includes(q)
					);
				})
			: commands;
		return matches.filter((cmd) => cmd.enabled !== false);
	}, [commands, query, activeTab]);

	const itemCount =
		activeTab === "commands"
			? filtered.length
			: query.trim()
				? titleMatches.length + contentMatches.length
				: recentFiles.length;
	const parsedSearch = useMemo(() => parseSearchQuery(query), [query]);
	const searchEntries = useMemo(
		() =>
			query.trim()
				? [...titleMatches, ...contentMatches].map((result) => ({
						id: result.id,
						title: result.title,
					}))
				: recentFiles.map((file) => ({
						id: file.path,
						title: null,
					})),
		[contentMatches, query, recentFiles, titleMatches],
	);

	useEffect(() => {
		if (!open) return;
		const nextTab =
			initialTab === "search" && !canSearch ? "commands" : initialTab;
		previousFocusRef.current = document.activeElement;
		setState({
			activeTab: nextTab,
			query: nextTab === "search" ? initialQuery : "",
			selectedIndex: 0,
			selectedId: null,
		});
		reset();
		window.requestAnimationFrame(() => inputRef.current?.focus());
		return () => {
			const prev = previousFocusRef.current;
			if (prev instanceof HTMLElement) prev.focus();
		};
	}, [open, initialQuery, initialTab, reset, canSearch]);

	const switchTab = useCallback(
		(tab: Tab) => {
			if (tab === "search" && !canSearch) return;
			setTransitionDirection(tab === "search" ? "right" : "left");
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

	useEffect(() => {
		setState((curr) => {
			if (activeTab !== "search") {
				const nextIndex = Math.min(
					curr.selectedIndex,
					Math.max(itemCount - 1, 0),
				);
				if (nextIndex === curr.selectedIndex && curr.selectedId === null) {
					return curr;
				}
				return { ...curr, selectedIndex: nextIndex, selectedId: null };
			}
			if (searchEntries.length === 0) {
				if (curr.selectedIndex === 0 && curr.selectedId === null) return curr;
				return { ...curr, selectedIndex: 0, selectedId: null };
			}
			const preservedIndex =
				curr.selectedId === null
					? -1
					: searchEntries.findIndex((entry) => entry.id === curr.selectedId);
			const nextIndex =
				preservedIndex >= 0
					? preservedIndex
					: Math.min(curr.selectedIndex, Math.max(searchEntries.length - 1, 0));
			const nextId = searchEntries[nextIndex]?.id ?? null;
			return nextIndex === curr.selectedIndex && nextId === curr.selectedId
				? curr
				: { ...curr, selectedIndex: nextIndex, selectedId: nextId };
		});
	}, [activeTab, itemCount, searchEntries]);

	useEffect(() => {
		if (!listRef.current) return;
		const selected =
			listRef.current.querySelector<HTMLElement>(
				`[data-command-index="${selectedIndex}"], [data-search-index="${selectedIndex}"]`,
			) ?? listRef.current.querySelector<HTMLElement>('[data-selected="true"]');
		selected?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

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
			const resultId = query.trim()
				? [...titleMatches, ...contentMatches][index]?.id
				: recentFiles[index]?.path;
			if (!resultId) return;
			onClose();
			onSelectSearchResult(resultId);
		},
		[
			titleMatches,
			contentMatches,
			recentFiles,
			query,
			onClose,
			onSelectSearchResult,
		],
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
				setState((curr) => ({
					...curr,
					selectedIndex: itemCount
						? Math.min(curr.selectedIndex + 1, itemCount - 1)
						: 0,
					selectedId:
						activeTab === "search"
							? (searchEntries[
									itemCount
										? Math.min(curr.selectedIndex + 1, itemCount - 1)
										: 0
								]?.id ?? null)
							: null,
				}));
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setState((curr) => ({
					...curr,
					selectedIndex: curr.selectedIndex > 0 ? curr.selectedIndex - 1 : 0,
					selectedId:
						activeTab === "search"
							? (searchEntries[
									curr.selectedIndex > 0 ? curr.selectedIndex - 1 : 0
								]?.id ?? null)
							: null,
				}));
				return;
			}
			if (e.key === "Enter") {
				e.preventDefault();
				handleSelect(selectedIndex);
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
			selectedIndex,
			handleSelect,
			activeTab,
			switchTab,
			canSearch,
			searchEntries,
		],
	);

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent
				className={[
					"commandPalette top-[46%] gap-0 border-none bg-transparent p-0 shadow-none",
					"sm:max-w-[560px]",
				].join(" ")}
				showCloseButton={false}
			>
				<DialogTitle className="sr-only">Command Palette</DialogTitle>

				<div className="commandPaletteHeader">
					<div className="commandPaletteInputWrapper">
						<AnimatePresence mode="wait">
							{activeTab === "search" && (
								<m.span
									key="search-icon"
									className="commandPaletteSearchIcon"
									initial={{ opacity: 0, scale: 0.8 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.8 }}
									transition={{ duration: 0.12 }}
								>
									<Search size={15} />
								</m.span>
							)}
						</AnimatePresence>
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

				<AnimatePresence mode="wait">
					<m.div
						key={activeTab}
						className="commandPaletteBody commandPaletteScene"
						initial={{
							...directionVariants[transitionDirection].initial,
							opacity: 0,
						}}
						animate={{
							...directionVariants[transitionDirection].animate,
							opacity: 1,
						}}
						exit={{
							...directionVariants[transitionDirection].exit,
							opacity: 0,
						}}
						transition={{ duration: 0.2 }}
					>
						<div className="commandPaletteList" ref={listRef}>
							{activeTab === "commands" ? (
								<CommandList
									filtered={filtered}
									selectedIndex={selectedIndex}
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
												: `${(titleMatches.length + contentMatches.length).toLocaleString()} results`}
										</div>
									) : null}
									<SearchResultsList
										query={query}
										isSearching={isSearching}
										titleMatches={titleMatches}
										contentMatches={contentMatches}
										recentFiles={recentFiles}
										selectedIndex={selectedIndex}
										onSetSelectedIndex={(index) =>
											setState((curr) => ({
												...curr,
												selectedIndex: index,
												selectedId: searchEntries[index]?.id ?? null,
											}))
										}
										onSelectResult={selectSearchResult}
									/>
								</>
							)}
						</div>
					</m.div>
				</AnimatePresence>
				<CommandPaletteFooter activeTab={activeTab} canSearch={canSearch} />
			</DialogContent>
		</Dialog>
	);
}
