import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Selection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { isMermaidCodeBlockLanguage } from "../../../lib/mermaid";
import {
	createMermaidCanvas,
	createMermaidErrorCanvas,
} from "./mermaid/canvas";
import {
	clearMermaidRenderCache,
	renderMermaidCanvasSvg,
} from "./mermaid/renderer";

interface MermaidPreviewPluginState {
	decorations: DecorationSet;
	editable: boolean;
	refreshKey: number;
}

const mermaidPreviewPluginKey = new PluginKey<MermaidPreviewPluginState>(
	"mermaid-preview",
);

type MermaidPreviewMeta = { type: "refresh" };

const canvasDestroyCallbacks = new WeakMap<HTMLElement, () => void>();

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

function selectMermaidSource(
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

function buildMermaidCanvasWidget({
	editable,
	nodeSize,
	pos,
	source,
	view,
}: {
	editable: boolean;
	nodeSize: number;
	pos: number;
	source: string;
	view: EditorView;
}) {
	const result = renderMermaidCanvasSvg(source);
	if (!result.ok) {
		const element = createMermaidErrorCanvas(result.message);
		if (!editable) return element;

		const editButton = document.createElement("button");
		editButton.type = "button";
		editButton.className = "mermaidCanvasEditBtn";
		editButton.textContent = "Edit code";
		editButton.title = "Edit Mermaid code";
		editButton.setAttribute("aria-label", "Edit Mermaid code");
		editButton.addEventListener("mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		editButton.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			selectMermaidSource(view, pos, nodeSize);
		});
		const controls = document.createElement("div");
		controls.className = "mermaidCanvasControls";
		controls.append(editButton);
		element.querySelector(".mermaidCanvasFrame")?.append(controls);
		return element;
	}

	const mount = createMermaidCanvas({
		svgHtml: result.svgHtml,
		editMode: editable,
		onEditCode: () => {
			if (!editable) return;
			selectMermaidSource(view, pos, nodeSize);
		},
	});
	canvasDestroyCallbacks.set(mount.element, mount.destroy);
	return mount.element;
}

function buildMermaidPreviewDecorations(
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
		if (!isMermaidCodeBlockLanguage(language)) return;

		const to = pos + node.nodeSize;
		const shouldShowSource =
			editable && selectionTouchesNode(selection, pos, to);
		if (shouldShowSource) return;

		const source = node.textContent ?? "";

		decorations.push(
			Decoration.node(pos, to, {
				class: "mermaidCodeBlockHiddenInPreview",
			}),
		);

		decorations.push(
			Decoration.widget(
				to,
				(view) =>
					buildMermaidCanvasWidget({
						editable,
						nodeSize: node.nodeSize,
						pos,
						source,
						view,
					}),
				{
					side: 1,
					ignoreSelection: true,
					key: `mermaid-canvas-${pos}-${source}-${refreshKey}-${editable ? "edit" : "read"}`,
					destroy: (node) => {
						if (node instanceof HTMLElement) {
							canvasDestroyCallbacks.get(node)?.();
							canvasDestroyCallbacks.delete(node);
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
		mermaidPreview: {
			refreshMermaidPreviews: () => ReturnType;
		};
	}
}

export const MermaidPreview = Extension.create({
	name: "mermaid-preview",
	addCommands() {
		return {
			refreshMermaidPreviews:
				() =>
				({ state, dispatch }) => {
					clearMermaidRenderCache();
					dispatch?.(
						state.tr.setMeta(mermaidPreviewPluginKey, {
							type: "refresh",
						} satisfies MermaidPreviewMeta),
					);
					return true;
				},
		};
	},
	addProseMirrorPlugins() {
		const editor = this.editor;
		const getEditable = () => editor.isEditable;
		return [
			new Plugin<MermaidPreviewPluginState>({
				key: mermaidPreviewPluginKey,
				state: {
					init: (_config, state) => {
						const editable = getEditable();
						const refreshKey = 0;
						return {
							editable,
							refreshKey,
							decorations: buildMermaidPreviewDecorations(
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
						const meta = transaction.getMeta(mermaidPreviewPluginKey) as
							| MermaidPreviewMeta
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
							decorations: buildMermaidPreviewDecorations(
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
						const pluginState = mermaidPreviewPluginKey.getState(state);
						return pluginState?.decorations ?? DecorationSet.empty;
					},
				},
			}),
		];
	},
});
