import { Node, nodeInputRule } from "@tiptap/core";
import type { MarkdownToken } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { isImageTarget } from "../../../lib/linkSuggestions";
import {
	parseWikiLink,
	wikiLinkAttrsToMarkdown,
} from "../markdown/wikiLinkCodec";
import { NoteTransclusionView } from "../transclusions/NoteTransclusionView";

function parseNoteTransclusion(raw: string) {
	const parsed = parseWikiLink(raw);
	return parsed?.embed && !isImageTarget(parsed.target) ? parsed : null;
}

export const NoteTransclusion = Node.create({
	name: "noteTransclusion",
	group: "block",
	atom: true,
	selectable: true,
	draggable: false,
	markdownTokenName: "noteTransclusion",
	addAttributes() {
		return {
			raw: { default: "" },
			target: { default: "" },
			alias: { default: null },
			embed: { default: true },
			anchorKind: { default: "none" },
			anchor: { default: null },
			unresolved: { default: false },
		};
	},
	parseHTML() {
		return [{ tag: 'div[data-note-transclusion="true"]' }];
	},
	renderHTML({ node }) {
		return [
			"div",
			{
				"data-note-transclusion": "true",
				"data-target": node.attrs.target,
			},
		];
	},
	parseMarkdown(token: MarkdownToken, helpers) {
		const raw = (token.raw ?? "").trim();
		const parsed = parseNoteTransclusion(raw);
		if (!parsed) return helpers.createTextNode(raw || token.text || "");
		return helpers.createNode("noteTransclusion", parsed);
	},
	renderMarkdown(node) {
		return wikiLinkAttrsToMarkdown(node.attrs ?? {});
	},
	markdownTokenizer: {
		name: "noteTransclusion",
		level: "block",
		start(src: string) {
			const match = src.match(/^\s*!\[\[[^\]\n]+\]\]\s*(?:\n|$)/m);
			return match?.index ?? -1;
		},
		tokenize(src: string) {
			const match = src.match(/^\s*(!\[\[[^\]\n]+\]\])\s*(?:\n|$)/);
			if (!match) return undefined;
			const parsed = parseNoteTransclusion(match[1]);
			if (!parsed) return undefined;
			return {
				type: "noteTransclusion",
				raw: match[0],
				text: match[1],
				attributes: parsed,
			};
		},
	},
	addInputRules() {
		return [
			nodeInputRule({
				find: /^(!\[\[[^\]\n]+\]\])$/,
				type: this.type,
				getAttributes: (match) => {
					return parseNoteTransclusion(match[1]) ?? false;
				},
			}),
		];
	},
	addNodeView() {
		return ReactNodeViewRenderer(NoteTransclusionView);
	},
});
