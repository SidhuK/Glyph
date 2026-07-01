import type { RefObject } from "react";
import { useCallback, useMemo } from "react";
import {
	type EditorLinkSuggestion,
	suggestWikiLinks,
} from "../../../lib/linkSuggestions";
import {
	type SuggestionRange,
	useInputSuggestionEngine,
} from "../suggestions/suggestionEngine";

const WIKI_LINK_SUGGESTION_LIMIT = 8;

interface UseWikiLinkAutocompleteOptions {
	enabled: boolean;
	inputRef: RefObject<HTMLInputElement | null>;
	value: string;
	onChange: (value: string) => void;
	onSelectItem?: (item: EditorLinkSuggestion) => void;
}

function findActiveWikiLinkRange(
	value: string,
	selectionStart: number | null,
): SuggestionRange | null {
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
	const provider = useMemo(
		() => ({
			id: "wiki-link",
			limit: WIKI_LINK_SUGGESTION_LIMIT,
			getItems: (query: string) =>
				suggestWikiLinks({
					query,
					includeAttachments: false,
					limit: WIKI_LINK_SUGGESTION_LIMIT,
				}),
		}),
		[],
	);
	const handleSelect = useCallback(
		(item: EditorLinkSuggestion, range: SuggestionRange) => {
			if (onSelectItem) {
				onSelectItem(item);
				return;
			}
			const markdown = `[[${item.insertText}]]`;
			const nextValue = `${value.slice(0, range.from)}${markdown}${value.slice(
				range.to,
			)}`;
			const nextCursor = range.from + markdown.length;
			onChange(nextValue);
			requestAnimationFrame(() => {
				const input = inputRef.current;
				if (!input) return;
				input.focus();
				input.setSelectionRange(nextCursor, nextCursor);
			});
		},
		[inputRef, onChange, onSelectItem, value],
	);
	return useInputSuggestionEngine({
		enabled,
		inputRef,
		value,
		provider,
		findRange: findActiveWikiLinkRange,
		onSelect: handleSelect,
	});
}
