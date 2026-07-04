import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Selection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { stripHtmlEmbedRawSentinel } from "../markdown/htmlEmbedMarkdown";
import {
	type HtmlEmbedKind,
	createHtmlEmbedWidget,
	destroyHtmlEmbedWidget,
	isHtmlEmbedCodeBlockLanguage,
} from "./htmlEmbed/sandbox";

interface HtmlEmbedPreviewPluginState {
	decorations: DecorationSet;
	editable: boolean;
	refreshKey: number;
}

const htmlEmbedPreviewPluginKey = new PluginKey<HtmlEmbedPreviewPluginState>(
	"html-embed-preview",
);

type HtmlEmbedPreviewMeta = { type: "refresh" };

function selectionTouchesNode(
	selection: Selection,
	from: number,
	to: number,
): boolean {
	return selection.ranges.some((range) => {
		const rangeFrom = range.$from.pos;
		const rangeTo = range.$to.pos;
		if (rangeFrom === rangeTo) {
			return rangeFrom > from && rangeFrom < to;
		}
		return rangeFrom < to && rangeTo > from;
	});
}

function selectCodeBlockSource(
	view: EditorView,
	pos: number,
	nodeSize: number,
): void {
	const textStart = pos + 1;
	const textEnd = Math.max(textStart, pos + nodeSize - 1);
	const docSize = view.state.doc.content.size;
	if (textStart > docSize) return;

	const selection = TextSelection.create(
		view.state.doc,
		textStart,
		Math.min(textEnd, docSize),
	);
	view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
	view.focus();
}

function buildHtmlEmbedPreviewDecorations(
	doc: ProseMirrorNode,
	selection: Selection,
	refreshKey: number,
	editable: boolean,
): DecorationSet {
	const decorations: Decoration[] = [];

	doc.descendants((node, pos) => {
		if (node.type.name !== "codeBlock") return;

		const language =
			typeof node.attrs.language === "string" ? node.attrs.language : null;
		const kind = isHtmlEmbedCodeBlockLanguage(language);
		if (!kind) return;

		const to = pos + node.nodeSize;
		const shouldShowSource =
			editable && selectionTouchesNode(selection, pos, to);
		if (shouldShowSource) return;

		const source = stripHtmlEmbedRawSentinel(node.textContent ?? "");

		decorations.push(
			Decoration.node(pos, to, {
				class: "htmlEmbedCodeBlockHiddenInPreview",
			}),
		);

		decorations.push(
			Decoration.widget(
				to,
				(view) =>
					createHtmlEmbedWidget({
						source,
						kind,
						editable,
						onEditCode: () => {
							if (!editable) return;
							selectCodeBlockSource(view, pos, node.nodeSize);
						},
					}),
				{
					side: 1,
					ignoreSelection: true,
					key: `html-embed-${kind}-${pos}-${source}-${refreshKey}-${editable ? "edit" : "read"}`,
					destroy: (node) => {
						if (node instanceof HTMLElement) {
							destroyHtmlEmbedWidget(node);
						}
					},
				},
			),
		);
	});

	return decorations.length
		? DecorationSet.create(doc, decorations)
		: DecorationSet.empty;
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		htmlEmbedPreview: {
			refreshHtmlEmbedPreviews: () => ReturnType;
		};
	}
}

export const HtmlEmbedPreview = Extension.create({
	name: "html-embed-preview",
	addCommands() {
		return {
			refreshHtmlEmbedPreviews:
				() =>
				({ state, dispatch }) => {
					dispatch?.(
						state.tr.setMeta(htmlEmbedPreviewPluginKey, {
							type: "refresh",
						} satisfies HtmlEmbedPreviewMeta),
					);
					return true;
				},
		};
	},
	addProseMirrorPlugins() {
		const editor = this.editor;
		const getEditable = () => editor.isEditable;
		return [
			new Plugin<HtmlEmbedPreviewPluginState>({
				key: htmlEmbedPreviewPluginKey,
				state: {
					init: (_config, state) => {
						const editable = getEditable();
						const refreshKey = 0;
						return {
							editable,
							refreshKey,
							decorations: buildHtmlEmbedPreviewDecorations(
								state.doc,
								state.selection,
								refreshKey,
								editable,
							),
						};
					},
					apply(transaction, value) {
						const editable = getEditable();
						const editableChanged = editable !== value.editable;
						const meta = transaction.getMeta(htmlEmbedPreviewPluginKey) as
							| HtmlEmbedPreviewMeta
							| undefined;
						const refreshKey =
							meta?.type === "refresh" || editableChanged
								? value.refreshKey + 1
								: value.refreshKey;

						if (
							!transaction.docChanged &&
							!transaction.selectionSet &&
							!meta &&
							!editableChanged
						) {
							return value;
						}

						return {
							editable,
							refreshKey,
							decorations: buildHtmlEmbedPreviewDecorations(
								transaction.doc,
								transaction.selection,
								refreshKey,
								editable,
							),
						};
					},
				},
				props: {
					decorations(state) {
						const pluginState = htmlEmbedPreviewPluginKey.getState(state);
						return pluginState?.decorations ?? DecorationSet.empty;
					},
				},
			}),
		];
	},
});

export type { HtmlEmbedKind };
