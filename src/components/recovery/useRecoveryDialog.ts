import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorContext } from "../../contexts/EditorContext";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type RecoveryPreview, type RecoverySnapshotId, invoke } from "../../lib/tauri";
import { toast } from "../../lib/toast";
import { parsePreview, parseSnapshots } from "./recoveryData";

type Selection =
	| { kind: "notes" }
	| { kind: "versions"; path: string; selectedId: RecoverySnapshotId | null };

export function useRecoveryDialog({
	spacePath,
	initialPath,
	onClose,
}: {
	spacePath: string;
	initialPath: string | null;
	onClose: () => void;
}) {
	const { t } = useTranslation("editor");
	const { hasUnsavedChanges, getCurrentMarkdown } = useEditorContext();
	const queryClient = useQueryClient();
	const [selection, setSelection] = useState<Selection>(() =>
		initialPath === null
			? { kind: "notes" }
			: { kind: "versions", path: initialPath, selectedId: null },
	);
	const path = selection.kind === "versions" ? selection.path : null;
	const selectedId = selection.kind === "versions" ? selection.selectedId : null;
	const [deletedOnly, setDeletedOnly] = useState(false);
	const [search, setSearch] = useState("");
	const history = useQuery({
		queryKey: ["recovery", spacePath, path],
		queryFn: async () =>
			parseSnapshots(await invoke("recovery_list", { space_path: spacePath, path })),
		staleTime: 0,
	});
	const preview = useQuery({
		queryKey: ["recovery", spacePath, "preview", selectedId],
		queryFn:
			selectedId === null
				? skipToken
				: async () =>
						parsePreview(
							await invoke("recovery_preview", { space_path: spacePath, id: selectedId }),
						),
		staleTime: 0,
		gcTime: 0,
		retry: false,
		refetchOnWindowFocus: false,
	});
	const restore = useMutation({
		mutationFn: async (snapshot: RecoveryPreview) => {
			const editorText = getCurrentMarkdown(snapshot.path);
			const savedText = snapshot.current.kind === "present" ? snapshot.current.text : null;
			// Do not save unrelated notes or recreate a deleted draft before restoring it.
			if (hasUnsavedChanges() || (editorText !== null && editorText !== savedText)) {
				throw new Error("recovery_unsaved");
			}
			await invoke("recovery_restore", {
				space_path: spacePath,
				id: snapshot.id,
				expected_path: snapshot.path,
				expected_etag: snapshot.current.kind === "present" ? snapshot.current.etag : null,
			});
		},
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["recovery", spacePath] });
			toast.success(t("recovery.restored"));
			onClose();
		},
	});
	const snapshots = useMemo(() => {
		const needle = search.toLocaleLowerCase();
		return (history.data ?? []).filter(
			(snapshot) =>
				(!deletedOnly || snapshot.deleted) && snapshot.path.toLocaleLowerCase().includes(needle),
		);
	}, [history.data, deletedOnly, search]);
	const error = restore.error ?? preview.error ?? history.error;
	const message = error ? extractErrorMessage(error) : "";
	const messages: Record<string, string | undefined> = {
		recovery_conflict: t("recovery.conflict"),
		recovery_space_changed: t("recovery.spaceChanged"),
		recovery_unsaved: t("recovery.saveFailed"),
		recovery_invalid_response: t("recovery.invalidResponse"),
		recovery_index_failed: t("recovery.indexFailed"),
	};
	const errorMessage = messages[message] ?? message;
	const navigate = (nextPath: string | null) => {
		setSelection(
			nextPath === null
				? { kind: "notes" }
				: { kind: "versions", path: nextPath, selectedId: null },
		);
		setSearch("");
		restore.reset();
	};
	const setSelectedId = (id: RecoverySnapshotId | null) => {
		setSelection((current) =>
			current.kind === "versions" ? { ...current, selectedId: id } : current,
		);
	};
	return {
		path,
		selectedId,
		setSelectedId,
		deletedOnly,
		setDeletedOnly,
		search,
		setSearch,
		history,
		preview,
		restore,
		snapshots,
		errorMessage,
		navigate,
	};
}
