import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSpace, useUILayoutContext } from "@/contexts";
import { ensurePeriodNote } from "@/hooks/usePeriodNote";
import { extractErrorMessage } from "@/lib/errorUtils";
import { navigationQueryKeys } from "@/lib/navigationPrefetch";
import { getPeriodNotePath } from "@/lib/periodNotes";
import { invoke, type TaskPriority } from "@/lib/tauri";
import { toast } from "@/lib/toast";
import { displayNameFromPath } from "@/utils/path";

export type QuickAddTarget = { kind: "daily" } | { kind: "note"; path: string };

interface TaskCreateInput {
	target: QuickAddTarget;
	title: string;
	due: string | null;
	priority: TaskPriority | null;
}

interface TaskCreateVariables extends TaskCreateInput {
	spacePath: string;
}

export function useDailyNotePath(today: string): string | null {
	const { dailyNotesFolder } = useUILayoutContext();
	return dailyNotesFolder === null
		? null
		: getPeriodNotePath(dailyNotesFolder, { kind: "day", date: today });
}

export function useTaskCreate(today: string) {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const { dailyNotesFolder, periodNoteTemplates } = useUILayoutContext();
	const queryClient = useQueryClient();

	const resolveNotePath = async (variables: TaskCreateVariables): Promise<string> => {
		if (variables.target.kind === "note") return variables.target.path;
		if (dailyNotesFolder === null) throw new Error(t("tasks.quickAdd.noDailyFolder"));
		const notePath = await ensurePeriodNote({
			folder: dailyNotesFolder,
			period: { kind: "day", date: today },
			spacePath: variables.spacePath,
			templatePath: periodNoteTemplates.day,
			isCurrent: () => true,
		});
		if (!notePath) throw new Error(t("tasks.quickAdd.noDailyFolder"));
		return notePath;
	};

	const mutation = useMutation({
		mutationFn: async (variables: TaskCreateVariables) => {
			const notePath = await resolveNotePath(variables);
			const result = await invoke("tasks_create", {
				request: {
					space_path: variables.spacePath,
					note_path: notePath,
					title: variables.title,
					due: variables.due,
					priority: variables.priority,
				},
			});
			if (result.outcome.kind === "conflict") throw new Error(t("tasks.conflictChanged"));
			if (result.outcome.kind === "index_failed")
				toast.warning(t("tasks.indexFailed"), { description: t("tasks.indexFailedDetail") });
			return result;
		},
		onSuccess: (result) =>
			toast.success(t("tasks.quickAdd.added", { note: displayNameFromPath(result.note_path) })),
		onError: (error) =>
			toast.error(t("tasks.quickAdd.failed"), { description: extractErrorMessage(error) }),
		onSettled: (_data, _error, variables) =>
			queryClient.invalidateQueries({ queryKey: navigationQueryKeys.tasks(variables.spacePath) }),
	});

	const createTask = async (input: TaskCreateInput): Promise<boolean> => {
		if (!spacePath) return false;
		try {
			await mutation.mutateAsync({ ...input, spacePath });
			return true;
		} catch {
			return false;
		}
	};

	return { createTask, isCreating: mutation.isPending };
}
