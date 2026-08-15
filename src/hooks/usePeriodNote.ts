import { useCallback, useRef } from "react";
import { parseIsoDate } from "../lib/dailyNotes";
import { isMissingFileError } from "../lib/fsErrors";
import {
	type PeriodId,
	getPeriodNoteContent,
	getPeriodNotePath,
	periodAnchorDate,
} from "../lib/periodNotes";
import { invoke } from "../lib/tauri";
import { renderTemplate } from "../lib/templates";

interface UsePeriodNoteOptions {
	onOpenFile: (path: string) => Promise<void>;
	setError: (error: string) => void;
	spacePath: string | null;
	templatePathFor: (period: PeriodId) => string | null;
}

interface UsePeriodNoteReturn {
	openOrCreatePeriodNote: (
		folder: string,
		period: PeriodId,
	) => Promise<string | null>;
}

export function usePeriodNote(
	options: UsePeriodNoteOptions,
): UsePeriodNoteReturn {
	const { onOpenFile, setError, spacePath, templatePathFor } = options;
	const inFlightPathsRef = useRef(new Set<string>());

	const openOrCreatePeriodNote = useCallback(
		async (folder: string, period: PeriodId): Promise<string | null> => {
			if (period.kind === "day" && !parseIsoDate(period.date)) {
				return null;
			}
			try {
				const notePath = getPeriodNotePath(folder, period);
				if (inFlightPathsRef.current.has(notePath)) return null;
				inFlightPathsRef.current.add(notePath);
				try {
					try {
						await invoke("space_read_text", { path: notePath });
						await onOpenFile(notePath);
						return notePath;
					} catch (error) {
						if (!isMissingFileError(error)) {
							throw error;
						}
					}
					let content = getPeriodNoteContent(period);
					const templatePath = templatePathFor(period);
					if (templatePath) {
						try {
							const templateDoc = await invoke("space_read_text", {
								path: templatePath,
							});
							content = renderTemplate(templateDoc.text, {
								destinationPath: notePath,
								spaceRootPath: spacePath,
								date: periodAnchorDate(period),
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
					return notePath;
				} finally {
					inFlightPathsRef.current.delete(notePath);
				}
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to open dated note";
				setError(message);
				return null;
			}
		},
		[onOpenFile, setError, spacePath, templatePathFor],
	);

	return { openOrCreatePeriodNote };
}
