import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEditorContext, useSpace } from "../contexts";
import { extractErrorMessage } from "../lib/errorUtils";
import { type DatabaseColumn, invoke } from "../lib/tauri";
import { toast } from "../lib/toast";

const STATUS_PROPERTY_COLUMN = {
	id: "property:status",
	type: "property",
	label: "Status",
	visible: true,
	property_key: "status",
	property_kind: "status",
} as const satisfies DatabaseColumn;

interface SetNoteStatusVariables {
	path: string;
	status: string;
	expectedSpace: string;
}

export function useSetNoteStatus() {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const { prepareEditorsForExternalMutation } = useEditorContext();
	const client = useQueryClient();
	const mutation = useMutation({
		mutationFn: async ({ path, status, expectedSpace }: SetNoteStatusVariables) => {
			const assertSameSpace = async () => {
				if ((await invoke("space_get_current")) !== expectedSpace) {
					throw new Error(t("noteCollections.spaceChanged"));
				}
			};
			await assertSameSpace();
			if (!(await prepareEditorsForExternalMutation([path]))) {
				throw new Error(t("noteCollections.unsaved"));
			}
			await assertSameSpace();
			return invoke("databases_update_cell", {
				note_path: path,
				column: STATUS_PROPERTY_COLUMN,
				value: { kind: "status", value_text: status, value_bool: null, value_list: [] },
			});
		},
		onSuccess: () => client.invalidateQueries({ queryKey: ["navigation"] }),
		onError: (error) =>
			toast.error(t("fileTree.statusUpdateFailed"), {
				description: extractErrorMessage(error),
			}),
	});
	return (path: string, status: string) => {
		if (!spacePath) return;
		mutation.mutate({ path, status, expectedSpace: spacePath });
	};
}
