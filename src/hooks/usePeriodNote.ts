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
	const inFlightKeysRef = useRef(new Set<string>());
	const spacePathRef = useRef(spacePath);
	spacePathRef.current = spacePath;

	const openOrCreatePeriodNote = useCallback(
		async (folder: string, period: PeriodId): Promise<string | null> => {
			if (period.kind === "day" && !parseIsoDate(period.date)) {
				return null;
			}
			try {
				const notePath = getPeriodNotePath(folder, period);
				const requestedSpacePath = spacePath;
				const flightKey = `${requestedSpacePath ?? ""}\0${notePath}`;
				if (inFlightKeysRef.current.has(flightKey)) return null;
				inFlightKeysRef.current.add(flightKey);
				const stillOnRequestedSpace = () =>
					spacePathRef.current === requestedSpacePath;
				try {
					try {
						await invoke("space_read_text", { path: notePath });
						if (!stillOnRequestedSpace()) return null;
						await onOpenFile(notePath);
						return notePath;
					} catch (error) {
						if (!isMissingFileError(error)) {
							throw error;
						}
					}
					if (!stillOnRequestedSpace()) return null;
					let content = getPeriodNoteContent(period);
					const templatePath = templatePathFor(period);
					if (templatePath) {
						try {
							const templateDoc = await invoke("space_read_text", {
								path: templatePath,
							});
							content = renderTemplate(templateDoc.text, {
								destinationPath: notePath,
								spaceRootPath: requestedSpacePath,
								date: periodAnchorDate(period),
							});
						} catch (error) {
							if (!isMissingFileError(error)) {
								throw error;
							}
						}
					}
					if (!stillOnRequestedSpace()) return null;
					await invoke("space_open_or_create_text", {
						path: notePath,
						text: content,
					});
					if (!stillOnRequestedSpace()) return null;
					await onOpenFile(notePath);
					return notePath;
				} finally {
					inFlightKeysRef.current.delete(flightKey);
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
