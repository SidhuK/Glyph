import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";

export type SuggestionResult<T> = T[] | Promise<T[]>;

export interface SuggestionProvider<T> {
	id: string;
	limit?: number;
	getItems: (query: string) => SuggestionResult<T>;
	filter?: (item: T, query: string) => boolean;
	sort?: (left: T, right: T, query: string) => number;
}

export interface SuggestionRange {
	from: number;
	to: number;
	query: string;
}

export interface UseInputSuggestionEngineOptions<T> {
	enabled: boolean;
	inputRef: RefObject<HTMLInputElement | null>;
	value: string;
	provider: SuggestionProvider<T>;
	findRange: (
		value: string,
		selectionStart: number | null,
	) => SuggestionRange | null;
	onSelect: (item: T, range: SuggestionRange) => void;
}

export function clampSuggestionIndex(index: number, itemCount: number): number {
	if (itemCount <= 0) return 0;
	if (index < 0) return itemCount - 1;
	if (index >= itemCount) return 0;
	return index;
}

export function nextSuggestionIndex(
	currentIndex: number,
	itemCount: number,
	direction: 1 | -1,
): number {
	return clampSuggestionIndex(currentIndex + direction, itemCount);
}

export function queryMatchesText(query: string, searchText: string): boolean {
	const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
	if (!terms.length) return true;
	const haystack = searchText.toLowerCase();
	return terms.every((term) => haystack.includes(term));
}

export async function resolveSuggestionItems<T>(
	provider: SuggestionProvider<T>,
	query: string,
): Promise<T[]> {
	const items = await provider.getItems(query);
	return applySuggestionTransforms(provider, query, items);
}

function applySuggestionTransforms<T>(
	provider: SuggestionProvider<T>,
	query: string,
	items: T[],
): T[] {
	const filtered = provider.filter
		? items.filter((item) => provider.filter?.(item, query) ?? true)
		: items;
	const sorted = provider.sort
		? [...filtered].sort(
				(left, right) => provider.sort?.(left, right, query) ?? 0,
			)
		: filtered;
	return sorted.slice(0, provider.limit ?? sorted.length);
}

export function useInputSuggestionEngine<T>({
	enabled,
	inputRef,
	value,
	provider,
	findRange,
	onSelect,
}: UseInputSuggestionEngineOptions<T>) {
	const requestIdRef = useRef(0);
	const [range, setRange] = useState<SuggestionRange | null>(null);
	const [items, setItems] = useState<T[]>([]);
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

			const nextRange = findRange(nextValue, selectionStart);
			if (!nextRange) {
				close();
				return;
			}

			const requestId = requestIdRef.current + 1;
			requestIdRef.current = requestId;
			setRange(nextRange);
			setActiveIndex(0);
			setItems([]);

			void resolveSuggestionItems(provider, nextRange.query)
				.then((results) => {
					if (requestIdRef.current !== requestId) return;
					setItems(results);
				})
				.catch((error) => {
					if (requestIdRef.current !== requestId) return;
					console.warn(`Failed to load ${provider.id} suggestions`, error);
					setItems([]);
				});
		},
		[close, enabled, findRange, provider],
	);

	useEffect(() => {
		const input = inputRef.current;
		if (!input || document.activeElement !== input) return;
		refresh(value, input.selectionStart);
	}, [inputRef, refresh, value]);

	const select = useCallback(
		(item: T) => {
			if (!range) return;
			onSelect(item, range);
			close();
		},
		[close, onSelect, range],
	);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Escape" && range) {
				event.preventDefault();
				close();
				return true;
			}
			if (!items.length) return false;
			if (event.key === "ArrowDown") {
				event.preventDefault();
				setActiveIndex((current) =>
					nextSuggestionIndex(current, items.length, 1),
				);
				return true;
			}
			if (event.key === "ArrowUp") {
				event.preventDefault();
				setActiveIndex((current) =>
					nextSuggestionIndex(current, items.length, -1),
				);
				return true;
			}
			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				select(items[activeIndex] ?? items[0]);
				return true;
			}
			return false;
		},
		[activeIndex, close, items, range, select],
	);

	return {
		activeIndex,
		close,
		handleKeyDown,
		items,
		range,
		refresh,
		select,
	};
}
