import { invoke } from "../../lib/tauri";

export interface SpaceFolderSelection {
	relativePath: string;
	spacePath: string;
}

export async function selectFolderRelativeToSpace(): Promise<SpaceFolderSelection | null> {
	const { open } = await import("@tauri-apps/plugin-dialog");
	const selected = await open({ directory: true, multiple: false });
	if (typeof selected !== "string") return null;

	const spacePath = await invoke("space_get_current");
	if (!spacePath) throw new Error("No space is currently open.");

	const normalizedSelected = selected.replace(/\\/g, "/");
	const normalizedSpace = spacePath.replace(/\\/g, "/");
	const spacePrefix = normalizedSpace.endsWith("/")
		? normalizedSpace
		: `${normalizedSpace}/`;
	if (
		normalizedSelected.toLowerCase() !== normalizedSpace.toLowerCase() &&
		!normalizedSelected.toLowerCase().startsWith(spacePrefix.toLowerCase())
	) {
		throw new Error("Selected folder must be inside the current space.");
	}

	return {
		relativePath: normalizedSelected
			.slice(normalizedSpace.length)
			.replace(/^\/+/, ""),
		spacePath,
	};
}

export function requireSpacePath(spacePath: string | null): string {
	if (!spacePath) throw new Error("No space is currently open.");
	return spacePath;
}
