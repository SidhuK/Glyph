import {
	Doc01Icon,
	FileZipIcon,
	Image01Icon,
	MusicNote01Icon,
	Pdf01Icon,
	Video01Icon,
} from "@hugeicons/core-free-icons";
import type { AttachmentKind } from "../../../lib/tauri";

const BYTE_UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

export function formatBytes(bytes: number, locale: string): string {
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
		value /= 1024;
		unitIndex += 1;
	}
	return new Intl.NumberFormat(locale, {
		style: "unit",
		unit: BYTE_UNITS[unitIndex],
		unitDisplay: "short",
		maximumFractionDigits: unitIndex === 0 ? 0 : 1,
	}).format(value);
}

export function attachmentKindIcon(kind: AttachmentKind) {
	switch (kind) {
		case "image":
			return Image01Icon;
		case "pdf":
			return Pdf01Icon;
		case "audio":
			return MusicNote01Icon;
		case "video":
			return Video01Icon;
		case "document":
			return Doc01Icon;
		case "archive":
			return FileZipIcon;
		default: {
			const _exhaustive: never = kind;
			return _exhaustive;
		}
	}
}

/** Formats the `glyphasset://` protocol can serve as an inline thumbnail. */
const THUMBNAIL_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif"]);

export function hasThumbnail(kind: AttachmentKind, extension: string): boolean {
	return kind === "image" && THUMBNAIL_EXTENSIONS.has(extension.slice(1).toLowerCase());
}

export function parentFolder(relPath: string): string {
	const slash = relPath.lastIndexOf("/");
	return slash === -1 ? "" : relPath.slice(0, slash);
}
