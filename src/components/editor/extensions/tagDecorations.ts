import { Extension } from "@tiptap/core";
import { Decoration } from "@tiptap/pm/view";
import {
	type TextNodeDecorationContext,
	createIncrementalTextDecorationPlugin,
} from "./incrementalTextDecorations";

const TAG_PATTERN = /(^|[^\w/])#([A-Za-z0-9_][\w/-]*)/g;
const PERSON_PATTERN = /(^|[^A-Za-z0-9_.-])@([A-Za-z0-9_][A-Za-z0-9_-]*)/g;
const TOKEN_SELECTOR = ".tagToken, .personToken";

export function handleTagDecorationMouseDown(event: MouseEvent): boolean {
	const target = event.target instanceof Element ? event.target : null;
	if (!target?.closest(TOKEN_SELECTOR)) return false;
	event.preventDefault();
	return true;
}

function collectTagDecorations(
	{ node, pos }: TextNodeDecorationContext,
	enablePeopleMentions: boolean,
): Decoration[] {
	const decorations: Decoration[] = [];
	const text = node.text;
	if (!text) return decorations;

	TAG_PATTERN.lastIndex = 0;
	for (const match of text.matchAll(TAG_PATTERN)) {
		const leading = match[1] ?? "";
		const tag = match[2] ?? "";
		if (!tag) continue;
		const start = (match.index ?? 0) + leading.length;
		const from = pos + start;
		const to = from + 1 + tag.length;
		decorations.push(
			Decoration.inline(from, to, {
				class: "tagToken",
				"data-tag": tag,
			}),
		);
	}

	if (!enablePeopleMentions) return decorations;

	PERSON_PATTERN.lastIndex = 0;
	for (const match of text.matchAll(PERSON_PATTERN)) {
		const leading = match[1] ?? "";
		const handle = match[2] ?? "";
		if (!handle) continue;
		const start = (match.index ?? 0) + leading.length;
		const from = pos + start;
		const to = from + 1 + handle.length;
		decorations.push(
			Decoration.inline(from, to, {
				class: "personToken",
				"data-handle": handle,
			}),
		);
	}

	return decorations;
}

export const TagDecorations = Extension.create({
	name: "tag-decorations",
	addOptions() {
		return {
			enablePeopleMentions: false,
		};
	},
	addProseMirrorPlugins() {
		const enablePeopleMentions = Boolean(this.options.enablePeopleMentions);
		return [
			createIncrementalTextDecorationPlugin({
				pluginKey: "tag-decorations",
				collectDecorations: (context) =>
					collectTagDecorations(context, enablePeopleMentions),
			}),
		];
	},
});
