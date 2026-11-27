import { useEffect, useRef } from "react";
import {
	consumeTaskLineJump,
	taskLineJumpFromEvent,
	TASK_LINE_JUMP_EVENT,
} from "../../lib/taskLineJump";
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
	selectTaskLine: (byteOffset: number) => void;
	headingsReady: boolean;
}

export function useInternalAnchorNavigation({
	relPath,
	headings,
	selectVisibleHeading,
	selectTaskLine,
	headingsReady,
}: UseInternalAnchorNavigationArgs) {
	const selectVisibleHeadingRef = useRef(selectVisibleHeading);
	selectVisibleHeadingRef.current = selectVisibleHeading;
	const selectTaskLineRef = useRef(selectTaskLine);
	selectTaskLineRef.current = selectTaskLine;
	const headingsRef = useRef(headings);
	headingsRef.current = headings;

	useEffect(() => {
		if (headingsReady) {
			applyPendingHeadingJump({
				path: relPath,
				headings,
				selectHeading: (heading) => selectVisibleHeadingRef.current(heading),
			});
			const taskJump = consumeTaskLineJump(relPath);
			if (taskJump) selectTaskLineRef.current(taskJump.byteOffset);
		}

		const onInternalAnchorClick = (event: Event) => {
			if (!isInternalAnchorClickEvent(event)) return;
			if (normalizeRelPath(event.detail.sourcePath) !== normalizeRelPath(relPath)) {
				return;
			}
			const heading = resolveAnchorHeading(headingsRef.current, event.detail.anchor);
			if (!heading) return;
			discardPendingHeadingJump(relPath);
			selectVisibleHeadingRef.current(heading);
		};

		const onTaskLineJump = (event: Event) => {
			const jump = taskLineJumpFromEvent(event);
			if (!headingsReady || !jump || jump.path !== normalizeRelPath(relPath)) return;
			consumeTaskLineJump(relPath);
			selectTaskLineRef.current(jump.byteOffset);
		};

		window.addEventListener(INTERNAL_ANCHOR_CLICK_EVENT, onInternalAnchorClick);
		window.addEventListener(TASK_LINE_JUMP_EVENT, onTaskLineJump);
		return () => {
			window.removeEventListener(INTERNAL_ANCHOR_CLICK_EVENT, onInternalAnchorClick);
			window.removeEventListener(TASK_LINE_JUMP_EVENT, onTaskLineJump);
		};
	}, [headings, headingsReady, relPath]);
}
