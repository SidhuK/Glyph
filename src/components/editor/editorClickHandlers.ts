import { openUrl } from "@tauri-apps/plugin-opener";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { i18n } from "../../i18n";
import { isGlyphDeeplink } from "../../lib/deeplink";
import { openDeeplink } from "../../lib/deeplinkOpen";
import { showNativeContextMenu } from "../../lib/nativeContextMenu";
import { cssEscape } from "../../utils/dom";
import {
	dispatchInternalAnchorClick,
	dispatchMarkdownLinkClick,
	dispatchPersonClick,
	dispatchTagClick,
	dispatchWikiLinkClick,
} from "./markdown/editorEvents";
import {
	copyWikiLinkMarkdown,
	wikiLinkMarkdownForNote,
} from "./markdown/wikiLinkClipboard";
import {
	collectBlockIdsFromDoc,
	ensureTrailingBlockId,
	parseTrailingBlockId,
} from "./markdown/wikiLinkSlices";
import type { WikiLinkAnchorKind } from "./markdown/wikiLinkTypes";

function isExpandedMarkdownUrlLink(link: HTMLAnchorElement): boolean {
	const href = link.getAttribute("href")?.trim() ?? "";
	const text = link.textContent?.trim() ?? "";
	if (!href || text !== href) return false;
	const previousText = link.previousSibling?.textContent ?? "";
	const nextText = link.nextSibling?.textContent ?? "";
	return previousText.endsWith("](") && nextText.startsWith(")");
}

function expandMarkdownLinkForEditing(
	view: EditorView,
	link: HTMLAnchorElement,
): boolean {
	const href = link.getAttribute("href")?.trim() ?? "";
	if (!href || href.startsWith("#")) return false;

	const linkText = (link.textContent ?? "").trim() || href;
	const markdown = `[${linkText}](${href})`;
	try {
		const from = view.posAtDOM(link, 0);
		const to = view.posAtDOM(link, link.childNodes.length);
		if (from >= to) return false;

		const hrefStart = from + markdown.lastIndexOf(href);
		const hrefEnd = hrefStart + href.length;
		let tr = view.state.tr.insertText(markdown, from, to);
		try {
			tr = tr.setSelection(TextSelection.create(tr.doc, hrefStart, hrefEnd));
		} catch {
			// Fallback for malformed/mocked docs; the inserted markdown still edits correctly.
		}
		view.dispatch(tr.scrollIntoView());
		view.focus();
		return true;
	} catch {
		return false;
	}
}

function scrollToFootnoteCounterpart(
	view: EditorView,
	source: HTMLElement,
	id: string,
): void {
	const isDefinition = source.classList.contains("footnoteDef");
	const targetClass = isDefinition ? "footnoteRef" : "footnoteDef";
	const selector = `.${targetClass}[data-footnote-id="${cssEscape(id)}"]`;
	const destination = view.dom.querySelector<HTMLElement>(selector);
	if (!destination) return;
	destination.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function handleEditorClick(
	event: MouseEvent,
	view: EditorView,
	relPath: string,
	interactive: boolean,
	editable: boolean,
): boolean {
	const target = event.target instanceof Element ? event.target : null;
	const tagToken = target?.closest(".tagToken") as HTMLElement | null;
	if (tagToken) {
		if (!interactive) {
			event.preventDefault();
			return true;
		}
		event.preventDefault();
		const rawTag =
			tagToken.getAttribute("data-tag") ?? tagToken.textContent ?? "";
		const normalized = rawTag.trim().replace(/^#+/, "");
		if (!normalized) return true;
		dispatchTagClick({ tag: `#${normalized}` });
		return true;
	}

	const personToken = target?.closest(".personToken") as HTMLElement | null;
	if (personToken) {
		if (!interactive) {
			event.preventDefault();
			return true;
		}
		event.preventDefault();
		const rawHandle =
			personToken.getAttribute("data-handle") ?? personToken.textContent ?? "";
		const normalized = rawHandle.trim().replace(/^@+/, "");
		if (!normalized) return true;
		dispatchPersonClick({ handle: `@${normalized}` });
		return true;
	}

	const footnote = target?.closest(
		".footnoteRef, .footnoteDef",
	) as HTMLElement | null;
	if (footnote) {
		event.preventDefault();
		if (!interactive) return true;
		const id = footnote.getAttribute("data-footnote-id");
		if (id) scrollToFootnoteCounterpart(view, footnote, id);
		return true;
	}

	const wikiLink = target?.closest(
		'[data-wikilink="true"]',
	) as HTMLElement | null;
	if (wikiLink) {
		if (!interactive) {
			event.preventDefault();
			return true;
		}
		event.preventDefault();
		dispatchWikiLinkClick({
			raw: wikiLink.getAttribute("data-raw") ?? wikiLink.textContent ?? "",
			target: wikiLink.getAttribute("data-target") ?? "",
			alias: wikiLink.getAttribute("data-alias") || null,
			anchorKind: wikiAnchorKindFromDom(
				wikiLink.getAttribute("data-anchor-kind"),
			),
			anchor: wikiLink.getAttribute("data-anchor") || null,
			unresolved: wikiLink.getAttribute("data-unresolved") === "true",
			embed: wikiLink.getAttribute("data-wikilink-embed") === "true",
		});
		return true;
	}

	const link = target?.closest("a") as HTMLAnchorElement | null;
	if (!link) return false;
	const href = link.getAttribute("href") ?? "";
	if (!href) return false;
	if (!interactive) {
		event.preventDefault();
		return true;
	}
	if (href.startsWith("#")) {
		event.preventDefault();
		dispatchInternalAnchorClick({ anchor: href, sourcePath: relPath });
		return true;
	}
	if (
		target?.closest(".externalLinkPreviewCard") &&
		(href.startsWith("http://") || href.startsWith("https://"))
	) {
		event.preventDefault();
		if (event.metaKey || event.ctrlKey) {
			void openUrl(href);
			return true;
		}
		if (editable && expandMarkdownLinkForEditing(view, link)) return true;
		void openUrl(href);
		return true;
	}
	event.preventDefault();
	if (isGlyphDeeplink(href)) {
		void openDeeplink(href);
		return true;
	}
	if (
		editable &&
		isExpandedMarkdownUrlLink(link) &&
		(href.startsWith("http://") || href.startsWith("https://"))
	) {
		void openUrl(href);
		return true;
	}
	if (editable && expandMarkdownLinkForEditing(view, link)) {
		return true;
	}
	if (href.startsWith("http://") || href.startsWith("https://")) {
		void openUrl(href);
		return true;
	}
	dispatchMarkdownLinkClick({
		href,
		sourcePath: relPath,
	});
	return true;
}

function wikiAnchorKindFromDom(value: string | null): WikiLinkAnchorKind {
	if (value === "heading" || value === "block") return value;
	return "none";
}

export function handleEditorContextMenu(
	event: MouseEvent,
	view: EditorView,
	relPath: string,
	editable: boolean,
): boolean {
	if (!relPath) return false;
	const target = event.target instanceof Element ? event.target : null;
	const heading =
		target?.closest("h1, h2, h3, h4, h5, h6")?.textContent?.trim() || null;
	const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
	if (!coords) return false;
	const $pos = view.state.doc.resolve(coords.pos);
	const block = $pos.parent;
	const blockText = block.isTextblock ? block.textContent : "";
	const blockId = parseTrailingBlockId(blockText);
	if (!heading && !blockId) return false;
	void showNativeContextMenu(event, [
		...(heading
			? [
					{
						label: i18n.t("editor:wikiLink.copyHeadingLink"),
						action: () => {
							void copyWikiLinkMarkdown(
								wikiLinkMarkdownForNote({
									relPath,
									anchorKind: "heading",
									anchor: heading,
								}),
							);
						},
					},
				]
			: []),
		{
			label: i18n.t("editor:wikiLink.copyBlockLink"),
			action: () => {
				if (!block.isTextblock) return;
				if (blockId) {
					void copyWikiLinkMarkdown(
						wikiLinkMarkdownForNote({
							relPath,
							anchorKind: "block",
							anchor: blockId,
						}),
					);
					return;
				}
				if (!editable || !heading) return;
				const existing = collectBlockIdsFromDoc(view.state.doc);
				const ensured = ensureTrailingBlockId(blockText, existing);
				const from = $pos.before($pos.depth) + 1;
				const to = from + block.content.size;
				view.dispatch(
					view.state.tr.insertText(ensured.line, from, to).scrollIntoView(),
				);
				void copyWikiLinkMarkdown(
					wikiLinkMarkdownForNote({
						relPath,
						anchorKind: "block",
						anchor: ensured.id,
					}),
				);
			},
		},
	]);
	return true;
}
