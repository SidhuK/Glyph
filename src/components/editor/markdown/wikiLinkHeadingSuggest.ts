import {
	type EditorLinkSuggestion,
	suggestWikiLinks,
} from "../../../lib/linkSuggestions";
import { splitYamlFrontmatter } from "../../../lib/notePreview";
import { invoke } from "../../../lib/tauri";
import { isMarkdownPath } from "../../../utils/path";
import { analyzeNoteInfo } from "../../preview/noteInfoAnalysis";
import { queryMatchesText } from "../suggestions/suggestionEngine";
import { splitWikiLinkQuery } from "./wikiLinkCodec";

interface SuggestWikiLinkItemsOptions {
	embedOnly?: boolean;
	includeAttachments?: boolean;
	limit: number;
	query: string;
}

async function resolveWikiLinkPath(target: string): Promise<string | null> {
	try {
		const resolved = await invoke("space_resolve_wikilink", { target });
		return resolved && isMarkdownPath(resolved) ? resolved : null;
	} catch {
		return null;
	}
}

async function suggestWikiLinkHeadings(options: {
	target: string;
	headingQuery: string;
	limit: number;
}): Promise<EditorLinkSuggestion[]> {
	if (options.headingQuery.trim().startsWith("^")) return [];
	const path = await resolveWikiLinkPath(options.target);
	if (!path) return [];
	try {
		const text = (await invoke("space_read_text", { path })).text;
		const { body } = splitYamlFrontmatter(text);
		const headings = analyzeNoteInfo(body, body, true).headings;
		return headings
			.filter((heading) =>
				queryMatchesText(
					options.headingQuery,
					`${heading.text} ${heading.slug ?? ""}`,
				),
			)
			.slice(0, options.limit)
			.map((heading) => {
				const slug = heading.slug ?? heading.text;
				return {
					kind: "heading" as const,
					path,
					title: heading.text,
					insertText: `${options.target}#${slug}`,
					slug,
				};
			});
	} catch {
		return [];
	}
}

export async function suggestWikiLinkItems({
	embedOnly = false,
	includeAttachments = true,
	limit,
	query,
}: SuggestWikiLinkItemsOptions): Promise<EditorLinkSuggestion[]> {
	const parsed = splitWikiLinkQuery(query);
	if (embedOnly) {
		return suggestWikiLinks({
			query: parsed.target || query,
			embedOnly: true,
			includeAttachments,
			limit,
		});
	}
	switch (parsed.kind) {
		case "file":
			return suggestWikiLinks({
				query,
				includeAttachments,
				limit,
			});
		case "heading":
			if (!parsed.target) return [];
			return suggestWikiLinkHeadings({
				target: parsed.target,
				headingQuery: parsed.headingQuery,
				limit,
			});
		default: {
			const _exhaustive: never = parsed;
			return _exhaustive;
		}
	}
}
