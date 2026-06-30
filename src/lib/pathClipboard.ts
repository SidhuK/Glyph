import { join } from "@tauri-apps/api/path";
import { toast } from "sonner";
import { i18n } from "../i18n";
import type { NativeContextMenuItem } from "./nativeContextMenu";

function relativePathLabel(relPath: string): string {
	return relPath || "/";
}

async function absoluteSpacePath(
	spacePath: string | null,
	relPath: string,
): Promise<string> {
	if (!spacePath) {
		throw new Error(i18n.t("pathClipboard.noSpaceOpen", { ns: "ui" }));
	}
	return relPath ? await join(spacePath, relPath) : spacePath;
}

export async function copyPathToClipboard(
	path: string,
	successMessage = i18n.t("pathClipboard.copiedPath", { ns: "ui" }),
): Promise<void> {
	try {
		const clipboard = navigator.clipboard;
		if (!clipboard?.writeText) {
			throw new Error(
				i18n.t("pathClipboard.clipboardUnavailable", { ns: "ui" }),
			);
		}
		await clipboard.writeText(path);
		toast.success(successMessage);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: i18n.t("pathClipboard.copyFailedDescription", { ns: "ui" });
		toast.error(i18n.t("pathClipboard.copyFailedTitle", { ns: "ui" }), {
			description: message,
		});
	}
}

export async function copyRelativePath(relPath: string): Promise<void> {
	await copyPathToClipboard(
		relativePathLabel(relPath),
		i18n.t("pathClipboard.copiedRelativePath", { ns: "ui" }),
	);
}

export async function copyAbsolutePath(
	spacePath: string | null,
	relPath: string,
): Promise<void> {
	try {
		await copyPathToClipboard(
			await absoluteSpacePath(spacePath, relPath),
			i18n.t("pathClipboard.copiedAbsolutePath", { ns: "ui" }),
		);
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: i18n.t("pathClipboard.copyFailedDescription", { ns: "ui" });
		toast.error(i18n.t("pathClipboard.copyFailedTitle", { ns: "ui" }), {
			description: message,
		});
	}
}

export function buildPathCopyMenuItems(
	spacePath: string | null,
	relPath: string,
): NativeContextMenuItem[] {
	return [
		{
			label: i18n.t("pathClipboard.copyRelativePath", { ns: "ui" }),
			action: () => void copyRelativePath(relPath),
		},
		{
			label: i18n.t("pathClipboard.copyAbsolutePath", { ns: "ui" }),
			action: () => void copyAbsolutePath(spacePath, relPath),
		},
	];
}
