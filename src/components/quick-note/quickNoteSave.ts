import { isMissingFileError } from "../../lib/fsErrors";
import { uniqueExtractedNoteTitle } from "../editor/extractSelectionToNote";
import { invoke } from "../../lib/tauri";

/** Append adds to the chosen note; New note writes the draft to a note of its own. */
export type QuickNoteMode = "append" | "new";

const MAX_TITLE_LENGTH = 80;

function pad(value: number): string {
	return value.toString().padStart(2, "0");
}

function dateStamp(date = new Date()): string {
	return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("-");
}

export function quickNotePath(folder: string): string {
	const fileName = `${dateStamp()} - Quick Note.md`;
	return folder ? `${folder}/${fileName}` : fileName;
}

function appendMarkdown(existing: string, entry: string): string {
	const trimmedExisting = existing.trimEnd();
	if (!trimmedExisting) return `${entry}\n`;
	return `${trimmedExisting}\n\n${entry}\n`;
}

/** The note's current text, or null when it doesn't exist yet. */
async function readIfExists(path: string) {
	try {
		return await invoke("space_read_text", { path });
	} catch (cause) {
		if (isMissingFileError(cause)) return null;
		throw cause;
	}
}

export async function appendQuickNoteToPath(path: string, text: string): Promise<string> {
	// Only a missing note falls back to a fresh file; a failed write must never retry as an
	// unconditional overwrite of what is there.
	const doc = await readIfExists(path);
	await invoke("space_write_text", {
		path,
		text: doc ? appendMarkdown(doc.text, text.trim()) : `${text.trim()}\n`,
		base_mtime_ms: doc ? doc.mtime_ms : null,
	});
	return path;
}

/** The draft's first line, without Markdown markers, as a file name. */
function titleFromDraft(text: string): string {
	const firstLine = text.split("\n").find((line) => line.trim()) ?? "";
	const title = firstLine
		.replace(/^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|>\s*|\d+[.)]\s+)/, "")
		.replace(/[/\\:]/g, "-")
		// A leading dot would make a hidden file, which the space refuses to write.
		.replace(/^[\s.]+/, "")
		.trim()
		.slice(0, MAX_TITLE_LENGTH)
		.trim();
	return title || `${dateStamp()} - Quick Note`;
}

/** Writes the draft to a new note in `folder`, named after its first line. */
export async function createQuickNoteInFolder(folder: string, text: string): Promise<string> {
	let siblings: string[] = [];
	try {
		const entries = await invoke("space_list_dir", folder ? { dir: folder } : {});
		siblings = entries.map((entry) => entry.name);
	} catch (cause) {
		// A folder that doesn't exist yet is created by the write below.
		if (!isMissingFileError(cause)) throw cause;
	}
	const fileName = `${uniqueExtractedNoteTitle(titleFromDraft(text), siblings)}.md`;
	const path = folder ? `${folder}/${fileName}` : fileName;
	await invoke("space_write_text", { path, text: `${text.trim()}\n`, base_mtime_ms: null });
	return path;
}
