import { AnimatePresence, motion } from "motion/react";
import { Fragment, memo, useCallback } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type { SearchResult } from "../lib/tauri";
import { Button } from "./ui/shadcn/button";
import { Input } from "./ui/shadcn/input";

interface SearchPaneProps {
	query: string;
	results: SearchResult[];
	isSearching: boolean;
	error: string;
	onChangeQuery: (next: string) => void;
	onSelectNote: (id: string) => void;
	onOpenAsCanvas?: (query: string) => void;
	onSearchInputRef?: (el: HTMLInputElement | null) => void;
}

const springTransition = {
	type: "spring",
	stiffness: 400,
	damping: 25,
} as const;

export const SearchPane = memo(function SearchPane({
	query,
	results,
	isSearching,
	error,
	onChangeQuery,
	onSelectNote,
	onOpenAsCanvas,
	onSearchInputRef,
}: SearchPaneProps) {
	const onChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => onChangeQuery(e.target.value),
		[onChangeQuery],
	);

	const showResults = query.trim().length > 0;

	const renderSnippet = useCallback((snippet: string) => {
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
			out.push(
				<Fragment key={key++}>{inMark ? <mark>{p}</mark> : p}</Fragment>,
			);
		}
		return out;
	}, []);

	return (
		<motion.section
			className="searchPane"
			initial={{ y: -10 }}
			animate={{ y: 0 }}
			transition={springTransition}
		>
			<div className="searchHeader">
				<div className="searchTitle">Search</div>
				{onOpenAsCanvas ? (
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						onClick={() => onOpenAsCanvas(query)}
						disabled={!query.trim()}
						title={
							query.trim()
								? "Open results as canvas"
								: "Type a query to open a canvas"
						}
					>
						▦
					</Button>
				) : null}
				<AnimatePresence>
					{isSearching && (
						<motion.div
							className="searchStatus"
							initial={{ scale: 0.9 }}
							animate={{ scale: 1 }}
							exit={{ scale: 0.9 }}
							transition={springTransition}
						>
							<motion.span
								animate={{ rotate: 360 }}
								transition={{
									duration: 1,
									repeat: Number.POSITIVE_INFINITY,
									ease: "linear",
								}}
								style={{ display: "inline-block" }}
							>
								⟳
							</motion.span>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
			<div className="searchBody">
				<Input
					ref={onSearchInputRef}
					value={query}
					onChange={onChange}
					placeholder="Search notes…"
					className="searchInput"
					autoCorrect="off"
					autoCapitalize="off"
					spellCheck={false}
				/>
			</div>

			<AnimatePresence>
				{error && (
					<motion.div
						className="searchError"
						initial={{ height: 0 }}
						animate={{ height: "auto" }}
						exit={{ height: 0 }}
						transition={springTransition}
					>
						{error}
					</motion.div>
				)}
			</AnimatePresence>

			<AnimatePresence mode="wait">
				{showResults && (
					<motion.ul
						className="searchResults"
						initial={{ y: 5 }}
						animate={{ y: 0 }}
						exit={{ y: 5 }}
						transition={springTransition}
					>
						{!results.length && !isSearching ? (
							<li className="searchEmpty">No results</li>
						) : null}
						<AnimatePresence>
							{results.map((r, index) => (
								<motion.li
									key={r.id}
									className="searchResult"
									initial={{ x: -10 }}
									animate={{ x: 0 }}
									exit={{ x: -10 }}
									transition={{ ...springTransition, delay: index * 0.03 }}
								>
									<motion.button
										type="button"
										className="searchResultButton"
										onClick={() => onSelectNote(r.id)}
										whileHover={{
											x: 4,
											backgroundColor: "var(--bg-hover)",
										}}
										whileTap={{ scale: 0.98 }}
										transition={springTransition}
									>
										<div className="searchResultTitle">
											{r.title || "Untitled"}
										</div>
										<div className="searchResultSnippet">
											{renderSnippet(r.snippet)}
										</div>
									</motion.button>
								</motion.li>
							))}
						</AnimatePresence>
					</motion.ul>
				)}
			</AnimatePresence>
		</motion.section>
	);
});
