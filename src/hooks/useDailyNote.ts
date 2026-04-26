import { useCallback, useRef, useState } from "react";
import {
	getDailyNoteContent,
	getDailyNotePath,
	getTodayDateString,
	parseIsoDate,
} from "../lib/dailyNotes";
import { isMissingFileError } from "../lib/fsErrors";
import { updateOnboardingSettings } from "../lib/settings";
import { invoke } from "../lib/tauri";
import { renderTemplate } from "../lib/templates";

interface UseDailyNoteOptions {
	onOpenFile: (path: string) => Promise<void>;
	setError: (error: string) => void;
	spacePath: string | null;
	templatePath?: string | null;
}

interface UseDailyNoteReturn {
	openOrCreateDailyNote: (folder: string) => Promise<string | null>;
	openOrCreateDailyNoteAtDate: (
		folder: string,
		date: string,
	) => Promise<string | null>;
	isCreating: boolean;
}

export function useDailyNote(options: UseDailyNoteOptions): UseDailyNoteReturn {
	const { onOpenFile, setError, spacePath, templatePath } = options;
	const [isCreating, setIsCreating] = useState(false);
	const lockRef = useRef(false);

	const openOrCreateDailyNoteAtDate = useCallback(
		async (folder: string, date: string): Promise<string | null> => {
			if (!parseIsoDate(date)) {
				return null;
			}
			if (lockRef.current) return null;
			lockRef.current = true;
			setIsCreating(true);
			try {
				const notePath = getDailyNotePath(folder, date);
				try {
					await invoke("space_read_text", { path: notePath });
					await onOpenFile(notePath);
					void updateOnboardingSettings({ openedDailyNote: true });
					return notePath;
				} catch (error) {
					if (!isMissingFileError(error)) {
						throw error;
					}
					// Create below when the note does not exist yet.
				}
				let content = getDailyNoteContent(date);
				if (templatePath) {
					try {
						const templateDoc = await invoke("space_read_text", {
							path: templatePath,
						});
						const dateValue = parseIsoDate(date) ?? new Date();
						content = renderTemplate(templateDoc.text, {
							destinationPath: notePath,
							spaceRootPath: spacePath,
							date: dateValue,
						});
					} catch (error) {
						if (!isMissingFileError(error)) {
							throw error;
						}
					}
				}
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
		[onOpenFile, setError, spacePath, templatePath],
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
