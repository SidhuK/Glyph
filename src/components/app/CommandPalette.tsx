import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "../Icons";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";
import { CommandList } from "./CommandList";
import { CommandSearchFilters } from "./CommandSearchFilters";
import { SearchResultsList } from "./CommandSearchResults";
import {
	type Command,
	TABS,
	type Tab,
	parseSearchQuery,
	springTransition,
} from "./commandPaletteHelpers";
import { useCommandSearch } from "./useCommandSearch";

export type { Command } from "./commandPaletteHelpers";

interface CommandPaletteProps {
	open: boolean;
	initialTab?: Tab;
	initialQuery?: string;
	commands: Command[];
	onClose: () => void;
	vaultPath: string | null;
	onSelectSearchNote: (id: string) => void;
}

export function CommandPalette({
	open,
	initialTab = "commands",
	initialQuery = "",
	commands,
	onClose,
	vaultPath,
	onSelectSearchNote,
}: CommandPaletteProps) {
	const [activeTab, setActiveTab] = useState<Tab>(initialTab);
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const previousFocusRef = useRef<Element | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);

	const { recentNotes, isSearching, titleMatches, contentMatches, reset } =
		useCommandSearch(open, activeTab, query, vaultPath);

	const filtered = useMemo(() => {
		if (activeTab !== "commands") return [];
		const q = query.trim().toLowerCase();
		const matches = q
			? commands.filter((cmd) => cmd.label.toLowerCase().includes(q))
			: commands;
		return matches.filter((cmd) => cmd.enabled !== false);
	}, [commands, query, activeTab]);

	const itemCount =
		activeTab === "commands"
			? filtered.length
			: query.trim()
				? titleMatches.length + contentMatches.length
				: recentNotes.length;
	const parsedSearch = useMemo(() => parseSearchQuery(query), [query]);

	useEffect(() => {
		if (!open) return;
		previousFocusRef.current = document.activeElement;
		setActiveTab(initialTab);
		setQuery(initialTab === "search" ? initialQuery : "");
		setSelectedIndex(0);
		reset();
		window.requestAnimationFrame(() => inputRef.current?.focus());
		return () => {
			const prev = previousFocusRef.current;
			if (prev instanceof HTMLElement) prev.focus();
		};
	}, [open, initialQuery, initialTab, reset]);

	const switchTab = useCallback(
		(tab: Tab) => {
			setActiveTab(tab);
			setQuery(tab === "search" ? initialQuery : "");
			setSelectedIndex(0);
			reset();
			window.requestAnimationFrame(() => inputRef.current?.focus());
		},
		[initialQuery, reset],
	);

	useEffect(() => {
		setSelectedIndex((curr) => Math.min(curr, Math.max(itemCount - 1, 0)));
	}, [itemCount]);

	useEffect(() => {
		if (!listRef.current) return;
		const selected = listRef.current.children[
			selectedIndex
		] as HTMLElement | null;
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
			const result = query.trim()
				? [...titleMatches, ...contentMatches][index]
				: recentNotes[index];
			if (!result) return;
			onClose();
			onSelectSearchNote(result.id);
		},
		[
			titleMatches,
			contentMatches,
			recentNotes,
			query,
			onClose,
			onSelectSearchNote,
		],
	);

	const handleSelect = useCallback(
		(index: number) => {
			if (activeTab === "commands") runCommand(index);
			else selectSearchResult(index);
		},
		[activeTab, runCommand, selectSearchResult],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((c) =>
					itemCount ? Math.min(c + 1, itemCount - 1) : 0,
				);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((c) => (c > 0 ? c - 1 : 0));
				return;
			}
			if (e.key === "Enter") {
				e.preventDefault();
				handleSelect(selectedIndex);
				return;
			}
			if (e.key === "Tab") {
				e.preventDefault();
				switchTab(activeTab === "commands" ? "search" : "commands");
			}
		},
		[itemCount, selectedIndex, handleSelect, activeTab, switchTab],
	);

	return (
		<Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent
				className="commandPalette gap-0 border-none bg-transparent p-0 shadow-none sm:max-w-[560px]"
				showCloseButton={false}
				onKeyDown={handleKeyDown}
			>
				<DialogTitle className="sr-only">Command Palette</DialogTitle>

				<div className="commandPaletteTabs">
					<div className="commandPaletteTabGroup">
						{TABS.map((tab) => {
							const isActive = activeTab === tab.id;
							const isDisabled = tab.id === "search" && !vaultPath;
							return (
								<button
									key={tab.id}
									type="button"
									className="commandPaletteTab"
									data-active={isActive}
									disabled={isDisabled}
									onClick={() => switchTab(tab.id)}
								>
									{isActive && (
										<motion.span
											className="commandPaletteTabPill"
											layoutId="paletteTabPill"
											transition={springTransition}
										/>
									)}
									<span className="commandPaletteTabLabel">{tab.label}</span>
								</button>
							);
						})}
					</div>
				</div>

				<div className="commandPaletteInputWrapper">
					<AnimatePresence mode="wait">
						{activeTab === "search" && (
							<motion.span
								key="search-icon"
								className="commandPaletteSearchIcon"
								initial={{ opacity: 0, scale: 0.8 }}
								animate={{ opacity: 1, scale: 1 }}
								exit={{ opacity: 0, scale: 0.8 }}
								transition={{ duration: 0.12 }}
							>
								<Search size={15} />
							</motion.span>
						)}
					</AnimatePresence>
					<input
						ref={inputRef}
						className="commandPaletteInput"
						placeholder={
							activeTab === "commands"
								? "Type a command…"
								: "Search your notes…"
						}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						autoCorrect="off"
						autoCapitalize="off"
						spellCheck={false}
					/>
				</div>
				{activeTab === "search" ? (
					<CommandSearchFilters
						request={parsedSearch.request}
						onChangeQuery={setQuery}
					/>
				) : null}

				<AnimatePresence mode="wait">
					<motion.div
						key={activeTab}
						className="commandPaletteList"
						ref={listRef}
						initial={{ opacity: 0, y: 4 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -4 }}
						transition={{ duration: 0.12 }}
					>
						{activeTab === "search" && query.trim() ? (
							<div className="commandPaletteResultCountPill" aria-live="polite">
								{isSearching
									? "Searching..."
									: `${(titleMatches.length + contentMatches.length).toLocaleString()} results`}
							</div>
						) : null}

						{activeTab === "commands" && (
							<CommandList
								filtered={filtered}
								selectedIndex={selectedIndex}
								onSetSelectedIndex={setSelectedIndex}
								onRunCommand={runCommand}
							/>
						)}

						{activeTab === "search" && (
							<SearchResultsList
								query={query}
								isSearching={isSearching}
								titleMatches={titleMatches}
								contentMatches={contentMatches}
								recentNotes={recentNotes}
								selectedIndex={selectedIndex}
								onSetSelectedIndex={setSelectedIndex}
								onSelectResult={selectSearchResult}
							/>
						)}
					</motion.div>
				</AnimatePresence>
			</DialogContent>
		</Dialog>
	);
}
