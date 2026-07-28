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

function policyForDialogResult(result: string): ImportConflictPolicy | null {
	switch (result) {
		case "Yes":
			return "keep_both";
		case "No":
			return "replace";
		case "Cancel":
			return "skip";
		default:
			return null;
	}
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
			const dialogResult = await message(
				t("import.conflictMessage", { count: result.conflict_count }),
				{
					title: t("import.conflictTitle"),
					kind: "warning",
					buttons: {
						yes: t("import.keepBoth"),
						no: t("import.replace"),
						cancel: t("import.skip"),
					},
				},
			);
			return policyForDialogResult(dialogResult);
		},
		[t],
	);

	const importPathsInto = useCallback(
		async (sourcePaths: string[], targetDir: string) => {
			if (sourcePaths.length === 0) return;
			try {
				let result = await invoke("space_import_paths", {
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
				if (result.status !== "imported") return;

				await loadDir(targetDir, true);
				if (result.imported_count === 0) {
					toast.info(t("import.noneImported"));
				} else {
					toast.success(t("import.success", { count: result.imported_count }));
				}
				if (result.markdown_paths.length === 1) {
					const markdownPath = result.markdown_paths[0];
					if (markdownPath) await openWorkspaceFile(markdownPath);
				}
			} catch (error) {
				await showImportError(error);
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
