import { PluginKey } from "@tiptap/pm/state";
import {
	isHtmlEmbedCodeBlockLanguage,
	stripHtmlEmbedRawSentinel,
} from "../../../lib/htmlEmbed";
import {
	createLazyCodeBlockPreviewWidget,
	destroyLazyCodeBlockPreviewWidget,
} from "./codeBlockPreviewHydration";
import { createCodeBlockPreviewExtension } from "./codeBlockPreviewPlugin";
import { createHtmlEmbedWidget } from "./htmlEmbed/sandbox";

const htmlEmbedPreviewPluginKey = new PluginKey("html-embed-preview");

export const HtmlEmbedPreview = createCodeBlockPreviewExtension({
	name: "html-embed-preview",
	pluginKey: htmlEmbedPreviewPluginKey,
	hiddenClass: "htmlEmbedCodeBlockHiddenInPreview",
	widgetKeyPrefix: "html-embed",
	matchLanguage: (language) => isHtmlEmbedCodeBlockLanguage(language) !== null,
	getSource: (node) => stripHtmlEmbedRawSentinel(node.textContent ?? ""),
	createWidget: ({ source, language, editable, selectSource }) => {
		const kind = isHtmlEmbedCodeBlockLanguage(language);
		if (!kind) {
			return document.createElement("div");
		}

		return createLazyCodeBlockPreviewWidget({
			placeholderClassName: "htmlEmbedWidget htmlEmbedPlaceholder",
			frameClassName: "htmlEmbedFrame",
			hydrate: () =>
				createHtmlEmbedWidget({
					source,
					kind,
					editable,
					onEditCode: selectSource,
				}),
		});
	},
	destroyWidget: destroyLazyCodeBlockPreviewWidget,
});
