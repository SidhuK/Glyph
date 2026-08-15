import { EditorView } from "@codemirror/view";
import { openUrl } from "@tauri-apps/plugin-opener";
import { i18n } from "../../../i18n";
import { isGlyphDeeplink } from "../../../lib/deeplink";
import { openDeeplink } from "../../../lib/deeplinkOpen";
import { showNativeContextMenu } from "../../../lib/nativeContextMenu";
import {
	dispatchInternalAnchorClick,
	dispatchMarkdownLinkClick,
	dispatchTagClick,
	dispatchWikiLinkClick,
} from "../markdown/editorEvents";
import {
	type FootnoteKind,
	findFootnoteCounterpartOffset,
} from "../markdown/footnote";
import {
	copyWikiLinkMarkdown,
	wikiLinkMarkdownForNote,
} from "../markdown/wikiLinkClipboard";
import { parseWikiLink } from "../markdown/wikiLinkCodec";
import {
	collectBlockIds,
	ensureTrailingBlockId,
	headingTextFromLine,
	parseTrailingBlockId,
} from "../markdown/wikiLinkSlices";

function toggleTask(view: EditorView, target: HTMLElement): boolean {
	const markerPosition = Number(target.dataset.taskMarkerPosition);
	if (!Number.isInteger(markerPosition)) return false;
	const checked = target.dataset.checked === "true";
	view.dispatch({
		changes: {
			from: markerPosition + 1,
			to: markerPosition + 2,
			insert: checked ? " " : "x",
		},
		effects: EditorView.announce.of(
			checked ? "Task marked incomplete" : "Task marked complete",
		),
	});
	view.focus();
	return true;
}

function scrollToRawFootnoteCounterpart(
	view: EditorView,
	id: string,
	fromKind: FootnoteKind,
): boolean {
	const offset = findFootnoteCounterpartOffset(
		view.state.doc.toString(),
		id,
		fromKind,
	);
	if (offset === null) return false;
	view.dispatch({
		selection: { anchor: offset },
		effects: EditorView.scrollIntoView(offset, { y: "center" }),
	});
	view.focus();
	return true;
}

function placeCaretAtEvent(view: EditorView, event: MouseEvent): boolean {
	const offset = view.posAtCoords({ x: event.clientX, y: event.clientY });
	if (offset === null) return false;
	view.dispatch({ selection: { anchor: offset } });
	view.focus();
	return true;
}

export function createRawMarkdownEventHandlers(getRelPath: () => string) {
	return {
		mousedown: (event: MouseEvent) => {
			const target = event.target as Element | null;
			if (
				target?.closest(
					".cm-raw-task-checkbox, .cm-raw-wiki-link, .cm-raw-markdown-link, .cm-raw-tag, .cm-raw-footnote",
				)
			) {
				event.preventDefault();
			}
			return false;
		},
		click: (event: MouseEvent, view: EditorView) => {
			const target = event.target as Element | null;
			const task = target?.closest<HTMLElement>(".cm-raw-task-checkbox");
			if (task) return toggleTask(view, task);

			const footnote = target?.closest<HTMLElement>(".cm-raw-footnote");
			if (footnote?.dataset.footnoteId) {
				const kind = footnote.dataset.footnoteKind === "def" ? "def" : "ref";
				return (
					scrollToRawFootnoteCounterpart(
						view,
						footnote.dataset.footnoteId,
						kind,
					) || placeCaretAtEvent(view, event)
				);
			}

			const wikiLink = target?.closest<HTMLElement>(".cm-raw-wiki-link");
			if (wikiLink) {
				const parsed = parseWikiLink(wikiLink.dataset.rawWikiLink ?? "");
				if (!parsed) return false;
				dispatchWikiLinkClick(parsed);
				return true;
			}

			const tag = target?.closest<HTMLElement>(".cm-raw-tag");
			if (tag?.dataset.rawTag) {
				dispatchTagClick({ tag: tag.dataset.rawTag });
				return true;
			}

			const markdownLink = target?.closest<HTMLElement>(
				".cm-raw-markdown-link",
			);
			const href = markdownLink?.dataset.markdownHref;
			if (!href) return false;
			if (isGlyphDeeplink(href)) {
				void openDeeplink(href);
				return true;
			}
			if (href.startsWith("http://") || href.startsWith("https://")) {
				void openUrl(href);
				return true;
			}
			if (href.startsWith("#")) {
				dispatchInternalAnchorClick({
					anchor: href,
					sourcePath: getRelPath(),
				});
				return true;
			}
			dispatchMarkdownLinkClick({ href, sourcePath: getRelPath() });
			return true;
		},
		contextmenu: (event: MouseEvent, view: EditorView) => {
			const relPath = getRelPath();
			if (!relPath) return false;
			const offset = view.posAtCoords({ x: event.clientX, y: event.clientY });
			if (offset === null) return false;
			const line = view.state.doc.lineAt(offset);
			const heading = headingTextFromLine(line.text);
			const blockId = parseTrailingBlockId(line.text);
			if (!heading && !blockId) return false;
			const existingIds = collectBlockIds(view.state.doc.toString());
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
						const ensured = ensureTrailingBlockId(line.text, existingIds);
						view.dispatch({
							changes: {
								from: line.from,
								to: line.to,
								insert: ensured.line,
							},
						});
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
		},
	};
}
