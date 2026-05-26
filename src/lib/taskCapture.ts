import { insertTaskIntoDailyNote } from "./calendar";
import {
	getDailyNoteContent,
	getDailyNotePath,
	parseIsoDate,
} from "./dailyNotes";
import { isMissingFileError } from "./fsErrors";
import { type TextFileDoc, invoke } from "./tauri";
import { renderTemplate } from "./templates";

interface AddTaskToDailyNoteOptions {
	taskText: string;
	scheduledDate: string;
	dueDate?: string | null;
	dailyNotesFolder: string | null;
	dailyNoteTemplatePath: string | null;
	spacePath: string | null;
}

export interface AddTaskToDailyNoteResult {
	path: string;
	text: string;
	previousDoc: TextFileDoc;
}

function hasDateToken(text: string, token: "📅" | "⏳") {
	return new RegExp(`${token}\\s+\\d{4}-\\d{2}-\\d{2}`).test(text);
}

function taskTextWithDueDate(taskText: string, dueDate?: string | null) {
	const normalized = taskText.replace(/\s+/g, " ").trim();
	if (!dueDate || hasDateToken(normalized, "📅")) return normalized;
	return `${normalized} 📅 ${dueDate}`;
}

async function ensureDailyNoteExistsForTask({
	date,
	dailyNotesFolder,
	dailyNoteTemplatePath,
	spacePath,
}: {
	date: string;
	dailyNotesFolder: string;
	dailyNoteTemplatePath: string | null;
	spacePath: string | null;
}): Promise<TextFileDoc> {
	const notePath = getDailyNotePath(dailyNotesFolder, date);
	try {
		return await invoke("space_read_text", { path: notePath });
	} catch (cause) {
		if (!isMissingFileError(cause)) throw cause;
	}

	let content = getDailyNoteContent(date);
	if (dailyNoteTemplatePath) {
		try {
			const templateDoc = await invoke("space_read_text", {
				path: dailyNoteTemplatePath,
			});
			content = renderTemplate(templateDoc.text, {
				destinationPath: notePath,
				spaceRootPath: spacePath,
				date: parseIsoDate(date) ?? new Date(),
			});
		} catch (cause) {
			if (!isMissingFileError(cause)) throw cause;
		}
	}

	await invoke("space_open_or_create_text", {
		path: notePath,
		text: content,
	});
	return invoke("space_read_text", { path: notePath });
}

export async function addTaskToDailyNote({
	taskText,
	scheduledDate,
	dueDate,
	dailyNotesFolder,
	dailyNoteTemplatePath,
	spacePath,
}: AddTaskToDailyNoteOptions): Promise<AddTaskToDailyNoteResult | null> {
	const normalized = taskText.replace(/\s+/g, " ").trim();
	if (!normalized) return null;
	if (!dailyNotesFolder) {
		throw new Error("Set a daily notes folder before adding tasks.");
	}

	const noteDoc = await ensureDailyNoteExistsForTask({
		date: scheduledDate,
		dailyNotesFolder,
		dailyNoteTemplatePath,
		spacePath,
	});
	const nextMarkdown = insertTaskIntoDailyNote(
		noteDoc.text,
		taskTextWithDueDate(normalized, dueDate),
		scheduledDate,
	);
	await invoke("space_write_text", {
		path: noteDoc.rel_path,
		text: nextMarkdown,
		base_mtime_ms: noteDoc.mtime_ms,
	});
	return {
		path: noteDoc.rel_path,
		text: nextMarkdown,
		previousDoc: noteDoc,
	};
}
