import {
	type Completion,
	type CompletionContext,
	type CompletionResult,
	pickedCompletion,
	selectedCompletion,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { suggestMarkdownLinks } from "../../../lib/linkSuggestions";
import { suggestWikiLinkItems } from "../markdown/wikiLinkHeadingSuggest";

const COMPLETION_LIMIT = 8;
const WIKI_LINK_COMPLETION = Symbol("wikiLinkCompletion");

type WikiLinkCompletionMeta = {
	opening: "![[" | "[[";
	insertText: string;
	isHeading: boolean;
};

type WikiLinkCompletion = Completion & {
	[WIKI_LINK_COMPLETION]: WikiLinkCompletionMeta;
};

function isWikiLinkCompletion(
	completion: Completion | null,
): completion is WikiLinkCompletion {
	return Boolean(completion && WIKI_LINK_COMPLETION in completion);
}

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

function applyWikiLinkCompletion(options: {
	view: EditorView;
	completion: Completion;
	from: number;
	to: number;
	opening: "![[" | "[[";
	insertText: string;
	closeLink: boolean;
}): void {
	const current = options.view.state.doc.sliceString(options.from, options.to);
	if (!current.startsWith(options.opening) || current.includes("\n")) return;
	const markdown = options.closeLink
		? `${options.opening}${options.insertText}]]`
		: `${options.opening}${options.insertText}`;
	const existingClosing = options.view.state.doc.sliceString(
		options.to,
		options.to + 2,
	);
	const replaceTo =
		options.closeLink && existingClosing === "]]" ? options.to + 2 : options.to;
	options.view.dispatch({
		changes: { from: options.from, to: replaceTo, insert: markdown },
		selection: { anchor: options.from + markdown.length },
		annotations: pickedCompletion.of(options.completion),
	});
}

function wikiLinkApply(meta: WikiLinkCompletionMeta) {
	return (
		view: EditorView,
		completion: Completion,
		from: number,
		to: number,
	) => {
		applyWikiLinkCompletion({
			view,
			completion,
			from,
			to,
			opening: meta.opening,
			insertText: meta.insertText,
			closeLink: meta.isHeading,
		});
	};
}

function isInTableOrCode(view: EditorView, pos: number): boolean {
	let node = syntaxTree(view.state).resolveInner(pos, -1);
	while (node) {
		if (node.name === "Table") return true;
		if (
			node.name === "FencedCode" ||
			node.name === "CodeBlock" ||
			node.name === "InlineCode"
		) {
			return true;
		}
		if (!node.parent) return false;
		node = node.parent;
	}
	return false;
}

function closeOpenWikiLink(view: EditorView): boolean {
	const pos = view.state.selection.main.head;
	if (isInTableOrCode(view, pos)) return false;
	const line = view.state.doc.lineAt(pos);
	const before = line.text.slice(0, pos - line.from);
	const openIndex = before.lastIndexOf("[[");
	if (openIndex < 0) return false;
	const tokenStart = before[openIndex - 1] === "!" ? openIndex - 1 : openIndex;
	const charBefore = tokenStart > 0 ? before[tokenStart - 1] : "";
	if (charBefore && /[A-Za-z0-9]/.test(charBefore)) return false;
	const afterOpen = before.slice(openIndex + 2);
	if (afterOpen.includes("]]") || afterOpen.includes("\n")) return false;
	if (afterOpen.includes("[") || afterOpen.includes("]")) return false;
	if (!afterOpen.trim()) return false;
	const existingClosing = view.state.doc.sliceString(pos, pos + 2);
	if (existingClosing === "]]") {
		view.dispatch({ selection: { anchor: pos + 2 } });
		return true;
	}
	view.dispatch({
		changes: { from: pos, insert: "]]" },
		selection: { anchor: pos + 2 },
	});
	return true;
}

async function wikiLinkCompletions(
	context: CompletionContext,
): Promise<CompletionResult | null> {
	const match = context.matchBefore(/!?\[\[[^\]\n]*/);
	if (!match) return null;
	const asEmbed = match.text.startsWith("![[");
	const query = match.text.slice(asEmbed ? 3 : 2).trim();
	const results = await suggestWikiLinkItems({
		query,
		embedOnly: asEmbed,
		limit: COMPLETION_LIMIT,
	});
	if (context.aborted) return null;
	const opening = asEmbed ? "![[" : "[[";
	const options = results.map((item): WikiLinkCompletion => {
		const meta: WikiLinkCompletionMeta = {
			opening,
			insertText: item.insertText,
			isHeading: item.kind === "heading",
		};
		return {
			label: item.title,
			detail: item.kind === "heading" ? `#${item.slug}` : item.path,
			apply: wikiLinkApply(meta),
			type: asEmbed ? "keyword" : "text",
			boost: item.title ? 1 : 0,
			[WIKI_LINK_COMPLETION]: meta,
		};
	});
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
			detail: item.insertText,
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

export function acceptWikiLinkCompletion(cause: "tab" | "enter") {
	return (view: EditorView) => {
		const completion = selectedCompletion(view.state);
		if (isWikiLinkCompletion(completion)) {
			const meta = completion[WIKI_LINK_COMPLETION];
			const match = view.state.doc
				.sliceString(0, view.state.selection.main.head)
				.match(/!?\[\[[^\]\n]*$/);
			if (!match) return false;
			const from = view.state.selection.main.head - match[0].length;
			applyWikiLinkCompletion({
				view,
				completion,
				from,
				to: view.state.selection.main.head,
				opening: meta.opening,
				insertText: meta.insertText,
				closeLink: cause === "enter" || meta.isHeading,
			});
			return true;
		}
		if (completion) return false;
		if (cause === "enter") return closeOpenWikiLink(view);
		return false;
	};
}
