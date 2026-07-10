import { PluginKey } from "@tiptap/pm/state";
import { i18n } from "../../../i18n";
import { isMermaidCodeBlockLanguage } from "../../../lib/mermaid";
import { appendEditCodeControls } from "./codeBlockPreviewControls";
import {
	createLazyCodeBlockPreviewWidget,
	destroyLazyCodeBlockPreviewWidget,
} from "./codeBlockPreviewHydration";
import { createCodeBlockPreviewExtension } from "./codeBlockPreviewPlugin";
import {
	createMermaidCanvas,
	createMermaidErrorCanvas,
} from "./mermaid/canvas";
import {
	clearMermaidRenderCache,
	renderMermaidCanvasSvg,
} from "./mermaid/renderer";

const mermaidPreviewPluginKey = new PluginKey("mermaid-preview");

type MermaidPreviewMeta = { type: "refresh" };

function buildMermaidCanvasWidget({
	editable,
	source,
	selectSource,
}: {
	editable: boolean;
	source: string;
	selectSource: () => void;
}) {
	const result = renderMermaidCanvasSvg(source);
	if (!result.ok) {
		const element = createMermaidErrorCanvas(result.message);
		if (!editable) return { element, destroy: () => {} };

		const frame = element.querySelector(".mermaidCanvasFrame");
		if (frame instanceof HTMLElement) {
			appendEditCodeControls(frame, {
				label: i18n.t("editor:codeBlock.editMermaid"),
				onEditCode: selectSource,
			});
		}
		return { element, destroy: () => {} };
	}

	return createMermaidCanvas({
		svgHtml: result.svgHtml,
		editMode: editable,
		onEditCode: selectSource,
	});
}

export const MermaidPreview = createCodeBlockPreviewExtension({
	name: "mermaid-preview",
	pluginKey: mermaidPreviewPluginKey,
	hiddenClass: "mermaidCodeBlockHiddenInPreview",
	widgetKeyPrefix: "mermaid-canvas",
	matchLanguage: (language) => isMermaidCodeBlockLanguage(language),
	createWidget: ({ source, editable, selectSource }) =>
		createLazyCodeBlockPreviewWidget({
			placeholderClassName: "mermaidCanvasWidget mermaidCanvasPlaceholder",
			frameClassName: "mermaidCanvasFrame",
			hydrate: () =>
				buildMermaidCanvasWidget({
					editable,
					source,
					selectSource,
				}),
		}),
	destroyWidget: destroyLazyCodeBlockPreviewWidget,
	shouldRefresh: (transaction) => {
		const meta = transaction.getMeta(mermaidPreviewPluginKey) as
			| MermaidPreviewMeta
			| undefined;
		return meta?.type === "refresh";
	},
}).extend({
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
});

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		mermaidPreview: {
			refreshMermaidPreviews: () => ReturnType;
		};
	}
}
