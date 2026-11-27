import type { UseQueryResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "@/lib/errorUtils";

export function TasksQueryState({
	query,
}: {
	query: Pick<UseQueryResult, "error" | "refetch" | "isFetching">;
}) {
	const { t } = useTranslation("shell");
	if (!query.error)
		return <div className="tasksLoading" aria-busy="true" aria-label={t("tasks.loading")} />;
	return (
		<div className="tasksError" role="alert">
			<p>{t("tasks.loadError", { message: extractErrorMessage(query.error) })}</p>
			<button
				type="button"
				className="tasksSectionAction"
				disabled={query.isFetching}
				onClick={() => void query.refetch()}
			>
				{t("tasks.retry")}
			</button>
		</div>
	);
}
