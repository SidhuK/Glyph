import { type Editor, Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
	type TOCHeading,
	extractHeadingsFromDoc,
	findScrollParent,
	getHeadingElement,
	isSameHeadingList,
	updateHeadingsFromTransaction,
} from "../hooks/useTableOfContents";
import { INLINE_TOC_EDITOR_MARKER } from "../markdown/inlineTocMarkdown";

const INLINE_TOC_MARKER = INLINE_TOC_EDITOR_MARKER;

interface InlineTableOfContentsPluginState {
	decorations: DecorationSet;
	headings: TOCHeading[];
	markerSignature: string;
	signature: string;
}

function isInlineTocNode(node: ProseMirrorNode) {
	return (
		node.type.name === "paragraph" &&
		node.textContent.trim().toLowerCase() === INLINE_TOC_MARKER
	);
}

function getInlineTocMarkerSignature(doc: ProseMirrorNode) {
	const parts: string[] = [];
	doc.descendants((node, pos) => {
		if (isInlineTocNode(node)) parts.push(`toc:${pos}:${node.nodeSize}`);
	});
	return parts.join("|");
}

function getInlineTocSignature(
	markerSignature: string,
	headings: readonly TOCHeading[],
) {
	if (!markerSignature) return "";
	return [
		markerSignature,
		...headings.map(
			(heading) => `${heading.pos}:${heading.level}:${heading.text}`,
		),
	].join("|");
}

function scrollToHeading(editor: Editor, heading: TOCHeading) {
	editor.commands.expandHeadingAncestors(heading.pos);
	window.requestAnimationFrame(() => {
		const dom = getHeadingElement(editor, heading);
		if (!dom) return;
		const scrollContainer = findScrollParent(dom);
		if (scrollContainer) {
			const containerRect = scrollContainer.getBoundingClientRect();
			const headingRect = dom.getBoundingClientRect();
			const offset =
				headingRect.top - containerRect.top + scrollContainer.scrollTop - 20;
			scrollContainer.scrollTo({ top: offset, behavior: "smooth" });
			return;
		}
		dom.scrollIntoView({ behavior: "smooth", block: "start" });
	});
}

function findInlineTocMarkerRange(doc: ProseMirrorNode, preferredPos: number) {
	let closestRange: { from: number; to: number } | null = null;
	let closestDistance = Number.POSITIVE_INFINITY;
	doc.descendants((node, pos) => {
		if (!isInlineTocNode(node)) return;
		const distance = Math.abs(pos - preferredPos);
		if (distance >= closestDistance) return;
		closestDistance = distance;
		closestRange = { from: pos, to: pos + node.nodeSize };
	});
	return closestRange;
}

function createInlineTocWidget(
	editor: Editor,
	headings: readonly TOCHeading[],
	markerPos: number,
) {
	const root = document.createElement("nav");
	root.className = "inlineTocWidget";
	root.contentEditable = "false";
	root.setAttribute("aria-label", "Table of contents");

	const header = document.createElement("div");
	header.className = "inlineTocHeader";

	const title = document.createElement("div");
	title.className = "inlineTocTitle";
	title.textContent = "Table of contents";

	const removeButton = document.createElement("button");
	removeButton.type = "button";
	removeButton.className = "inlineTocRemoveBtn";
	removeButton.textContent = "×";
	removeButton.title = "Remove table of contents";
	removeButton.setAttribute("aria-label", "Remove table of contents");
	const stopButtonEvent = (event: Event) => {
		event.preventDefault();
		event.stopPropagation();
	};
	removeButton.addEventListener("pointerdown", stopButtonEvent);
	removeButton.addEventListener("mousedown", stopButtonEvent);

	let removePending = false;
	removeButton.addEventListener("click", async (event) => {
		stopButtonEvent(event);
		if (removePending) return;
		removePending = true;
		removeButton.disabled = true;
		let confirmed = false;
		try {
			const { confirm } = await import("@tauri-apps/plugin-dialog");
			confirmed = await confirm(
				"Remove this table of contents from the note?",
				{
					title: "Remove table of contents",
					okLabel: "Remove",
					cancelLabel: "Cancel",
				},
			);
		} finally {
			removePending = false;
			removeButton.disabled = false;
		}
		if (!confirmed) return;
		let currentWidgetPos = markerPos;
		try {
			currentWidgetPos = editor.view.posAtDOM(root, 0);
		} catch {
			currentWidgetPos = markerPos;
		}
		const markerRange = findInlineTocMarkerRange(
			editor.state.doc,
			currentWidgetPos,
		);
		if (!markerRange) return;
		editor.chain().focus().deleteRange(markerRange).run();
	});

	header.append(title, removeButton);
	root.append(header);

	if (!headings.length) {
		const empty = document.createElement("div");
		empty.className = "inlineTocEmpty";
		empty.textContent = "No headings";
		root.append(empty);
		return root;
	}

	const list = document.createElement("div");
	list.className = "inlineTocItems";
	for (const heading of headings) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "inlineTocItem";
		button.dataset.level = String(heading.level);
		button.textContent = heading.text;
		button.title = heading.text;
		button.addEventListener("mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			scrollToHeading(editor, heading);
		});
		list.append(button);
	}
	root.append(list);
	return root;
}

function buildInlineTocDecorations(
	doc: ProseMirrorNode,
	editor: Editor,
	headings: readonly TOCHeading[],
): DecorationSet {
	const decorations: Decoration[] = [];

	doc.descendants((node, pos) => {
		if (!isInlineTocNode(node)) return;
		decorations.push(
			Decoration.node(pos, pos + node.nodeSize, {
				class: "inlineTocMarker",
			}),
			Decoration.widget(
				pos + node.nodeSize,
				() => createInlineTocWidget(editor, headings, pos),
				{
					side: 1,
					ignoreSelection: true,
					key: `inline-toc-${pos}-${headings
						.map((h) => `${h.pos}:${h.level}:${h.text}`)
						.join("|")}`,
					stopEvent: (event) =>
						event.target instanceof Element &&
						event.target.closest(".inlineTocWidget") !== null,
				},
			),
		);
	});

	return decorations.length
		? DecorationSet.create(doc, decorations)
		: DecorationSet.empty;
}

const inlineTableOfContentsPluginKey =
	new PluginKey<InlineTableOfContentsPluginState>("inline-table-of-contents");

export const InlineTableOfContents = Extension.create({
	name: "inline-table-of-contents",
	addProseMirrorPlugins() {
		const editor = this.editor;
		return [
			new Plugin<InlineTableOfContentsPluginState>({
				key: inlineTableOfContentsPluginKey,
				state: {
					init: (_config, state) => {
						const markerSignature = getInlineTocMarkerSignature(state.doc);
						const headings = markerSignature
							? extractHeadingsFromDoc(state.doc)
							: [];
						return {
							headings,
							markerSignature,
							signature: getInlineTocSignature(markerSignature, headings),
							decorations: markerSignature
								? buildInlineTocDecorations(state.doc, editor, headings)
								: DecorationSet.empty,
						};
					},
					apply: (transaction, value) => {
						if (!transaction.docChanged) {
							return {
								...value,
								decorations: value.decorations.map(
									transaction.mapping,
									transaction.doc,
								),
							};
						}

						const markerSignature = getInlineTocMarkerSignature(
							transaction.doc,
						);
						if (!markerSignature) {
							return {
								headings: [],
								markerSignature,
								signature: "",
								decorations: DecorationSet.empty,
							};
						}

						const headings = value.markerSignature
							? updateHeadingsFromTransaction(value.headings, transaction)
							: extractHeadingsFromDoc(transaction.doc);
						const signature = getInlineTocSignature(markerSignature, headings);
						if (
							signature === value.signature &&
							isSameHeadingList(value.headings, headings)
						) {
							return {
								...value,
								headings,
								markerSignature,
								decorations: value.decorations.map(
									transaction.mapping,
									transaction.doc,
								),
							};
						}

						return {
							headings,
							markerSignature,
							signature,
							decorations: buildInlineTocDecorations(
								transaction.doc,
								editor,
								headings,
							),
						};
					},
				},
				props: {
					decorations(state) {
						return (
							inlineTableOfContentsPluginKey.getState(state)?.decorations ??
							DecorationSet.empty
						);
					},
				},
			}),
		];
	},
});
