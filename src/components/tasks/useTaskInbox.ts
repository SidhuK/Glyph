import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEditorContext } from "../../contexts/EditorContext";
import { useSpace } from "../../contexts/SpaceContext";
import { type InboxTask, type TaskEdit, invoke } from "../../lib/tauri";

// Update reminder labels without rereading every note on each clock tick.
const REMINDER_REFRESH_MS = 30_000;

export function useTaskInbox() {
	const { spacePath } = useSpace();
	const { getCurrentMarkdown } = useEditorContext();
	const { t } = useTranslation("shell");
	const client = useQueryClient();
	const queryKey = ["task-inbox", spacePath];
	const query = useQuery({
		queryKey,
		queryFn: () => {
			if (!spacePath) throw new Error(t("taskInbox.loadFailed"));
			return invoke("task_inbox_list", { space_path: spacePath });
		},
		enabled: spacePath !== null,
	});
	const clock = useQuery({
		queryKey: ["task-inbox-clock"],
		queryFn: () => Date.now(),
		initialData: Date.now,
		refetchInterval: REMINDER_REFRESH_MS,
	});
	const update = useMutation({
		mutationFn: async ({ task, edit }: { task: InboxTask; edit: TaskEdit }) => {
			if (!spacePath) throw new Error(t("taskInbox.updateFailed"));
			const outcome = await invoke("task_inbox_update", {
				request: {
					space_path: spacePath,
					note_path: task.note_path,
					etag: task.etag,
					start: task.start,
					edit,
					// The backend compares this buffer to disk while holding the note lock.
					editor_markdown: getCurrentMarkdown(task.note_path),
				},
			}).catch((error: unknown) => {
				const key =
					error instanceof Error && error.message === "task_inbox:unsaved"
						? "taskInbox.saveFailed"
						: "taskInbox.updateFailed";
				throw new Error(t(key));
			});
			switch (outcome.kind) {
				case "saved":
					return;
				case "index_failed":
					throw new Error(t("taskInbox.indexFailed"));
				default: {
					const unexpected: never = outcome;
					return unexpected;
				}
			}
		},
		onSettled: () => client.invalidateQueries({ queryKey }),
	});
	return { query, update, now: clock.data };
}
