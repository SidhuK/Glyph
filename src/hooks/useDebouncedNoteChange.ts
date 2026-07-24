import { useCallback, useEffect, useRef } from "react";
import { listenTauriEvent, safeUnlisten } from "../lib/tauriEvents";

interface NoteChangePayload {
	rel_path: string;
	removed: boolean;
}

interface UseDebouncedNoteChangeOptions {
	delayMs: number;
	enabled?: boolean;
	onChange: (payload: NoteChangePayload) => void;
}

function isMarkdownNote(path: string): boolean {
	return path.toLowerCase().endsWith(".md");
}

export function useDebouncedNoteChange({
	delayMs,
	enabled = true,
	onChange,
}: UseDebouncedNoteChangeOptions): void {
	const onChangeRef = useRef(onChange);
	const timerRef = useRef<number | null>(null);
	onChangeRef.current = onChange;

	const schedule = useCallback(
		(payload: NoteChangePayload) => {
			if (!enabled || !isMarkdownNote(payload.rel_path)) return;
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
			}
			timerRef.current = window.setTimeout(() => {
				timerRef.current = null;
				onChangeRef.current(payload);
			}, delayMs);
		},
		[delayMs, enabled],
	);

	useEffect(() => {
		if (!enabled) return;

		let cancelled = false;
		let unlisteners: (() => void)[] = [];
		void Promise.all([
			listenTauriEvent("space:fs_changed", schedule),
			listenTauriEvent("notes:external_changed", schedule),
		])
			.then((stops) => {
				if (cancelled) {
					for (const stop of stops) safeUnlisten(stop);
					return;
				}
				unlisteners = stops;
			})
			.catch(() => {
				// Listener setup can race with window teardown.
			});

		return () => {
			cancelled = true;
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			for (const stop of unlisteners) safeUnlisten(stop);
			unlisteners = [];
		};
	}, [enabled, schedule]);
}
