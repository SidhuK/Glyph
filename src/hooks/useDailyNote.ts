import { useCallback } from "react";
import { getTodayDateString, parseIsoDate } from "../lib/dailyNotes";
import { usePeriodNote } from "./usePeriodNote";

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
	const { openOrCreatePeriodNote, isCreating } = usePeriodNote({
		onOpenFile,
		setError,
		spacePath,
		templatePathFor: (period) =>
			period.kind === "day" ? (templatePath ?? null) : null,
	});

	const openOrCreateDailyNoteAtDate = useCallback(
		async (folder: string, date: string): Promise<string | null> => {
			if (!parseIsoDate(date)) {
				return null;
			}
			return openOrCreatePeriodNote(folder, { kind: "day", date });
		},
		[openOrCreatePeriodNote],
	);

	const openOrCreateDailyNote = useCallback(
		async (folder: string) => {
			return openOrCreateDailyNoteAtDate(folder, getTodayDateString());
		},
		[openOrCreateDailyNoteAtDate],
	);

	return { openOrCreateDailyNote, openOrCreateDailyNoteAtDate, isCreating };
}
