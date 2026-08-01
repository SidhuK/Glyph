import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { type ExternalLinkPreview, invoke } from "../../../lib/tauri";

interface LinkPreviewState {
	previews: ReadonlyMap<string, ExternalLinkPreview | null>;
	decorations: DecorationSet;
}

interface ExternalLink {
	from: number;
	to: number;
	href: string;
	label: string;
}

interface PreviewUpdate {
	href: string;
	preview: ExternalLinkPreview | null;
}

const EXTERNAL_LINK_PREVIEW_KEY = new PluginKey<LinkPreviewState>(
	"external-link-previews",
);
const PREVIEW_UPDATE_META = "external-link-preview-update";

function externalUrl(href: string): URL | null {
	try {
		const url = new URL(href);
		return url.protocol === "http:" || url.protocol === "https:" ? url : null;
	} catch {
		return null;
	}
}

function singleExternalLink(
	node: ProseMirrorNode,
	pos: number,
): ExternalLink | null {
	if (!node.isTextblock || node.childCount !== 1) return null;
	const child = node.firstChild;
	if (!child?.isText || !child.text?.trim()) return null;
	const link = child.marks.find((mark) => mark.type.name === "link");
	const href =
		typeof link?.attrs.href === "string" ? link.attrs.href.trim() : "";
	if (!externalUrl(href)) return null;
	return {
		from: pos + 1,
		to: pos + 1 + child.nodeSize,
		href,
		label: child.text.trim(),
	};
}

function externalLinksInDocument(doc: ProseMirrorNode): ExternalLink[] {
	const links: ExternalLink[] = [];
	doc.descendants((node, pos) => {
		const link = singleExternalLink(node, pos);
		if (link) links.push(link);
	});
	return links;
}

function isExternalLinkPreview(value: unknown): value is ExternalLinkPreview {
	if (!value || typeof value !== "object") return false;
	return (
		"title" in value &&
		typeof value.title === "string" &&
		"site_name" in value &&
		typeof value.site_name === "string"
	);
}

function isPreviewUpdate(value: unknown): value is PreviewUpdate {
	if (!value || typeof value !== "object") return false;
	if (!("href" in value) || !("preview" in value)) return false;
	return (
		typeof value.href === "string" &&
		(value.preview === null || isExternalLinkPreview(value.preview))
	);
}

function previewDecoration(
	link: ExternalLink,
	preview: ExternalLinkPreview | null,
): Decoration {
	const url = externalUrl(link.href);
	const siteName = preview?.site_name || url?.hostname || link.href;
	const title = preview?.title || link.label;
	const mediaDataUrl = preview?.image_data_url ?? preview?.favicon_data_url;
	const style = [
		mediaDataUrl ? `--external-link-preview-media: url("${mediaDataUrl}")` : "",
		preview?.accent_color
			? `--external-link-preview-accent: ${preview.accent_color}`
			: "",
	]
		.filter(Boolean)
		.join(";");
	return Decoration.inline(
		link.from,
		link.to,
		{
			"aria-label": title,
			class: "externalLinkPreviewCard",
			"data-link-preview-has-accent": preview?.accent_color ? "true" : "false",
			"data-link-preview-has-media": mediaDataUrl ? "true" : "false",
			"data-link-preview-light-accent": preview?.accent_is_light
				? "true"
				: "false",
			"data-link-preview-site": siteName,
			"data-link-preview-title": title,
			style,
		},
		{ href: link.href },
	);
}

function previewDecorations(
	doc: ProseMirrorNode,
	previews: ReadonlyMap<string, ExternalLinkPreview | null>,
): DecorationSet {
	return DecorationSet.create(
		doc,
		externalLinksInDocument(doc).map((link) =>
			previewDecoration(link, previews.get(link.href) ?? null),
		),
	);
}

function changedTextblocks(transaction: Transaction): Array<{
	node: ProseMirrorNode;
	pos: number;
}> {
	const blocks = new Map<number, ProseMirrorNode>();
	transaction.mapping.maps.forEach((stepMap, index) => {
		const remainingMaps = transaction.mapping.slice(index + 1);
		stepMap.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
			const from = Math.max(0, remainingMaps.map(newStart, -1) - 1);
			const to = Math.min(
				transaction.doc.content.size,
				Math.max(from + 1, remainingMaps.map(newEnd, 1) + 1),
			);
			transaction.doc.nodesBetween(from, to, (node, pos) => {
				if (!node.isTextblock) return true;
				blocks.set(pos, node);
				return false;
			});
		});
	});
	return [...blocks].map(([pos, node]) => ({ node, pos }));
}

function mapPreviewDecorations(
	transaction: Transaction,
	decorations: DecorationSet,
	previews: ReadonlyMap<string, ExternalLinkPreview | null>,
): DecorationSet {
	let mapped = decorations.map(transaction.mapping, transaction.doc);
	const additions: Decoration[] = [];
	const removals: Decoration[] = [];
	for (const { node, pos } of changedTextblocks(transaction)) {
		removals.push(...mapped.find(pos + 1, pos + node.content.size));
		const link = singleExternalLink(node, pos);
		if (link)
			additions.push(previewDecoration(link, previews.get(link.href) ?? null));
	}
	if (removals.length > 0) mapped = mapped.remove(removals);
	return additions.length > 0 ? mapped.add(transaction.doc, additions) : mapped;
}

function replacePreviewDecorations(
	doc: ProseMirrorNode,
	decorations: DecorationSet,
	href: string,
	preview: ExternalLinkPreview | null,
): DecorationSet {
	const existing = decorations
		.find()
		.filter((decoration) => decoration.spec.href === href);
	if (existing.length === 0) return decorations;
	const replacements = existing.map((decoration) =>
		previewDecoration(
			{
				from: decoration.from,
				to: decoration.to,
				href,
				label: doc.textBetween(decoration.from, decoration.to).trim(),
			},
			preview,
		),
	);
	return decorations.remove(existing).add(doc, replacements);
}

export const ExternalLinkPreviews = Extension.create({
	name: "external-link-previews",
	addProseMirrorPlugins() {
		return [
			new Plugin<LinkPreviewState>({
				key: EXTERNAL_LINK_PREVIEW_KEY,
				state: {
					init: (_, state) => {
						const previews = new Map();
						return {
							previews,
							decorations: previewDecorations(state.doc, previews),
						};
					},
					apply(transaction, value) {
						let decorations = transaction.docChanged
							? mapPreviewDecorations(
									transaction,
									value.decorations,
									value.previews,
								)
							: value.decorations;
						const update = transaction.getMeta(PREVIEW_UPDATE_META);
						if (!isPreviewUpdate(update)) {
							return decorations === value.decorations
								? value
								: { ...value, decorations };
						}
						const previews = new Map(value.previews);
						previews.set(update.href, update.preview);
						decorations = replacePreviewDecorations(
							transaction.doc,
							decorations,
							update.href,
							update.preview,
						);
						return { previews, decorations };
					},
				},
				props: {
					decorations(state) {
						return (
							EXTERNAL_LINK_PREVIEW_KEY.getState(state)?.decorations ??
							DecorationSet.empty
						);
					},
				},
				view(editorView) {
					const requested = new Set<string>();
					let active = true;
					const requestPreviews = () => {
						const state = EXTERNAL_LINK_PREVIEW_KEY.getState(editorView.state);
						if (!state) return;
						for (const decoration of state.decorations.find()) {
							const href = decoration.spec.href;
							if (
								typeof href !== "string" ||
								state.previews.has(href) ||
								requested.has(href)
							) {
								continue;
							}
							requested.add(href);
							void invoke("external_link_preview", { url: href })
								.then((preview) => {
									if (!active) return;
									editorView.dispatch(
										editorView.state.tr.setMeta(PREVIEW_UPDATE_META, {
											href,
											preview,
										} satisfies PreviewUpdate),
									);
								})
								.catch(() => {
									if (!active) return;
									editorView.dispatch(
										editorView.state.tr.setMeta(PREVIEW_UPDATE_META, {
											href,
											preview: null,
										} satisfies PreviewUpdate),
									);
								});
						}
					};
					requestPreviews();
					return {
						update(view, previousState) {
							if (view.state.doc !== previousState.doc) requestPreviews();
						},
						destroy() {
							active = false;
						},
					};
				},
			}),
		];
	},
});
