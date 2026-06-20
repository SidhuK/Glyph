import { openUrl } from "@tauri-apps/plugin-opener";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { cssEscape } from "../../utils/dom";
import {
	dispatchInternalAnchorClick,
	dispatchMarkdownLinkClick,
	dispatchPersonClick,
	dispatchTagClick,
	dispatchWikiLinkClick,
} from "./markdown/editorEvents";

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
			anchorKind:
				(wikiLink.getAttribute("data-anchor-kind") as
					| "none"
					| "heading"
					| "block") ?? "none",
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
	event.preventDefault();
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
