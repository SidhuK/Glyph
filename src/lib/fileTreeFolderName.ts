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
	if (!trimmed) return "Folder name cannot be empty";
	if (trimmed === "." || trimmed === "..")
		return "This folder name is reserved";
	if (trimmed.includes("/")) {
		return "Folder name cannot contain path separators";
	}
	if (INVALID_FOLDER_NAME_CHARS.test(trimmed)) {
		return "Folder name contains invalid characters";
	}
	if (trimmed.startsWith(".")) {
		return "Folder names cannot start with a dot";
	}
	const lower = trimmed.toLowerCase();
	for (const sibling of siblingNames) {
		if (sibling.toLowerCase() === lower) {
			return "An item with this name already exists here";
		}
	}
	return null;
}

export function formatCreateFolderLocationLabel(
	spacePath: string | null,
	parentDir: string,
): string {
	if (!parentDir) {
		const spaceLabel = spacePath ? spaceLabelFromAbsPath(spacePath) : "Space";
		return `${spaceLabel} (root)`;
	}
	return parentDir.split("/").filter(Boolean).join(" / ");
}
