import {
	type Completion,
	type CompletionContext,
	type CompletionResult,
	pickedCompletion,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import {
	suggestMarkdownLinks,
	suggestWikiLinks,
} from "../../../lib/linkSuggestions";

const COMPLETION_LIMIT = 8;

function completionApply(markdown: string, closing: string) {
	return (
		view: EditorView,
		completion: Completion,
		from: number,
		to: number,
	) => {
		const existingClosing = view.state.doc.sliceString(to, to + closing.length);
		const replaceTo = existingClosing === closing ? to + closing.length : to;
		view.dispatch({
			changes: { from, to: replaceTo, insert: markdown },
			selection: { anchor: from + markdown.length },
			annotations: pickedCompletion.of(completion),
		});
	};
}

async function wikiLinkCompletions(
	context: CompletionContext,
): Promise<CompletionResult | null> {
	const match = context.matchBefore(/!?\[\[[^\]\n]*/);
	if (!match) return null;
	const asEmbed = match.text.startsWith("![[");
	const query = match.text.slice(asEmbed ? 3 : 2).trim();
	const results = await suggestWikiLinks({
		query,
		embedOnly: asEmbed,
		limit: COMPLETION_LIMIT,
	});
	if (context.aborted) return null;
	const opening = asEmbed ? "![[" : "[[";
	const options = results.map(
		(item): Completion => ({
			label: item.title,
			detail: item.path,
			apply: completionApply(`${opening}${item.insertText}]]`, "]]"),
			type: asEmbed ? "keyword" : "text",
			boost: item.title ? 1 : 0,
		}),
	);
	return { from: match.from, options, filter: false };
}

async function markdownLinkCompletions(
	context: CompletionContext,
	getRelPath: () => string,
): Promise<CompletionResult | null> {
	const match = context.matchBefore(/\]\([^\n)]*/);
	if (!match) return null;
	const query = match.text.slice(2).trim();
	const results = await suggestMarkdownLinks({
		query,
		sourcePath: getRelPath() || null,
		limit: COMPLETION_LIMIT,
	});
	if (context.aborted) return null;
	const options = results.map(
		(item): Completion => ({
			label: item.title,
			detail: item.path,
			apply: completionApply(`](${item.insertText})`, ")"),
			type: "text",
		}),
	);
	return { from: match.from, options, filter: false };
}

export function createRawLinkCompletionSource(getRelPath: () => string) {
	return async (context: CompletionContext) => {
		try {
			return (
				(await wikiLinkCompletions(context)) ??
				(await markdownLinkCompletions(context, getRelPath))
			);
		} catch (error) {
			console.warn("Failed to load raw editor link suggestions", error);
			return null;
		}
	};
}
