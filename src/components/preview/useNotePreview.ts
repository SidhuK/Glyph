import { useEffect, useRef, useState } from "react";
import {
	type NotePreviewData,
	loadNotePreviewFromPath,
} from "./notePreviewShared";

interface UseNotePreviewOptions {
	delayMs?: number;
}

export function useNotePreview(
	path: string | null,
	options: UseNotePreviewOptions = {},
) {
	const { delayMs = 0 } = options;
	const [preview, setPreview] = useState<NotePreviewData | null>(null);
	const requestIdRef = useRef(0);
	const openTimerRef = useRef<number | null>(null);

	useEffect(() => {
		if (openTimerRef.current !== null) {
			window.clearTimeout(openTimerRef.current);
			openTimerRef.current = null;
		}
		requestIdRef.current += 1;
		const requestId = requestIdRef.current;

		if (!path) {
			setPreview(null);
			return;
		}

		setPreview(null);

		openTimerRef.current = window.setTimeout(() => {
			void (async () => {
				try {
					const data = await loadNotePreviewFromPath(path);
					if (requestIdRef.current !== requestId) return;
					setPreview(data);
				} catch (error) {
					if (requestIdRef.current !== requestId) return;
					setPreview({
						relPath: path,
						content: "",
						error: error instanceof Error ? error.message : String(error),
					});
				}
			})();
		}, delayMs);

		return () => {
			if (openTimerRef.current !== null) {
				window.clearTimeout(openTimerRef.current);
				openTimerRef.current = null;
			}
		};
	}, [delayMs, path]);

	return preview;
}
