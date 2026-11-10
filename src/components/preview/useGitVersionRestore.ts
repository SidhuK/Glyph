import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type GitHistoryCommit, invoke } from "../../lib/tauri";
import { toast } from "../../lib/toast";

interface RestoredVersion {
	relPath: string;
	commit: GitHistoryCommit;
	/** The note as it was before the restore, kept so the restore can be undone. */
	previousText: string;
	restoredText: string;
}

/**
 * Restores the open note to a saved version and lets the user undo it. The write goes
 * through the normal note save, so the index and the open editor follow.
 */
export function useGitVersionRestore(relPath: string, saveCurrentEdits: () => Promise<boolean>) {
	const { t } = useTranslation("editor");
	const [restoredState, setRestoredState] = useState<RestoredVersion | null>(null);
	const restored = restoredState?.relPath === relPath ? restoredState : null;
	const onError = (error: unknown) => toast.error(extractErrorMessage(error));

	const restore = useMutation({
		mutationFn: async (commit: GitHistoryCommit): Promise<RestoredVersion> => {
			if (!(await saveCurrentEdits())) throw new Error(t("infoSidebar.history.restoreUnsaved"));
			const [current, restoredText] = await Promise.all([
				invoke("space_read_text", { path: relPath }),
				invoke("git_history_note_text", { path: relPath, commit }),
			]);
			await invoke("space_write_text", {
				path: relPath,
				text: restoredText,
				base_mtime_ms: current.mtime_ms,
			});
			return { relPath, commit, previousText: current.text, restoredText };
		},
		onSuccess: setRestoredState,
		onError,
	});

	const undo = useMutation({
		mutationFn: async (version: RestoredVersion) => {
			if (!(await saveCurrentEdits())) throw new Error(t("infoSidebar.history.restoreUnsaved"));
			const current = await invoke("space_read_text", { path: version.relPath });
			if (current.text !== version.restoredText) {
				throw new Error(t("infoSidebar.history.undoChanged"));
			}
			await invoke("space_write_text", {
				path: version.relPath,
				text: version.previousText,
				base_mtime_ms: current.mtime_ms,
			});
		},
		onSuccess: () => setRestoredState(null),
		onError,
	});

	return {
		restoredCommit: restored?.commit ?? null,
		pending: restore.isPending || undo.isPending,
		restore: restore.mutate,
		undo: () => {
			if (restored) undo.mutate(restored);
		},
	};
}

export type GitVersionRestore = ReturnType<typeof useGitVersionRestore>;
