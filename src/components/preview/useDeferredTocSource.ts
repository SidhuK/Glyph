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
	const tocReadyResizeObserverRef = useRef<ResizeObserver | null>(null);
	const tocReadyGenerationRef = useRef(0);

	const cancelPendingTocReady = useCallback(() => {
		if (tocReadyFrameRef.current === null) return;
		window.cancelAnimationFrame(tocReadyFrameRef.current);
		tocReadyFrameRef.current = null;
	}, []);

	const disconnectPendingTocResizeObserver = useCallback(() => {
		tocReadyResizeObserverRef.current?.disconnect();
		tocReadyResizeObserverRef.current = null;
	}, []);

	const resetPendingTocReady = useCallback(() => {
		tocReadyGenerationRef.current += 1;
		cancelPendingTocReady();
		disconnectPendingTocResizeObserver();
	}, [cancelPendingTocReady, disconnectPendingTocResizeObserver]);

	const handleEditorReady = useCallback(
		(editor: Editor | null, contentRoot: HTMLElement | null) => {
			resetPendingTocReady();
			setTocSource(null);
			if (!editor || !contentRoot) return;
			const readyEditor = editor;
			const readyContentRoot = contentRoot;
			const readyGeneration = tocReadyGenerationRef.current;

			function rootCanBecomeReady() {
				return (
					tocReadyGenerationRef.current === readyGeneration &&
					readyContentRoot.isConnected &&
					!readyEditor.isDestroyed
				);
			}

			function publishWhenRootHasLayout() {
				if (!rootCanBecomeReady()) return false;
				const rootRect = readyContentRoot.getBoundingClientRect();
				if (rootRect.width === 0 || rootRect.height === 0) return false;

				disconnectPendingTocResizeObserver();
				setTocSource({ editor: readyEditor, contentRoot: readyContentRoot });
				return true;
			}

			function observeRootLayout() {
				if (!rootCanBecomeReady()) return;
				if (tocReadyResizeObserverRef.current !== null) return;
				if (typeof ResizeObserver === "undefined") {
					tocReadyFrameRef.current =
						window.requestAnimationFrame(markReadyAfterPaint);
					return;
				}
				const resizeObserver = new ResizeObserver(() => {
					publishWhenRootHasLayout();
				});
				resizeObserver.observe(readyContentRoot);
				tocReadyResizeObserverRef.current = resizeObserver;
			}

			let frameCount = 0;
			function markReadyAfterPaint() {
				frameCount += 1;
				const rootRect = readyContentRoot.getBoundingClientRect();
				const rootHasLayout = rootRect.width > 0 && rootRect.height > 0;
				const minFramesElapsed = frameCount >= TOC_EDITOR_READY_MIN_FRAME_COUNT;
				const maxFramesElapsed = frameCount >= TOC_EDITOR_READY_MAX_FRAME_COUNT;

				if (!minFramesElapsed || (!rootHasLayout && !maxFramesElapsed)) {
					tocReadyFrameRef.current =
						window.requestAnimationFrame(markReadyAfterPaint);
					return;
				}

				tocReadyFrameRef.current = null;
				if (!publishWhenRootHasLayout()) {
					observeRootLayout();
				}
			}

			tocReadyFrameRef.current =
				window.requestAnimationFrame(markReadyAfterPaint);
		},
		[disconnectPendingTocResizeObserver, resetPendingTocReady],
	);

	useEffect(() => resetPendingTocReady, [resetPendingTocReady]);

	return { tocSource, handleEditorReady };
}
