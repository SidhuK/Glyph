import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, type PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Selection, Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import {
	getCodeBlockPreviewId,
	hasEnabledCodeBlockPreviews,
	hashPreviewSource,
	isCodeBlockPreviewEnabled,
	isCodeBlockPreviewRefresh,
	remapCodeBlockPreviews,
} from "./codeBlockPreviewSession";

export function selectionTouchesNode(
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

export function selectCodeBlockSource(
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

export interface CodeBlockPreviewWidgetContext {
	view: EditorView;
	pos: number;
	nodeSize: number;
	source: string;
	language: string | null;
	editable: boolean;
	selectSource: () => void;
}

export interface CodeBlockPreviewExtensionOptions {
	name: string;
	pluginKey: PluginKey<CodeBlockPreviewPluginState>;
	hiddenClass: string;
	widgetKeyPrefix: string;
	matchLanguage: (language: string | null) => boolean;
	getSource?: (node: ProseMirrorNode) => string;
	createWidget: (context: CodeBlockPreviewWidgetContext) => HTMLElement;
	destroyWidget?: (element: HTMLElement) => void;
	shouldRefresh?: (
		transaction: Transaction,
		value: CodeBlockPreviewPluginState,
	) => boolean;
}

export interface CodeBlockPreviewPluginState {
	decorations: DecorationSet;
	editable: boolean;
	refreshKey: number;
}

function buildCodeBlockPreviewDecorations(
	view: EditorView,
	doc: ProseMirrorNode,
	selection: Selection,
	refreshKey: number,
	editable: boolean,
	options: Pick<
		CodeBlockPreviewExtensionOptions,
		| "hiddenClass"
		| "widgetKeyPrefix"
		| "matchLanguage"
		| "getSource"
		| "createWidget"
		| "destroyWidget"
	>,
): DecorationSet {
	const decorations: Decoration[] = [];

	doc.descendants((node, pos) => {
		if (node.type.name !== "codeBlock") return;

		const language =
			typeof node.attrs.language === "string" ? node.attrs.language : null;
		if (!options.matchLanguage(language)) return;

		const to = pos + node.nodeSize;
		const shouldShowSource =
			editable &&
			(!isCodeBlockPreviewEnabled(view, pos) ||
				selectionTouchesNode(selection, pos, to));
		if (shouldShowSource) return;

		const source = options.getSource
			? options.getSource(node)
			: (node.textContent ?? "");
		const previewKey = editable
			? getCodeBlockPreviewId(view, pos)
			: `read-${pos}`;
		if (!previewKey) return;

		decorations.push(
			Decoration.node(pos, to, {
				class: options.hiddenClass,
			}),
		);

		decorations.push(
			Decoration.widget(
				to,
				(view) =>
					options.createWidget({
						view,
						pos,
						nodeSize: node.nodeSize,
						source,
						language,
						editable,
						selectSource: () => {
							if (!editable) return;
							selectCodeBlockSource(view, pos, node.nodeSize);
						},
					}),
				{
					side: 1,
					ignoreSelection: true,
					key: `${options.widgetKeyPrefix}-${previewKey}-${hashPreviewSource(source)}-${refreshKey}-${editable ? "edit" : "read"}`,
					destroy: (node) => {
						if (node instanceof HTMLElement) {
							options.destroyWidget?.(node);
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

export {
	clearCodeBlockPreviews,
	CODE_BLOCK_PREVIEW_REFRESH_META,
	enableCodeBlockPreviewAt,
	hasEnabledCodeBlockPreviews,
} from "./codeBlockPreviewSession";

export function createCodeBlockPreviewExtension(
	options: CodeBlockPreviewExtensionOptions,
) {
	return Extension.create({
		name: options.name,
		addProseMirrorPlugins() {
			const editor = this.editor;
			const getEditable = () => editor.isEditable;

			return [
				new Plugin<CodeBlockPreviewPluginState>({
					key: options.pluginKey,
					state: {
						init: (_config, state) => {
							const editable = getEditable();
							return {
								editable,
								refreshKey: 0,
								decorations: buildCodeBlockPreviewDecorations(
									editor.view,
									state.doc,
									state.selection,
									0,
									editable,
									options,
								),
							};
						},
						apply(transaction, value) {
							remapCodeBlockPreviews(editor.view, transaction);
							const editable = getEditable();
							const editableChanged = editable !== value.editable;
							// forceRecreate bumps widget keys so mounted previews are
							// rebuilt from scratch (e.g. Mermaid cache invalidation).
							// Plain refresh metas (enable preview, note switch) only
							// rebuild decorations; existing widget DOM is reused.
							const forceRecreate =
								options.shouldRefresh?.(transaction, value) ?? false;
							const shouldRebuild =
								forceRecreate || isCodeBlockPreviewRefresh(transaction);
							const refreshKey =
								forceRecreate || editableChanged
									? value.refreshKey + 1
									: value.refreshKey;

							if (
								!transaction.docChanged &&
								!transaction.selectionSet &&
								!shouldRebuild &&
								!editableChanged
							) {
								return value;
							}

							if (
								editable &&
								!hasEnabledCodeBlockPreviews(editor.view) &&
								!shouldRebuild &&
								!editableChanged
							) {
								return value;
							}

							return {
								editable,
								refreshKey,
								decorations: buildCodeBlockPreviewDecorations(
									editor.view,
									transaction.doc,
									transaction.selection,
									refreshKey,
									editable,
									options,
								),
							};
						},
					},
					props: {
						decorations(state) {
							const pluginState = options.pluginKey.getState(state);
							return pluginState?.decorations ?? DecorationSet.empty;
						},
					},
				}),
			];
		},
	});
}
