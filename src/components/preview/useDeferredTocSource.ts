import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

const TOC_EDITOR_READY_MIN_FRAME_COUNT = 2;
const TOC_EDITOR_READY_MAX_FRAME_COUNT = 8;

interface TocSource {
	editor: Editor;
	contentRoot: HTMLElement;
}

export function useDeferredTocSource() {
	const [tocSource, setTocSource] = useState<TocSource | null>(null);
	const tocReadyFrameRef = useRef<number | null>(null);

	const cancelPendingTocReady = useCallback(() => {
		if (tocReadyFrameRef.current === null) return;
		window.cancelAnimationFrame(tocReadyFrameRef.current);
		tocReadyFrameRef.current = null;
	}, []);

	const handleEditorReady = useCallback(
		(editor: Editor | null, contentRoot: HTMLElement | null) => {
			cancelPendingTocReady();
			setTocSource(null);
			if (!editor || !contentRoot) return;

			let frameCount = 0;
			const markReadyAfterPaint = () => {
				frameCount += 1;
				const rootRect = contentRoot.getBoundingClientRect();
				const rootHasLayout = rootRect.width > 0 && rootRect.height > 0;
				const minFramesElapsed = frameCount >= TOC_EDITOR_READY_MIN_FRAME_COUNT;
				const maxFramesElapsed = frameCount >= TOC_EDITOR_READY_MAX_FRAME_COUNT;

				if (!minFramesElapsed || (!rootHasLayout && !maxFramesElapsed)) {
					tocReadyFrameRef.current =
						window.requestAnimationFrame(markReadyAfterPaint);
					return;
				}

				tocReadyFrameRef.current = null;
				if (!contentRoot.isConnected || editor.isDestroyed || !rootHasLayout) {
					return;
				}
				setTocSource({ editor, contentRoot });
			};

			tocReadyFrameRef.current =
				window.requestAnimationFrame(markReadyAfterPaint);
		},
		[cancelPendingTocReady],
	);

	useEffect(() => cancelPendingTocReady, [cancelPendingTocReady]);

	return { tocSource, handleEditorReady };
}
