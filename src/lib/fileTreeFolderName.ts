import { i18n } from "../i18n";

const INVALID_FOLDER_NAME_CHARS = /[<>:"/\\|?*]/;

export function spaceLabelFromAbsPath(path: string | null): string {
	if (!path) return "Glyph";
	const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

export function validateFolderName(
	name: string,
	siblingNames: Iterable<string>,
): string | null {
	const trimmed = name.trim();
	if (!trimmed) return i18n.t("fileTree.folderName.empty", { ns: "ui" });
	if (trimmed === "." || trimmed === "..")
		return i18n.t("fileTree.folderName.reserved", { ns: "ui" });
	if (trimmed.includes("/")) {
		return i18n.t("fileTree.folderName.pathSeparators", { ns: "ui" });
	}
	if (INVALID_FOLDER_NAME_CHARS.test(trimmed)) {
		return i18n.t("fileTree.folderName.invalidChars", { ns: "ui" });
	}
	if (trimmed.startsWith(".")) {
		return i18n.t("fileTree.folderName.startsWithDot", { ns: "ui" });
	}
	const lower = trimmed.toLowerCase();
	for (const sibling of siblingNames) {
		if (sibling.toLowerCase() === lower) {
			return i18n.t("fileTree.folderName.duplicate", { ns: "ui" });
		}
	}
	return null;
}

export function formatCreateFolderLocationLabel(
	spacePath: string | null,
	parentDir: string,
): string {
	if (!parentDir) {
		const spaceLabel = spacePath
			? spaceLabelFromAbsPath(spacePath)
			: i18n.t("fileTree.folderName.spaceLabel", { ns: "ui" });
		return i18n.t("fileTree.folderName.rootLabel", {
			ns: "ui",
			spaceLabel,
		});
	}
	return parentDir.split("/").filter(Boolean).join(" / ");
}
