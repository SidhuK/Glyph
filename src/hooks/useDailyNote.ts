import { useCallback, useState } from "react";
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

	const openOrCreateDailyNote = useCallback(
		async (folder: string): Promise<string | null> => {
			setIsCreating(true);
			try {
				const todayDate = getTodayDateString();
				const notePath = getDailyNotePath(folder, todayDate);

				// Try to read the file to check if it exists
				try {
					await invoke("vault_read_text", { path: notePath });
					// File exists, just open it
					await onOpenFile(notePath);
					return notePath;
				} catch (readErr: unknown) {
					const msg =
						readErr instanceof Error ? readErr.message.toLowerCase() : "";
					const isNotFound =
						msg.includes("not found") ||
						msg.includes("does not exist") ||
						msg.includes("no such file");
					if (!isNotFound) {
						throw readErr;
					}
					const content = getDailyNoteContent(todayDate);
					await invoke("vault_write_text", {
						path: notePath,
						text: content,
						base_mtime_ms: null,
					});
					await onOpenFile(notePath);
					return notePath;
				}
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to open daily note";
				setError(message);
				return null;
			} finally {
				setIsCreating(false);
			}
		},
		[onOpenFile, setError],
	);

	return { openOrCreateDailyNote, isCreating };
}
