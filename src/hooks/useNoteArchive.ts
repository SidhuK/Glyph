import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEditorContext, useSpace, useUILayoutContext } from "../contexts";
import { extractErrorMessage } from "../lib/errorUtils";
import { invoke } from "../lib/tauri";
import { toast } from "../lib/toast";

export function useArchivedPaths() {
	return useArchivedPathsForSpace(useSpace().spacePath);
}

export function useArchivedPathsForSpace(spacePath: string | null) {
	return useQuery({
		queryKey: ["navigation", "archived-paths", spacePath],
		queryFn: async () => new Set(await invoke("notes_archived_paths", {})),
		enabled: Boolean(spacePath),
	});
}

interface ArchiveVariables {
	paths: string[];
	archived: boolean;
	expectedSpace: string;
	showSuccess?: boolean;
}

export function useNoteArchive() {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const { archiveEnabled, settingsSpacePath } = useUILayoutContext();
	const enabled = archiveEnabled && settingsSpacePath === spacePath;
	const { prepareEditorsForExternalMutation } = useEditorContext();
	const client = useQueryClient();
	const mutation = useMutation({
		mutationFn: async ({ paths, archived, expectedSpace }: ArchiveVariables) => {
			if (!enabled) throw new Error(t("noteCollections.enableArchive"));
			if ((await invoke("space_get_current")) !== expectedSpace) {
				throw new Error(t("noteCollections.spaceChanged"));
			}
			if (!(await prepareEditorsForExternalMutation(paths))) {
				throw new Error(t("noteCollections.unsaved"));
			}
			return invoke("notes_set_archived", {
				paths,
				archived,
				expected_space: expectedSpace,
			});
		},
		onSuccess: async (result, variables): Promise<void> => {
			await client.invalidateQueries({ queryKey: ["navigation"] });
			if (result.failures.length) {
				toast.error(t("noteCollections.partialFailure"), {
					description: result.failures.map(({ path, error }) => `${path}: ${error}`).join("\n"),
				});
			}
			if (result.changed_paths.length && variables.showSuccess !== false) {
				toast.success(
					t(
						variables.archived ? "noteCollections.archivedCount" : "noteCollections.restoredCount",
						{
							count: result.changed_paths.length,
						},
					),
					{
						action: {
							label: t("noteCollections.undo"),
							onClick: () =>
								mutation.mutate({
									paths: result.changed_paths,
									archived: !variables.archived,
									expectedSpace: variables.expectedSpace,
								}),
						},
					},
				);
			}
		},
		onError: (error) =>
			toast.error(t("noteCollections.actionFailed"), {
				description: extractErrorMessage(error),
			}),
	});
	return {
		...mutation,
		enabled,
		setArchived: (paths: string[], archived: boolean) => {
			if (!spacePath || paths.length === 0) return;
			mutation.mutate({ paths, archived, expectedSpace: spacePath });
		},
	};
}
