import { isImagePath, isPdfPath } from "../utils/path";
import { invoke } from "./tauri";

export interface EditorLinkSuggestion {
	path: string;
	title: string;
	insertText: string;
}

interface SuggestWikiLinksOptions {
	forEmbed?: boolean;
	includeAttachments?: boolean;
	limit: number;
	query: string;
}

interface SuggestMarkdownLinksOptions {
	limit: number;
	query: string;
	sourcePath: string | null;
}

export function isImageTarget(path: string): boolean {
	return isImagePath(path);
}

export function isPdfTarget(path: string): boolean {
	return isPdfPath(path);
}

function titleFromPath(path: string): string {
	const name = path.split("/").pop() ?? path;
	return name.replace(/\.md$/i, "") || name;
}

function toEditorSuggestion(item: {
	path: string;
	title: string;
	insert_text: string;
}): EditorLinkSuggestion {
	return {
		path: item.path,
		title: item.title || titleFromPath(item.path),
		insertText: item.insert_text,
	};
}

export async function suggestWikiLinks({
	forEmbed = false,
	includeAttachments = true,
	limit,
	query,
}: SuggestWikiLinksOptions): Promise<EditorLinkSuggestion[]> {
	const hashIndex = query.indexOf("#");
	if (hashIndex >= 0) {
		const target = query.slice(0, hashIndex).trim();
		if (!target) return [];
		const results = await invoke("space_suggest_wikilink_headings", {
			target,
			query: query.slice(hashIndex + 1),
			limit,
		});
		return results.map(toEditorSuggestion);
	}
	const results = await invoke("space_suggest_links", {
		request: {
			query,
			markdown_only: true,
			include_pdf: !forEmbed && includeAttachments,
			include_images: forEmbed || includeAttachments,
			strip_markdown_ext: true,
			relative_to_source: false,
			limit,
		},
	});
	return results.map(toEditorSuggestion);
}

export async function suggestMarkdownLinks({
	limit,
	query,
	sourcePath,
}: SuggestMarkdownLinksOptions): Promise<EditorLinkSuggestion[]> {
	const results = await invoke("space_suggest_links", {
		request: {
			query,
			source_path: sourcePath,
			markdown_only: false,
			strip_markdown_ext: false,
			relative_to_source: true,
			limit,
		},
	});
	return results.map(toEditorSuggestion);
}
