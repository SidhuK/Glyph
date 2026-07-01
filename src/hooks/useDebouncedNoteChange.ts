import { useCallback, useEffect, useRef } from "react";
import { listenTauriEvent } from "../lib/tauriEvents";

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

function runUnlisten(unlisten: () => void): void {
	try {
		const result = unlisten() as unknown;
		void Promise.resolve(result).catch(() => {
			// Tauri may already have cleaned up the listener during window teardown.
		});
	} catch {
		// Ignore teardown races from Tauri listener cleanup.
	}
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
					for (const stop of stops) runUnlisten(stop);
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
			for (const stop of unlisteners) runUnlisten(stop);
			unlisteners = [];
		};
	}, [enabled, schedule]);
}
