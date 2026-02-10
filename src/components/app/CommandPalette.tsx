import { AnimatePresence, motion } from "motion/react";
import {
	Fragment,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { ReactNode } from "react";
import {
	type Shortcut,
	formatShortcut,
	formatShortcutParts,
} from "../../lib/shortcuts";
import { type SearchResult, invoke } from "../../lib/tauri";
import { Search } from "../Icons";
import { Dialog, DialogContent, DialogTitle } from "../ui/shadcn/dialog";

export interface Command {
	id: string;
	label: string;
	shortcut?: Shortcut;
	action: () => void | Promise<void>;
	enabled?: boolean;
}

type Tab = "commands" | "search";

interface CommandPaletteProps {
	open: boolean;
	initialTab?: Tab;
	commands: Command[];
	onClose: () => void;
	vaultPath: string | null;
	onSelectSearchNote: (id: string) => void;
}

const TABS: { id: Tab; label: string }[] = [
	{ id: "commands", label: "Commands" },
	{ id: "search", label: "Search" },
];

const springTransition = {
	type: "spring",
	stiffness: 500,
	damping: 35,
} as const;

function renderSnippet(snippet: string): ReactNode[] {
	const parts = snippet.split(/([⟦⟧])/);
	const out: ReactNode[] = [];
	let inMark = false;
	let key = 0;
	for (const p of parts) {
		if (!p) continue;
		if (p === "⟦") {
			inMark = true;
			continue;
		}
		if (p === "⟧") {
			inMark = false;
			continue;
		}
		out.push(<Fragment key={key++}>{inMark ? <mark>{p}</mark> : p}</Fragment>);
	}
	return out;
}

export function CommandPalette({
	open,
	initialTab = "commands",
	commands,
	onClose,
	vaultPath,
	onSelectSearchNote,
}: CommandPaletteProps) {
	const [activeTab, setActiveTab] = useState<Tab>(initialTab);
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
	const [recentNotes, setRecentNotes] = useState<SearchResult[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const previousFocusRef = useRef<Element | null>(null);
	const listRef = useRef<HTMLDivElement | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const filtered = useMemo(() => {
		if (activeTab !== "commands") return [];
		const q = query.trim().toLowerCase();
		const matches = q
			? commands.filter((cmd) => cmd.label.toLowerCase().includes(q))
			: commands;
		return matches.filter((cmd) => cmd.enabled !== false);
	}, [commands, query, activeTab]);

	const { titleMatches, contentMatches } = useMemo(() => {
		if (activeTab !== "search" || !query.trim())
			return { titleMatches: [], contentMatches: [] };
		const q = query.trim().toLowerCase();
		const title: SearchResult[] = [];
		const content: SearchResult[] = [];
		for (const r of searchResults) {
			if (r.title.toLowerCase().includes(q)) {
				title.push(r);
			} else {
				content.push(r);
			}
		}
		return { titleMatches: title, contentMatches: content };
	}, [searchResults, query, activeTab]);

	const itemCount =
		activeTab === "commands"
			? filtered.length
			: query.trim()
				? titleMatches.length + contentMatches.length
				: recentNotes.length;

	useEffect(() => {
		if (!open) return;
		previousFocusRef.current = document.activeElement;
		setActiveTab(initialTab);
		setQuery("");
		setSelectedIndex(0);
		setSearchResults([]);
		setRecentNotes([]);
		setIsSearching(false);
		window.requestAnimationFrame(() => {
			inputRef.current?.focus();
		});
		return () => {
			const prev = previousFocusRef.current;
			if (prev instanceof HTMLElement) prev.focus();
		};
	}, [open, initialTab]);

	useEffect(() => {
		if (!open || !vaultPath) return;
		invoke("recent_notes", { limit: 8 })
			.then(setRecentNotes)
			.catch(() => setRecentNotes([]));
	}, [open, vaultPath]);

	const switchTab = useCallback((tab: Tab) => {
		setActiveTab(tab);
		setQuery("");
		setSelectedIndex(0);
		setSearchResults([]);
		setIsSearching(false);
		window.requestAnimationFrame(() => {
			inputRef.current?.focus();
		});
	}, []);

	useEffect(() => {
		setSelectedIndex((curr) => Math.min(curr, Math.max(itemCount - 1, 0)));
	}, [itemCount]);

	useEffect(() => {
		if (activeTab !== "search") return;
		if (debounceRef.current) clearTimeout(debounceRef.current);
		const trimmed = query.trim();
		if (!trimmed) {
			setSearchResults([]);
			setIsSearching(false);
			return;
		}
		setIsSearching(true);
		debounceRef.current = setTimeout(() => {
			invoke("search", { query: trimmed })
				.then((results) => {
					setSearchResults(results);
					setSelectedIndex(0);
				})
				.catch(() => {
					setSearchResults([]);
				})
				.finally(() => {
					setIsSearching(false);
				});
		}, 200);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [query, activeTab]);

	useEffect(() => {
		if (!listRef.current) return;
		const items = listRef.current.children;
		const selected = items[selectedIndex] as HTMLElement | undefined;
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
			let result: SearchResult | undefined;
			if (query.trim()) {
				const combined = [...titleMatches, ...contentMatches];
				result = combined[index];
			} else {
				result = recentNotes[index];
			}
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
				setSelectedIndex((curr) =>
					itemCount ? Math.min(curr + 1, itemCount - 1) : 0,
				);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((curr) => (curr > 0 ? curr - 1 : 0));
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

				{/* ── Tabs ── */}
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

				{/* ── Input ── */}
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

				{/* ── List ── */}
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
						{activeTab === "commands" && (
							<>
								{filtered.map((cmd, index) => (
									<div
										key={cmd.id}
										className="commandPaletteItem"
										data-selected={index === selectedIndex}
										onMouseEnter={() => setSelectedIndex(index)}
										onMouseDown={(e) => {
											e.preventDefault();
											runCommand(index);
										}}
									>
										<span>{cmd.label}</span>
										{cmd.shortcut ? (
											<span
												className="commandPaletteShortcut"
												aria-label={formatShortcut(cmd.shortcut)}
											>
												{formatShortcutParts(cmd.shortcut).map((part) => (
													<kbd key={part}>{part}</kbd>
												))}
											</span>
										) : null}
									</div>
								))}
								{filtered.length === 0 && (
									<div className="commandPaletteEmpty">No commands</div>
								)}
							</>
						)}

						{activeTab === "search" && (
							<>
								{!query.trim() && (
									<>
										{recentNotes.length > 0 && (
											<>
												<div className="commandPaletteGroupLabel">Recent</div>
												{recentNotes.map((r, index) => (
													<div
														key={r.id}
														className="commandPaletteItem"
														data-selected={index === selectedIndex}
														onMouseEnter={() => setSelectedIndex(index)}
														onMouseDown={(e) => {
															e.preventDefault();
															selectSearchResult(index);
														}}
													>
														<span>{r.title || "Untitled"}</span>
													</div>
												))}
											</>
										)}
										{recentNotes.length === 0 && (
											<div className="commandPaletteEmpty">
												Type to search your notes…
											</div>
										)}
									</>
								)}

								{query.trim() && (
									<>
										{titleMatches.length > 0 && (
											<>
												<div className="commandPaletteGroupLabel">Notes</div>
												{titleMatches.map((r, index) => (
													<div
														key={r.id}
														className="commandPaletteItem commandPaletteResultItem"
														data-selected={index === selectedIndex}
														onMouseEnter={() => setSelectedIndex(index)}
														onMouseDown={(e) => {
															e.preventDefault();
															selectSearchResult(index);
														}}
													>
														<div className="commandPaletteResultContent">
															<div className="commandPaletteResultTitle">
																{r.title || "Untitled"}
															</div>
															<div className="commandPaletteResultSnippet">
																{renderSnippet(r.snippet)}
															</div>
														</div>
													</div>
												))}
											</>
										)}
										{contentMatches.length > 0 && (
											<>
												<div className="commandPaletteGroupLabel">Content</div>
												{contentMatches.map((r, index) => {
													const globalIndex = titleMatches.length + index;
													return (
														<div
															key={r.id}
															className="commandPaletteItem commandPaletteResultItem"
															data-selected={globalIndex === selectedIndex}
															onMouseEnter={() => setSelectedIndex(globalIndex)}
															onMouseDown={(e) => {
																e.preventDefault();
																selectSearchResult(globalIndex);
															}}
														>
															<div className="commandPaletteResultContent">
																<div className="commandPaletteResultTitle">
																	{r.title || "Untitled"}
																</div>
																<div className="commandPaletteResultSnippet">
																	{renderSnippet(r.snippet)}
																</div>
															</div>
														</div>
													);
												})}
											</>
										)}
										{titleMatches.length === 0 &&
											contentMatches.length === 0 &&
											!isSearching && (
												<div className="commandPaletteEmpty">No results</div>
											)}
										{isSearching &&
											titleMatches.length === 0 &&
											contentMatches.length === 0 && (
												<div className="commandPaletteEmpty">Searching…</div>
											)}
									</>
								)}
							</>
						)}
					</motion.div>
				</AnimatePresence>
			</DialogContent>
		</Dialog>
	);
}
