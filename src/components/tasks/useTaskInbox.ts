import type { SearchJumpRequest } from "../../lib/searchJump";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useEditorContext, useSpace } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import { normalizeInlineMarkdown } from "../../lib/markdownUtils";
import { taskQueryKey, tasksQueryOptions } from "../../lib/tasks";
import {
	type InboxTask,
	type TaskAction,
	type TaskUpdateResult,
	invoke,
} from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { toast } from "../../lib/toast";

export const taskViews = ["all", "today", "upcoming", "completed"] as const;
type TaskView = (typeof taskViews)[number];
const DAY_REFRESH_MS = 60_000;
function matchesView(task: InboxTask, view: TaskView, today: string) {
	if (view === "completed") return task.checked;
	if (task.checked) return false;
	if (view === "today") return task.due !== null && task.due <= today;
	if (view === "upcoming") return task.due !== null && task.due > today;
	return true;
}

export function useTaskInbox({
	onOpenFile,
	paneId,
}: {
	onOpenFile: (path: string, jump?: SearchJumpRequest) => Promise<void>;
	paneId: string;
}) {
	const { spacePath } = useSpace();
	const { saveAllEditors } = useEditorContext();
	const queryClient = useQueryClient();
	const { t } = useTranslation("shell");
	const query = useQuery(tasksQueryOptions(spacePath));
	const refresh = () =>
		queryClient.invalidateQueries({ queryKey: taskQueryKey });
	useTauriEvent("index:progress", (progress) => {
		if (progress.completed >= progress.total) void refresh();
	});
	const mutation = useMutation({
		mutationKey: [...taskQueryKey, "update"],
		mutationFn: async (request: {
			note_path: string;
			etag: string;
			action: TaskAction;
		}) => {
			await saveAllEditors();
			if (!spacePath) throw new Error(t("tasks.loadFailed"));
			return invoke("task_update", { ...request, space_path: spacePath });
		},
		onSuccess: async () => {
			await refresh();
		},
		onError: (error) => {
			const detail = extractErrorMessage(error);
			toast.error(t("tasks.updateFailed"), {
				description: detail.includes("conflict:")
					? t("tasks.conflict")
					: detail,
			});
			void refresh();
		},
	});
	const undo = (result: TaskUpdateResult) =>
		mutation.mutate({
			note_path: result.note_path,
			etag: result.etag,
			action: { kind: "restore", text: result.previous_text },
		});
	const update = async (task: InboxTask, action: TaskAction) => {
		try {
			const result = await mutation.mutateAsync({
				note_path: task.note_path,
				etag: task.etag,
				action,
			});
			toast.success(
				t(
					result.next_due
						? "tasks.repeated"
						: action.kind === "check"
							? action.checked
								? "tasks.completed"
								: "tasks.reopened"
							: "tasks.scheduled",
				),
				{
					action: { label: t("tasks.undo"), onClick: () => undo(result) },
				},
			);
			return true;
		} catch {
			return false;
		}
	};
	const [view, setView] = useState<TaskView>("all");
	const [search, setSearch] = useState("");
	const todayQuery = useQuery({
		queryKey: ["local-task-date"],
		queryFn: () => format(new Date(), "yyyy-MM-dd"),
		refetchInterval: DAY_REFRESH_MS,
	});
	const today = todayQuery.data ?? format(new Date(), "yyyy-MM-dd");
	const tasks = query.data ?? [];
	const filtered = useMemo(() => {
		const terms = search
			.toLocaleLowerCase()
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		return tasks
			.filter(
				(task) =>
					matchesView(task, view, today) &&
					terms.every((term) =>
						`${task.text} ${task.note_title} ${task.note_path} ${task.context}`
							.toLocaleLowerCase()
							.includes(term),
					),
			)
			.sort(
				(a, b) =>
					(a.due ?? "9999-99-99").localeCompare(b.due ?? "9999-99-99") ||
					a.note_title.localeCompare(b.note_title) ||
					a.note_path.localeCompare(b.note_path) ||
					a.start - b.start,
			);
	}, [tasks, search, view, today]);
	const openSource = useMutation({
		mutationFn: async (task: InboxTask) => {
			await saveAllEditors();
			const source = await invoke("space_read_text", { path: task.note_path });
			if (source.etag !== task.etag) {
				await refresh();
				throw new Error(t("tasks.conflict"));
			}
			await onOpenFile(task.note_path, {
				path: task.note_path,
				query: normalizeInlineMarkdown(task.text) || " ",
				matchIndex: 0,
				targetPaneId: paneId,
				taskLine: task.line,
				taskIndex: task.task_index,
			});
		},
		onError: (error) =>
			toast.error(t("tasks.openFailed"), {
				description: extractErrorMessage(error),
			}),
	});
	const counts = {
		all: tasks.filter((task) => matchesView(task, "all", today)).length,
		today: tasks.filter((task) => matchesView(task, "today", today)).length,
		upcoming: tasks.filter((task) => matchesView(task, "upcoming", today))
			.length,
		completed: tasks.filter((task) => matchesView(task, "completed", today))
			.length,
	};
	return {
		query,
		update,
		refresh,
		busy: mutation.isPending,
		view,
		setView,
		search,
		setSearch,
		today,
		filtered,
		counts,
		openSource,
	};
}
