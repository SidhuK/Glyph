import { useCallback, useRef, useState } from "react";
import {
	getDailyNoteContent,
	getDailyNotePath,
	getTodayDateString,
} from "../lib/dailyNotes";
import { invoke } from "../lib/tauri";

export interface UseDailyNoteOptions {
	onOpenFile: (path: string) => Promise<void>;
	setError: (error: string) => void;
}

export interface UseDailyNoteReturn {
	openOrCreateDailyNote: (folder: string) => Promise<string | null>;
	isCreating: boolean;
}

export function useDailyNote(options: UseDailyNoteOptions): UseDailyNoteReturn {
	const { onOpenFile, setError } = options;
	const [isCreating, setIsCreating] = useState(false);
	const lockRef = useRef(false);

	const openOrCreateDailyNote = useCallback(
		async (folder: string): Promise<string | null> => {
			if (lockRef.current) return null;
			lockRef.current = true;
			setIsCreating(true);
			try {
				const todayDate = getTodayDateString();
				const notePath = getDailyNotePath(folder, todayDate);
				const content = getDailyNoteContent(todayDate);
				await invoke("vault_open_or_create_text", {
					path: notePath,
					text: content,
				});
				await onOpenFile(notePath);
				return notePath;
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to open daily note";
				setError(message);
				return null;
			} finally {
				lockRef.current = false;
				setIsCreating(false);
			}
		},
		[onOpenFile, setError],
	);

	return { openOrCreateDailyNote, isCreating };
}
