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
	openOrCreatePeriodNote: (folder: string, period: PeriodId) => Promise<string | null>;
}

interface EnsurePeriodNoteOptions {
	folder: string;
	period: PeriodId;
	spacePath: string;
	templatePath: string | null;
	isCurrent: () => boolean;
}

async function periodNoteContent(
	period: PeriodId,
	notePath: string,
	spacePath: string,
	templatePath: string | null,
): Promise<string> {
	const content = getPeriodNoteContent(period);
	if (!templatePath) return content;
	try {
		const templateDoc = await invoke("space_read_text", { path: templatePath });
		return renderTemplate(templateDoc.text, {
			destinationPath: notePath,
			spaceRootPath: spacePath,
			date: periodAnchorDate(period),
		});
	} catch (error) {
		if (!isMissingFileError(error)) throw error;
		return content;
	}
}

export async function ensurePeriodNote({
	folder,
	period,
	spacePath,
	templatePath,
	isCurrent,
}: EnsurePeriodNoteOptions): Promise<string | null> {
	const notePath = getPeriodNotePath(folder, period);
	try {
		await invoke("space_read_text", { path: notePath });
		return isCurrent() ? notePath : null;
	} catch (error) {
		if (!isMissingFileError(error)) throw error;
	}
	if (!isCurrent()) return null;
	const content = await periodNoteContent(period, notePath, spacePath, templatePath);
	if (!isCurrent()) return null;
	try {
		await invoke("space_open_or_create_text", {
			path: notePath,
			text: content,
			space_path: spacePath,
		});
	} catch (error) {
		if (!isCurrent()) return null;
		throw error;
	}
	return isCurrent() ? notePath : null;
}

export function usePeriodNote(options: UsePeriodNoteOptions): UsePeriodNoteReturn {
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
				const requestedSpacePath = spacePath;
				if (!requestedSpacePath) return null;
				const flightKey = `${requestedSpacePath}\0${getPeriodNotePath(folder, period)}`;
				if (inFlightKeysRef.current.has(flightKey)) return null;
				inFlightKeysRef.current.add(flightKey);
				try {
					const notePath = await ensurePeriodNote({
						folder,
						period,
						spacePath: requestedSpacePath,
						templatePath: templatePathFor(period),
						isCurrent: () => spacePathRef.current === requestedSpacePath,
					});
					if (!notePath) return null;
					await onOpenFile(notePath);
					return notePath;
				} finally {
					inFlightKeysRef.current.delete(flightKey);
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : "Failed to open dated note";
				setError(message);
				return null;
			}
		},
		[onOpenFile, setError, spacePath, templatePathFor],
	);

	return { openOrCreatePeriodNote };
}
