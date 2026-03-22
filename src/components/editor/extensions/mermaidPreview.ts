import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
	extractMermaidErrorMessage,
	isMermaidCodeBlockLanguage,
	renderMermaidDiagram,
} from "../../../lib/mermaid";

interface MermaidPreviewPluginState {
	activePreviewPos: number | null;
	refreshKey: number;
	richPreviewHeight: number;
}

const MERMAID_RENDER_DELAY_MS = 240;
const MERMAID_PREVIEW_SPACER_PADDING = 28;

const mermaidPreviewPluginKey = new PluginKey<MermaidPreviewPluginState>(
	"mermaid-preview",
);

type MermaidPreviewMeta =
	| { type: "set-active"; pos: number | null }
	| { type: "refresh" }
	| { type: "set-rich-height"; height: number };

function buildMermaidPreviewWidget(
	source: string,
	showSourceOnError: boolean,
	refreshKey: number,
) {
	const container = document.createElement("div");
	container.className = "mermaidPreviewWidget";
	container.dataset.refreshKey = String(refreshKey);

	const canvas = document.createElement("div");
	canvas.className = "mermaidPreviewCanvas";
	canvas.textContent = "Rendering Mermaid preview…";
	container.append(canvas);

	const run = async () => {
		if (!container.isConnected) return;
		try {
			const svg = await renderMermaidDiagram(source);
			if (!container.isConnected) return;
			const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
			const svgElement = doc.documentElement;
			if (svgElement.tagName.toLowerCase() !== "svg") {
				throw new Error("Unable to render Mermaid diagram.");
			}
			const nextSvg = document.importNode(svgElement, true);
			if (!container.isConnected) return;
			container.dataset.state = "ready";
			canvas.replaceChildren(nextSvg);
		} catch (error) {
			if (!container.isConnected) return;
			container.dataset.state = "error";
			canvas.replaceChildren();

			const message = document.createElement("div");
			message.className = "mermaidPreviewError";
			message.textContent = extractMermaidErrorMessage(error);
			canvas.append(message);

			if (showSourceOnError) {
				const sourcePreview = document.createElement("pre");
				sourcePreview.className = "mermaidPreviewSource mono";
				sourcePreview.textContent = source;
				canvas.append(sourcePreview);
			}
		}
	};

	// Delay rendering slightly so the widget can mount before Mermaid measures it.
	window.setTimeout(() => {
		void run();
	}, MERMAID_RENDER_DELAY_MS);

	return container;
}

function buildMermaidPreviewSpacer(height: number) {
	const spacer = document.createElement("div");
	spacer.className = "mermaidPreviewSpacer";
	spacer.style.height = `${height}px`;
	spacer.setAttribute("aria-hidden", "true");
	return spacer;
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		mermaidPreview: {
			setActiveMermaidPreview: (pos: number | null) => ReturnType;
			setRichMermaidPreviewHeight: (height: number) => ReturnType;
			refreshMermaidPreviews: () => ReturnType;
		};
	}
}

export const MermaidPreview = Extension.create({
	name: "mermaid-preview",
	addCommands() {
		return {
			setActiveMermaidPreview:
				(pos: number | null) =>
				({ state, dispatch }) => {
					const current = mermaidPreviewPluginKey.getState(state);
					if ((current?.activePreviewPos ?? null) === pos) {
						return true;
					}
					dispatch?.(
						state.tr.setMeta(mermaidPreviewPluginKey, {
							type: "set-active",
							pos,
						} satisfies MermaidPreviewMeta),
					);
					return true;
				},
			setRichMermaidPreviewHeight:
				(height: number) =>
				({ state, dispatch }) => {
					const current = mermaidPreviewPluginKey.getState(state);
					if ((current?.richPreviewHeight ?? 0) === height) {
						return true;
					}
					dispatch?.(
						state.tr.setMeta(mermaidPreviewPluginKey, {
							type: "set-rich-height",
							height,
						} satisfies MermaidPreviewMeta),
					);
					return true;
				},
			refreshMermaidPreviews:
				() =>
				({ state, dispatch }) => {
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
		return [
			new Plugin<MermaidPreviewPluginState>({
				key: mermaidPreviewPluginKey,
				state: {
					init: () => ({
						activePreviewPos: null,
						refreshKey: 0,
						richPreviewHeight: 0,
					}),
					apply(transaction, value) {
						const mappedActivePreviewPos =
							value.activePreviewPos == null
								? null
								: (() => {
										const mapped = transaction.mapping.map(
											value.activePreviewPos,
										);
										const { deleted } = transaction.mapping.mapResult(
											value.activePreviewPos,
										);
										if (deleted) return null;
										if (mapped < 0 || mapped > transaction.doc.content.size) {
											return null;
										}
										const node = transaction.doc.nodeAt(mapped);
										const language =
											typeof node?.attrs.language === "string"
												? node.attrs.language
												: null;
										if (
											node?.type.name !== "codeBlock" ||
											!isMermaidCodeBlockLanguage(language)
										) {
											return null;
										}
										return mapped;
									})();
						const nextValue = {
							...value,
							activePreviewPos: mappedActivePreviewPos,
						};
						const meta = transaction.getMeta(mermaidPreviewPluginKey) as
							| MermaidPreviewMeta
							| undefined;
						if (!meta) return nextValue;
						if (meta.type === "set-active") {
							return {
								...nextValue,
								activePreviewPos: meta.pos,
							};
						}
						if (meta.type === "set-rich-height") {
							return {
								...nextValue,
								richPreviewHeight: meta.height,
							};
						}
						return {
							...nextValue,
							refreshKey: value.refreshKey + 1,
						};
					},
				},
				props: {
					decorations(state) {
						const pluginState = mermaidPreviewPluginKey.getState(state);
						if (!pluginState) return null;

						const decorations: Decoration[] = [];
						const editable = editor.isEditable;

						state.doc.descendants((node, pos) => {
							if (node.type.name !== "codeBlock") return;

							const language =
								typeof node.attrs.language === "string"
									? node.attrs.language
									: null;
							if (!isMermaidCodeBlockLanguage(language)) return;

							const isVisiblePreview =
								!editable || pluginState.activePreviewPos === pos;
							if (!isVisiblePreview) return;

							if (editable) {
								if (pluginState.richPreviewHeight <= 0) return;
								decorations.push(
									Decoration.widget(
										pos + node.nodeSize,
										() =>
											buildMermaidPreviewSpacer(
												pluginState.richPreviewHeight +
													MERMAID_PREVIEW_SPACER_PADDING,
											),
										{
											side: 1,
											ignoreSelection: true,
											key: `mermaid-preview-spacer-${pos}`,
										},
									),
								);
								return;
							}

							decorations.push(
								Decoration.node(pos, pos + node.nodeSize, {
									class: "mermaidCodeBlockHiddenInPreview",
								}),
							);

							decorations.push(
								Decoration.widget(
									pos + node.nodeSize,
									() =>
										buildMermaidPreviewWidget(
											node.textContent ?? "",
											!editable,
											pluginState.refreshKey,
										),
									{
										side: 1,
										ignoreSelection: true,
										key: `mermaid-preview-widget-${pos}-${pluginState.refreshKey}`,
									},
								),
							);
						});

						return decorations.length
							? DecorationSet.create(state.doc, decorations)
							: null;
					},
				},
			}),
		];
	},
});
