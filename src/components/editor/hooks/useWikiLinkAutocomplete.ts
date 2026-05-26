import type { KeyboardEvent, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "../../../lib/tauri";

const WIKI_LINK_SUGGESTION_LIMIT = 8;

export interface WikiLinkSuggestion {
	path: string;
	title: string;
	insertText: string;
}

interface WikiLinkRange {
	from: number;
	to: number;
	query: string;
}

interface UseWikiLinkAutocompleteOptions {
	enabled: boolean;
	inputRef: RefObject<HTMLInputElement | null>;
	value: string;
	onChange: (value: string) => void;
	onSelectItem?: (item: WikiLinkSuggestion) => void;
}

function findActiveWikiLinkRange(
	value: string,
	selectionStart: number | null,
): WikiLinkRange | null {
	if (selectionStart == null) return null;
	const beforeCursor = value.slice(0, selectionStart);
	const openIndex = beforeCursor.lastIndexOf("[[");
	if (openIndex < 0) return null;

	const afterOpen = beforeCursor.slice(openIndex + 2);
	if (afterOpen.includes("]]") || afterOpen.includes("\n")) return null;
	if (afterOpen.includes("[") || afterOpen.includes("]")) return null;

	return {
		from: openIndex,
		to: selectionStart,
		query: afterOpen.trim(),
	};
}

export function useWikiLinkAutocomplete({
	enabled,
	inputRef,
	value,
	onChange,
	onSelectItem,
}: UseWikiLinkAutocompleteOptions) {
	const requestIdRef = useRef(0);
	const [range, setRange] = useState<WikiLinkRange | null>(null);
	const [items, setItems] = useState<WikiLinkSuggestion[]>([]);
	const [activeIndex, setActiveIndex] = useState(0);

	const close = useCallback(() => {
		requestIdRef.current += 1;
		setRange(null);
		setItems([]);
		setActiveIndex(0);
	}, []);

	const refresh = useCallback(
		(nextValue: string, selectionStart: number | null) => {
			if (!enabled) {
				close();
				return;
			}

			const nextRange = findActiveWikiLinkRange(nextValue, selectionStart);
			if (!nextRange) {
				close();
				return;
			}

			const requestId = requestIdRef.current + 1;
			requestIdRef.current = requestId;
			setRange(nextRange);
			setActiveIndex(0);
			setItems([]);

			void invoke("space_suggest_links", {
				request: {
					query: nextRange.query,
					markdown_only: true,
					include_pdf: false,
					include_images: false,
					strip_markdown_ext: true,
					relative_to_source: false,
					limit: WIKI_LINK_SUGGESTION_LIMIT,
				},
			})
				.then((results) => {
					if (requestIdRef.current !== requestId) return;
					setItems(
						results.map((item) => ({
							path: item.path,
							title: item.title || item.path,
							insertText: item.insert_text,
						})),
					);
				})
				.catch((error) => {
					if (requestIdRef.current !== requestId) return;
					console.warn("Failed to load wikilink suggestions", error);
					setItems([]);
				});
		},
		[close, enabled],
	);

	useEffect(() => {
		const input = inputRef.current;
		if (!input || document.activeElement !== input) return;
		refresh(value, input.selectionStart);
	}, [inputRef, refresh, value]);

	const select = useCallback(
		(item: WikiLinkSuggestion) => {
			if (onSelectItem) {
				onSelectItem(item);
				close();
				return;
			}
			if (!range) return;
			const markdown = `[[${item.insertText}]]`;
			const nextValue = `${value.slice(0, range.from)}${markdown}${value.slice(
				range.to,
			)}`;
			const nextCursor = range.from + markdown.length;
			onChange(nextValue);
			close();
			requestAnimationFrame(() => {
				const input = inputRef.current;
				if (!input) return;
				input.focus();
				input.setSelectionRange(nextCursor, nextCursor);
			});
		},
		[close, inputRef, onChange, onSelectItem, range, value],
	);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			if (!items.length) return false;
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setActiveIndex((current) => (current + 1) % items.length);
				return true;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setActiveIndex(
					(current) => (current - 1 + items.length) % items.length,
				);
				return true;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				select(items[activeIndex] ?? items[0]);
				return true;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				close();
				return true;
			}
			return false;
		},
		[activeIndex, close, items, select],
	);

	return {
		activeIndex,
		close,
		handleKeyDown,
		items,
		refresh,
		select,
	};
}
