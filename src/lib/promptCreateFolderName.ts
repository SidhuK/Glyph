import { join } from "@tauri-apps/api/path";
import { basename, normalizeRelPath, parentDir } from "../utils/path";
import {
	formatCreateFolderLocationLabel,
	validateFolderName,
} from "./fileTreeFolderName";
import { invoke } from "./tauri";

export async function promptCreateFolderName(options: {
	parentDir: string;
	spacePath: string | null;
	prepareParentDir?: (parentDir: string) => Promise<void>;
}): Promise<string | null> {
	if (!options.spacePath) return null;

	const normalizedParentDir = normalizeRelPath(options.parentDir);
	const locationLabel = formatCreateFolderLocationLabel(
		options.spacePath,
		normalizedParentDir,
	);

	if (options.prepareParentDir) {
		await options.prepareParentDir(normalizedParentDir);
	}

	const siblings = await invoke(
		"space_list_dir",
		normalizedParentDir ? { dir: normalizedParentDir } : {},
	);
	const siblingNames = siblings.map((entry) => entry.name);

	while (true) {
		const { message: showMessage, save } = await import(
			"@tauri-apps/plugin-dialog"
		);
		const defaultPath = normalizedParentDir
			? await join(options.spacePath, normalizedParentDir, "New Folder")
			: await join(options.spacePath, "New Folder");
		const selection = await save({
			title: `New folder in ${locationLabel}`,
			defaultPath,
		});
		if (!selection) return null;

		let relPath: string;
		try {
			relPath = normalizeRelPath(
				await invoke("space_relativize_path", { abs_path: selection }),
			);
		} catch (cause) {
			const message =
				cause instanceof Error
					? cause.message
					: "Could not resolve folder path.";
			await showMessage(message, {
				title: "Invalid folder location",
				kind: "warning",
			});
			continue;
		}

		if (parentDir(relPath) !== normalizedParentDir) {
			await showMessage(`Choose a location inside ${locationLabel}.`, {
				title: "Invalid folder location",
				kind: "warning",
			});
			continue;
		}

		const name = basename(relPath);
		const validationError = validateFolderName(name, siblingNames);
		if (validationError) {
			await showMessage(validationError, {
				title: "Invalid folder name",
				kind: "warning",
			});
			continue;
		}

		return name;
	}
}
