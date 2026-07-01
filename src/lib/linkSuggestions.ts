import { isImagePath, isPdfPath } from "../utils/path";
import { invoke } from "./tauri";

export interface EditorLinkSuggestion {
	path: string;
	title: string;
	insertText: string;
}

interface SuggestWikiLinksOptions {
	embedOnly?: boolean;
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
	embedOnly = false,
	includeAttachments = true,
	limit,
	query,
}: SuggestWikiLinksOptions): Promise<EditorLinkSuggestion[]> {
	const requestLimit = embedOnly ? Math.min(limit * 4, 200) : limit;
	const results = await invoke("space_suggest_links", {
		request: {
			query,
			markdown_only: true,
			include_pdf: !embedOnly && includeAttachments,
			include_images: embedOnly || includeAttachments,
			strip_markdown_ext: !embedOnly,
			relative_to_source: false,
			limit: requestLimit,
		},
	});
	return results
		.filter((item) => !embedOnly || isImageTarget(item.path))
		.slice(0, limit)
		.map(toEditorSuggestion);
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
