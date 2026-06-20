import { EditorView } from "@codemirror/view";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
	dispatchMarkdownLinkClick,
	dispatchTagClick,
	dispatchWikiLinkClick,
} from "../markdown/editorEvents";
import { parseWikiLink } from "../markdown/wikiLinkCodec";

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

export function createRawMarkdownEventHandlers(getRelPath: () => string) {
	return {
		mousedown: (event: MouseEvent) => {
			const target = event.target as Element | null;
			if (
				target?.closest(
					".cm-raw-task-checkbox, .cm-raw-wiki-link, .cm-raw-markdown-link, .cm-raw-tag",
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
			if (href.startsWith("http://") || href.startsWith("https://")) {
				void openUrl(href);
				return true;
			}
			dispatchMarkdownLinkClick({ href, sourcePath: getRelPath() });
			return true;
		},
	};
}
