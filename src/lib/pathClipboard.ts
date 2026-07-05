import { join } from "@tauri-apps/api/path";
import type { NativeContextMenuItem } from "./nativeContextMenu";
import { toast } from "./toast";

function relativePathLabel(relPath: string): string {
	return relPath || "/";
}

async function absoluteSpacePath(
	spacePath: string | null,
	relPath: string,
): Promise<string> {
	if (!spacePath) {
		throw new Error("No space is open.");
	}
	return relPath ? await join(spacePath, relPath) : spacePath;
}

export async function copyPathToClipboard(
	path: string,
	successMessage = "Copied path.",
): Promise<void> {
	try {
		const clipboard = navigator.clipboard;
		if (!clipboard?.writeText) {
			throw new Error("Clipboard is not available.");
		}
		await clipboard.writeText(path);
		toast.success(successMessage);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Could not copy path.";
		toast.error("Could not copy path", { description: message });
	}
}

export async function copyRelativePath(relPath: string): Promise<void> {
	await copyPathToClipboard(
		relativePathLabel(relPath),
		"Copied relative path.",
	);
}

export async function copyAbsolutePath(
	spacePath: string | null,
	relPath: string,
): Promise<void> {
	try {
		await copyPathToClipboard(
			await absoluteSpacePath(spacePath, relPath),
			"Copied absolute path.",
		);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Could not copy path.";
		toast.error("Could not copy path", { description: message });
	}
}

export function buildPathCopyMenuItems(
	spacePath: string | null,
	relPath: string,
): NativeContextMenuItem[] {
	return [
		{
			label: "Copy Relative Path",
			action: () => void copyRelativePath(relPath),
		},
		{
			label: "Copy Absolute Path",
			action: () => void copyAbsolutePath(spacePath, relPath),
		},
	];
}
