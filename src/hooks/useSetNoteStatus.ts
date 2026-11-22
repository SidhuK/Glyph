import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEditorContext } from "../contexts";
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
}

export function useSetNoteStatus() {
	const { t } = useTranslation("shell");
	const { prepareEditorsForExternalMutation } = useEditorContext();
	const client = useQueryClient();
	const mutation = useMutation({
		mutationFn: async ({ path, status }: SetNoteStatusVariables) => {
			if (!(await prepareEditorsForExternalMutation([path]))) {
				throw new Error(t("noteCollections.unsaved"));
			}
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
	return (path: string, status: string) => mutation.mutate({ path, status });
}
