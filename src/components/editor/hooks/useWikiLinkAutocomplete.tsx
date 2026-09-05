import type { RefObject } from "react";
import { useCallback, useMemo } from "react";
import type { EditorLinkSuggestion } from "../../../lib/linkSuggestions";
import { splitWikiLinkQuery } from "../markdown/wikiLinkCodec";
import { suggestWikiLinkItems } from "../markdown/wikiLinkHeadingSuggest";
import {
	type SuggestionRange,
	type SuggestionSelectCause,
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

function wikiLinkOpening(value: string, from: number): "![[" | "[[" {
	return from > 0 && value[from - 1] === "!" ? "![[" : "[[";
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
			getItems: (query: string) => {
				const parsed = splitWikiLinkQuery(query);
				return suggestWikiLinkItems({
					query: onSelectItem ? parsed.target : query,
					includeAttachments: false,
					limit: WIKI_LINK_SUGGESTION_LIMIT,
				});
			},
		}),
		[onSelectItem],
	);
	const applyMarkdown = useCallback(
		(nextValue: string, nextCursor: number) => {
			onChange(nextValue);
			requestAnimationFrame(() => {
				const input = inputRef.current;
				if (!input) return;
				input.focus();
				input.setSelectionRange(nextCursor, nextCursor);
			});
		},
		[inputRef, onChange],
	);
	const handleSelect = useCallback(
		(
			item: EditorLinkSuggestion,
			range: SuggestionRange,
			cause: SuggestionSelectCause,
		) => {
			if (onSelectItem) {
				onSelectItem(item);
				return;
			}
			const opening = wikiLinkOpening(value, range.from);
			const replaceFrom = opening === "![[" ? range.from - 1 : range.from;
			const commit = cause !== "tab" || item.kind === "heading";
			const markdown = commit
				? `${opening}${item.insertText}]]`
				: `${opening}${item.insertText}`;
			const nextValue = `${value.slice(0, replaceFrom)}${markdown}${value.slice(
				range.to,
			)}`;
			applyMarkdown(nextValue, replaceFrom + markdown.length);
		},
		[applyMarkdown, onSelectItem, value],
	);
	return useInputSuggestionEngine({
		enabled,
		inputRef,
		value,
		provider,
		findRange: findActiveWikiLinkRange,
		onSelect: handleSelect,
		closeAfterSelect: (item, cause) =>
			Boolean(onSelectItem) || cause !== "tab" || item.kind === "heading",
	});
}

export function WikiLinkSuggestionList({
	items,
	activeIndex,
	className,
	onSelect,
}: {
	items: EditorLinkSuggestion[];
	activeIndex: number;
	className: string;
	onSelect: (item: EditorLinkSuggestion) => void;
}) {
	if (items.length === 0) return null;
	return (
		<div className={`wikiLinkSuggestionMenu ${className}`}>
			{items.map((item, index) => (
				<button
					key={
						item.kind === "heading"
							? `${item.kind}:${item.path}#${item.slug}`
							: `${item.kind}:${item.path}`
					}
					type="button"
					className={[
						"wikiLinkSuggestionItem",
						index === activeIndex ? "active" : "",
					]
						.filter(Boolean)
						.join(" ")}
					onMouseDown={(event) => {
						event.preventDefault();
						onSelect(item);
					}}
				>
					<span className="wikiLinkSuggestionTitle">{item.title}</span>
					<span className="wikiLinkSuggestionPath">{item.path}</span>
				</button>
			))}
		</div>
	);
}
