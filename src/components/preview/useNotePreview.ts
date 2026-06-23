import { useEffect, useRef, useState } from "react";
import {
	type NotePreviewData,
	loadNotePreviewFromPath,
} from "./notePreviewShared";

export type NotePreviewLoader = (key: string) => Promise<NotePreviewData>;

interface UseNotePreviewOptions {
	delayMs?: number;
	load?: NotePreviewLoader;
}

export function useNotePreview(
	path: string | null,
	options: UseNotePreviewOptions = {},
) {
	const { delayMs = 0, load = loadNotePreviewFromPath } = options;
	const [preview, setPreview] = useState<{
		key: string;
		data: NotePreviewData;
	} | null>(null);
	const requestIdRef = useRef(0);
	const openTimerRef = useRef<number | null>(null);
	const loadRef = useRef(load);
	loadRef.current = load;

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
					const data = await loadRef.current(path);
					if (requestIdRef.current !== requestId) return;
					setPreview({ key: path, data });
				} catch (error) {
					if (requestIdRef.current !== requestId) return;
					setPreview({
						key: path,
						data: {
							status: "error",
							relPath: path,
							message: error instanceof Error ? error.message : String(error),
						},
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

	return preview && preview.key === path ? preview.data : null;
}
