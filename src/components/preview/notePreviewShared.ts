import { parseNotePreview } from "../../lib/notePreview";
import { invoke } from "../../lib/tauri";
import { isPreviewableNotePath, normalizeRelPath } from "../../utils/path";

export { isPreviewableNotePath } from "../../utils/path";

export const NOTE_PREVIEW_MAX_BYTES = 96 * 1024;
export const NOTE_PREVIEW_OPEN_DELAY_MS = 280;

export type NotePreviewData =
	| { status: "ok"; relPath: string; content: string }
	| { status: "error"; relPath: string; message: string };

export function wikiTargetFromLink(element: HTMLElement): string | null {
	if (element.getAttribute("data-wikilink-embed") === "true") return null;
	if (element.getAttribute("data-unresolved") === "true") return null;
	const target = element.getAttribute("data-target") ?? "";
	const normalized = normalizeRelPath(target.split("#", 1)[0] ?? target);
	if (!isPreviewableNotePath(normalized)) return null;
	return normalized || null;
}

export async function loadNotePreviewFromPath(
	relPath: string,
): Promise<NotePreviewData> {
	const doc = await invoke("space_read_text_preview", {
		path: relPath,
		max_bytes: NOTE_PREVIEW_MAX_BYTES,
	});
	const { content } = parseNotePreview(relPath, doc.text);
	return { status: "ok", relPath, content };
}

export async function loadNotePreviewFromWikiTarget(
	target: string,
): Promise<NotePreviewData> {
	const relPath = await invoke("space_resolve_wikilink", { target });
	if (!relPath) {
		throw new Error("Note not found");
	}
	return loadNotePreviewFromPath(relPath);
}
