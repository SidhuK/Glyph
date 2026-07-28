import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../lib/errorUtils";
import {
	type ImportConflictPolicy,
	type SpaceImportResult,
	invoke,
} from "../lib/tauri";
import { toast } from "../lib/toast";

interface UseFileImportOptions {
	loadDir: (dirPath: string, force?: boolean) => Promise<void>;
	openWorkspaceFile: (path: string) => Promise<void>;
}

function policyForDialogResult(
	result: string,
	keepBoth: string,
	replace: string,
	skip: string,
): ImportConflictPolicy | null {
	if (result === keepBoth || result === "Yes") return "keep_both";
	if (result === replace || result === "No") return "replace";
	if (result === skip || result === "Cancel") return "skip";
	return null;
}

export function useFileImport({
	loadDir,
	openWorkspaceFile,
}: UseFileImportOptions) {
	const { t } = useTranslation("shell");

	const showImportError = useCallback(
		async (error: unknown) => {
			const { message } = await import("@tauri-apps/plugin-dialog");
			await message(extractErrorMessage(error), {
				title: t("import.errorTitle"),
				kind: "error",
				buttons: "Ok",
			});
		},
		[t],
	);

	const resolveConflicts = useCallback(
		async (
			result: Extract<SpaceImportResult, { status: "conflicts" }>,
		): Promise<ImportConflictPolicy | null> => {
			const { message } = await import("@tauri-apps/plugin-dialog");
			const keepBoth = t("import.keepBoth");
			const replace = t("import.replace");
			const skip = t("import.skip");
			const dialogResult = await message(
				t("import.conflictMessage", { count: result.conflict_count }),
				{
					title: t("import.conflictTitle"),
					kind: "warning",
					buttons: {
						yes: keepBoth,
						no: replace,
						cancel: skip,
					},
				},
			);
			return policyForDialogResult(dialogResult, keepBoth, replace, skip);
		},
		[t],
	);

	const importPathsInto = useCallback(
		async (sourcePaths: string[], targetDir: string) => {
			if (sourcePaths.length === 0) return;

			let result: SpaceImportResult;
			try {
				result = await invoke("space_import_paths", {
					source_paths: sourcePaths,
					target_dir: targetDir,
					conflict_policy: null,
				});
				if (result.status === "conflicts") {
					const conflictPolicy = await resolveConflicts(result);
					if (!conflictPolicy) return;
					result = await invoke("space_import_paths", {
						source_paths: sourcePaths,
						target_dir: targetDir,
						conflict_policy: conflictPolicy,
					});
				}
			} catch (error) {
				await showImportError(error);
				return;
			}

			if (result.status !== "imported") return;

			if (result.imported_count === 0) {
				toast.info(t("import.noneImported"));
			} else {
				toast.success(t("import.success", { count: result.imported_count }));
			}

			try {
				await loadDir(targetDir, true);
				if (result.markdown_paths.length === 1) {
					const markdownPath = result.markdown_paths[0];
					if (markdownPath) await openWorkspaceFile(markdownPath);
				}
			} catch (error) {
				toast.error(extractErrorMessage(error));
			}
		},
		[loadDir, openWorkspaceFile, resolveConflicts, showImportError, t],
	);

	const importFilesInto = useCallback(
		async (targetDir: string) => {
			try {
				const { open } = await import("@tauri-apps/plugin-dialog");
				const selected = await open({
					title: t("import.filesTitle"),
					multiple: true,
					directory: false,
					filters: [
						{
							name: t("import.markdownFilter"),
							extensions: ["md", "markdown"],
						},
					],
				});
				if (!selected) return;
				await importPathsInto(selected, targetDir);
			} catch (error) {
				await showImportError(error);
			}
		},
		[importPathsInto, showImportError, t],
	);

	const importFolderInto = useCallback(
		async (targetDir: string) => {
			try {
				const { open } = await import("@tauri-apps/plugin-dialog");
				const selected = await open({
					title: t("import.folderTitle"),
					multiple: false,
					directory: true,
				});
				if (!selected) return;
				await importPathsInto([selected], targetDir);
			} catch (error) {
				await showImportError(error);
			}
		},
		[importPathsInto, showImportError, t],
	);

	return {
		importFilesInto,
		importFolderInto,
		importPathsInto,
	};
}
