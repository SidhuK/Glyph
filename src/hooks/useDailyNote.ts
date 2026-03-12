import { useCallback, useRef, useState } from "react";
import {
	getDailyNoteContent,
	getDailyNotePath,
	getTodayDateString,
} from "../lib/dailyNotes";
import { updateOnboardingSettings } from "../lib/settings";
import { invoke } from "../lib/tauri";

export interface UseDailyNoteOptions {
	onOpenFile: (path: string) => Promise<void>;
	setError: (error: string) => void;
}

export interface UseDailyNoteReturn {
	openOrCreateDailyNote: (folder: string) => Promise<string | null>;
	openOrCreateDailyNoteAtDate: (
		folder: string,
		date: string,
	) => Promise<string | null>;
	isCreating: boolean;
}

export function useDailyNote(options: UseDailyNoteOptions): UseDailyNoteReturn {
	const { onOpenFile, setError } = options;
	const [isCreating, setIsCreating] = useState(false);
	const lockRef = useRef(false);

	const openOrCreateDailyNoteAtDate = useCallback(
		async (folder: string, date: string): Promise<string | null> => {
			if (lockRef.current) return null;
			lockRef.current = true;
			setIsCreating(true);
			try {
				const notePath = getDailyNotePath(folder, date);
				const content = getDailyNoteContent(date);
				await invoke("space_open_or_create_text", {
					path: notePath,
					text: content,
				});
				await onOpenFile(notePath);
				void updateOnboardingSettings({ openedDailyNote: true });
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

	const openOrCreateDailyNote = useCallback(
		async (folder: string) => {
			const todayDate = getTodayDateString();
			return openOrCreateDailyNoteAtDate(folder, todayDate);
		},
		[openOrCreateDailyNoteAtDate],
	);

	return { openOrCreateDailyNote, openOrCreateDailyNoteAtDate, isCreating };
}
