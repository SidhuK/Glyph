import { joinRelPath, parentDir } from "../utils/path";
import type { AttachmentStorageMode } from "./settings";

export const DEFAULT_ATTACHMENT_FOLDER = "assets";

export const ATTACHMENT_LOCATION_OPTIONS: Array<{
	label: string;
	value: AttachmentStorageMode;
}> = [
	{ label: "At the top of your space", value: "space-root" },
	{ label: "One folder for all attachments", value: "specific-folder" },
	{ label: "Next to each note", value: "note-folder" },
	{ label: "In a subfolder with the note", value: "note-subfolder" },
];

export const ATTACHMENT_MODE_UI = {
	"space-root": {
		help: "Saved at the top level of your space.",
		folderEditor: null,
	},
	"note-folder": {
		help: "Saved next to the note they are attached to.",
		folderEditor: null,
	},
	"specific-folder": {
		help: "All attachments go in one folder.",
		folderEditor: "browse",
	},
	"note-subfolder": {
		help: "Attachments go in this subfolder inside the note's folder.",
		folderEditor: "text",
	},
} as const satisfies Record<
	AttachmentStorageMode,
	{ help: string; folderEditor: "browse" | "text" | null }
>;

export function resolveAttachmentTargetDir(
	mode: AttachmentStorageMode,
	attachmentFolder: string | null,
	notePath: string,
): string {
	switch (mode) {
		case "space-root":
			return "";
		case "specific-folder":
			return attachmentFolder?.trim() || DEFAULT_ATTACHMENT_FOLDER;
		case "note-folder":
			return parentDir(notePath);
		case "note-subfolder": {
			const subfolder = attachmentFolder?.trim() || DEFAULT_ATTACHMENT_FOLDER;
			return joinRelPath(parentDir(notePath), subfolder);
		}
		default: {
			const _unhandledMode: never = mode;
			return _unhandledMode;
		}
	}
}

export function modesUseDifferentFolderSemantics(
	from: AttachmentStorageMode,
	to: AttachmentStorageMode,
): boolean {
	return (
		(from === "specific-folder" && to === "note-subfolder") ||
		(from === "note-subfolder" && to === "specific-folder")
	);
}

export function modeRequiresAttachmentFolder(
	mode: AttachmentStorageMode,
): boolean {
	return mode === "specific-folder" || mode === "note-subfolder";
}
