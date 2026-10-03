import { Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { i18n } from "../../../i18n";
import { parseCollectionReference, readCollectionReference } from "./collectionReference";

const CollectionEmbedView = lazy(() => import("./CollectionEmbedView"));
const MARKER = /^:::glyph-collection (\{[^\n]*\})\r?\n:::(?:\r?\n|$)/;

function serializeReference(value: unknown): string {
	const reference = readCollectionReference(value);
	if (!reference) throw new Error(i18n.t("editor:collectionEmbed.invalid"));
	return JSON.stringify(reference);
}

function CollectionNodeView(props: NodeViewProps) {
	const { t } = useTranslation("editor");
	const reference = readCollectionReference(props.node.attrs);
	return (
		<NodeViewWrapper className="collectionEmbed" contentEditable={false}>
			{reference ? (
				<Suspense fallback={<p role="status">{t("collectionEmbed.loading")}</p>}>
					<CollectionEmbedView
						reference={reference}
						editable={props.editor.isEditable}
						onChange={props.updateAttributes}
						onRemove={props.deleteNode}
					/>
				</Suspense>
			) : (
				<p role="alert">{t("collectionEmbed.invalid")}</p>
			)}
		</NodeViewWrapper>
	);
}

export const CollectionEmbed = Node.create({
	name: "collectionEmbed",
	group: "block",
	atom: true,
	isolating: true,
	addAttributes() {
		// Only the validated data-glyph-collection payload may supply these attributes.
		return {
			version: { default: 1, parseHTML: () => null },
			databaseId: { default: "", parseHTML: () => null },
			viewId: { default: "", parseHTML: () => null },
		};
	},
	parseHTML() {
		return [
			{
				tag: "div[data-glyph-collection]",
				getAttrs: (element) =>
					parseCollectionReference(element.getAttribute("data-glyph-collection") ?? "") ?? false,
			},
		];
	},
	renderHTML({ node }) {
		return ["div", { "data-glyph-collection": serializeReference(node.attrs) }];
	},
	parseMarkdown(token, helpers) {
		const reference = parseCollectionReference(token.text ?? "");
		if (!reference) throw new Error(i18n.t("editor:collectionEmbed.invalid"));
		return helpers.createNode("collectionEmbed", reference);
	},
	renderMarkdown(node) {
		return `:::glyph-collection ${serializeReference(node.attrs)}\n:::`;
	},
	markdownTokenizer: {
		name: "collectionEmbed",
		level: "block",
		start: ":::glyph-collection ",
		tokenize(source) {
			const match = source.match(MARKER);
			if (!match || !parseCollectionReference(match[1])) return undefined;
			return { type: "collectionEmbed", raw: match[0], text: match[1] };
		},
	},
	addNodeView() {
		return ReactNodeViewRenderer(CollectionNodeView);
	},
});
