import { join } from "@tauri-apps/api/path";
import { i18n } from "../i18n";
import { buildNoteDeeplink } from "./deeplink";
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

export async function copyNoteDeeplink(
	spacePath: string | null,
	relPath: string,
): Promise<void> {
	try {
		if (!spacePath) {
			throw new Error("No space is open.");
		}
		const url = buildNoteDeeplink(spacePath, relPath);
		await copyPathToClipboard(url, i18n.t("shell:fileTree.deeplinkCopied"));
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Could not copy deeplink.";
		toast.error(i18n.t("shell:fileTree.deeplinkCopyFailed"), {
			description: message,
		});
	}
}

export function buildPathCopyMenuItems(
	spacePath: string | null,
	relPath: string,
	options?: { includeDeeplink?: boolean },
): NativeContextMenuItem[] {
	const items: NativeContextMenuItem[] = [
		{
			label: i18n.t("shell:fileTree.copyRelativePath"),
			action: () => void copyRelativePath(relPath),
		},
		{
			label: i18n.t("shell:fileTree.copyAbsolutePath"),
			action: () => void copyAbsolutePath(spacePath, relPath),
		},
	];
	if (options?.includeDeeplink) {
		items.push({
			label: i18n.t("shell:fileTree.copyDeeplink"),
			action: () => void copyNoteDeeplink(spacePath, relPath),
		});
	}
	return items;
}
