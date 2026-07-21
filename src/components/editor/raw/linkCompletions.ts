import {
	type Completion,
	type CompletionContext,
	type CompletionResult,
	pickedCompletion,
	selectedCompletion,
	startCompletion,
} from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import {
	type EditorLinkSuggestion,
	suggestMarkdownLinks,
	suggestWikiLinks,
} from "../../../lib/linkSuggestions";

const COMPLETION_LIMIT = 8;
const wikiLinkTargets = new WeakMap<Completion, EditorLinkSuggestion>();

function completionApply(
	markdown: string,
	closing: string,
	isCurrentContext: (text: string) => boolean,
) {
	return (
		view: EditorView,
		completion: Completion,
		from: number,
		to: number,
	) => {
		if (!isCurrentContext(view.state.doc.sliceString(from, to))) return;
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
		forEmbed: asEmbed,
		limit: COMPLETION_LIMIT,
	});
	if (context.aborted) return null;
	const opening = asEmbed ? "![[" : "[[";
	const options = results.map((item): Completion => {
		const completion: Completion = {
			label: item.title,
			detail: item.path,
			apply: completionApply(
				`${opening}${item.insertText}]]`,
				"]]",
				(text) => text.startsWith(opening) && !text.includes("\n"),
			),
			type: asEmbed ? "keyword" : "text",
			boost: item.title ? 1 : 0,
		};
		wikiLinkTargets.set(completion, item);
		return completion;
	});
	return { from: match.from, options, filter: false };
}

export function drillIntoSelectedWikiLink(view: EditorView): boolean {
	const completion = selectedCompletion(view.state);
	const item = completion ? wikiLinkTargets.get(completion) : undefined;
	if (!item || !/\.md$/i.test(item.path) || item.insertText.includes("#")) {
		return false;
	}
	const cursor = view.state.selection.main.head;
	const line = view.state.doc.lineAt(cursor);
	const match = line.text.slice(0, cursor - line.from).match(/!?\[\[[^\]\n]*$/);
	if (!match) return false;
	const from = cursor - match[0].length;
	const opening = match[0].startsWith("![[") ? "![[" : "[[";
	view.dispatch({
		changes: { from, to: cursor, insert: `${opening}${item.insertText}#` },
		selection: { anchor: from + opening.length + item.insertText.length + 1 },
	});
	return startCompletion(view);
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
			apply: completionApply(
				`](${item.insertText})`,
				")",
				(text) => text.startsWith("](") && !text.includes("\n"),
			),
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
