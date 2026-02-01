import { AnimatePresence, motion } from "motion/react";
import { Fragment, memo, useCallback } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type { SearchResult } from "../lib/tauri";
import { MotionIconButton, MotionInput } from "./MotionUI";

interface SearchPaneProps {
	query: string;
	results: SearchResult[];
	isSearching: boolean;
	error: string;
	onChangeQuery: (next: string) => void;
	onSelectNote: (id: string) => void;
	onOpenAsCanvas?: (query: string) => void;
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
			initial={{ opacity: 0, y: -10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={springTransition}
		>
			<div className="searchHeader">
				<div className="searchTitle">Search</div>
				{onOpenAsCanvas ? (
					<MotionIconButton
						type="button"
						onClick={() => onOpenAsCanvas(query)}
						disabled={!query.trim()}
						title={
							query.trim()
								? "Open results as canvas"
								: "Type a query to open a canvas"
						}
					>
						▦
					</MotionIconButton>
				) : null}
				<AnimatePresence>
					{isSearching && (
						<motion.div
							className="searchStatus"
							initial={{ opacity: 0, scale: 0.9 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.9 }}
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
				<MotionInput
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
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
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
						initial={{ opacity: 0, y: 5 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: 5 }}
						transition={springTransition}
					>
						{!results.length && !isSearching ? (
							<motion.li
								className="searchEmpty"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ delay: 0.1 }}
							>
								No results
							</motion.li>
						) : null}
						<AnimatePresence>
							{results.map((r, index) => (
								<motion.li
									key={r.id}
									className="searchResult"
									initial={{ opacity: 0, x: -10 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: -10 }}
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
