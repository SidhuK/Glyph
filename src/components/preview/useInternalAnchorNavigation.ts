import { useEffect, useRef } from "react";
import type { EditorViewMode } from "../../lib/editorMode";
import type { TOCHeading } from "../editor/hooks/useTableOfContents";
import {
	INTERNAL_ANCHOR_CLICK_EVENT,
	type InternalAnchorClickDetail,
} from "../editor/markdown/editorEvents";
import { resolveAnchorHeading } from "../editor/markdown/headingAnchor";
import { analyzeNoteInfo } from "./noteInfoAnalysis";

interface UseInternalAnchorNavigationArgs {
	relPath: string;
	mode: EditorViewMode;
	getPlainText: () => string;
	tocHeadings: readonly TOCHeading[];
	selectVisibleHeading: (heading: TOCHeading) => void;
}

export function useInternalAnchorNavigation({
	relPath,
	mode,
	getPlainText,
	tocHeadings,
	selectVisibleHeading,
}: UseInternalAnchorNavigationArgs) {
	const tocHeadingsRef = useRef(tocHeadings);
	tocHeadingsRef.current = tocHeadings;

	useEffect(() => {
		const onInternalAnchorClick = (event: Event) => {
			const detail = (event as CustomEvent<InternalAnchorClickDetail>).detail;
			if (!detail || detail.sourcePath !== relPath) return;

			const headings =
				mode === "plain"
					? analyzeNoteInfo(getPlainText(), getPlainText(), true).headings
					: tocHeadingsRef.current;
			const heading = resolveAnchorHeading(headings, detail.anchor);
			if (heading) selectVisibleHeading(heading);
		};

		window.addEventListener(INTERNAL_ANCHOR_CLICK_EVENT, onInternalAnchorClick);
		return () => {
			window.removeEventListener(
				INTERNAL_ANCHOR_CLICK_EVENT,
				onInternalAnchorClick,
			);
		};
	}, [getPlainText, mode, relPath, selectVisibleHeading]);
}
