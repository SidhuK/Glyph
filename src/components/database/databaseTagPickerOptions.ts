import type { TagCount } from "../../lib/tauri";
import {
	buildTagSuggestions,
	normalizeTagDraftPrefix,
} from "../editor/noteProperties/utils";

export function buildDatabaseTagPickerOptions(
	tags: TagCount[],
	query: string,
	limit = Number.POSITIVE_INFINITY,
): Array<{ tag: string }> {
	const trimmed = query.trim();
	if (trimmed.length >= 2) {
		const suggestions = buildTagSuggestions(tags, [], trimmed, limit);
		if (suggestions.length > 0) {
			return suggestions.map(({ tag }) => ({ tag }));
		}
	}

	const normalizedQuery = normalizeTagDraftPrefix(trimmed);
	return tags
		.filter(
			({ tag, is_explicit }) =>
				is_explicit &&
				(normalizedQuery.length === 0 ||
					tag.toLowerCase().includes(normalizedQuery)),
		)
		.map(({ tag }) => ({ tag }))
		.slice(0, limit);
}

export function buildDatabaseTagPickerExplicitTags(tags: TagCount[]): string[] {
	return tags.filter(({ is_explicit }) => is_explicit).map(({ tag }) => tag);
}
