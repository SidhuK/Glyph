import { useEffect, useRef } from "react";
import { normalizeRelPath } from "../../utils/path";
import type { TOCHeading } from "../editor/hooks/useTableOfContents";
import {
	INTERNAL_ANCHOR_CLICK_EVENT,
	isInternalAnchorClickEvent,
} from "../editor/markdown/editorEvents";
import {
	applyPendingHeadingJump,
	discardPendingHeadingJump,
	resolveAnchorHeading,
} from "../editor/markdown/headingAnchor";

interface UseInternalAnchorNavigationArgs {
	relPath: string;
	headings: readonly TOCHeading[];
	selectVisibleHeading: (heading: TOCHeading) => void;
	headingsReady: boolean;
}

export function useInternalAnchorNavigation({
	relPath,
	headings,
	selectVisibleHeading,
	headingsReady,
}: UseInternalAnchorNavigationArgs) {
	const selectVisibleHeadingRef = useRef(selectVisibleHeading);
	selectVisibleHeadingRef.current = selectVisibleHeading;
	const headingsRef = useRef(headings);
	headingsRef.current = headings;

	useEffect(() => {
		if (headingsReady) {
			applyPendingHeadingJump({
				path: relPath,
				headings,
				selectHeading: (heading) => selectVisibleHeadingRef.current(heading),
			});
		}

		const onInternalAnchorClick = (event: Event) => {
			if (!isInternalAnchorClickEvent(event)) return;
			if (
				normalizeRelPath(event.detail.sourcePath) !== normalizeRelPath(relPath)
			) {
				return;
			}
			const heading = resolveAnchorHeading(
				headingsRef.current,
				event.detail.anchor,
			);
			if (!heading) return;
			discardPendingHeadingJump(relPath);
			selectVisibleHeadingRef.current(heading);
		};

		window.addEventListener(INTERNAL_ANCHOR_CLICK_EVENT, onInternalAnchorClick);
		return () => {
			window.removeEventListener(
				INTERNAL_ANCHOR_CLICK_EVENT,
				onInternalAnchorClick,
			);
		};
	}, [headings, headingsReady, relPath]);
}
