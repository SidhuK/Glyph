import type { TFunction } from "i18next";
import { formatTagLabel } from "@/components/editor/noteProperties/utils";
import type { DateDisplayFormat } from "@/lib/dateDisplayFormat";
import { displayNameFromPath } from "@/utils/path";
import { compactAbsoluteDate } from "../model/taskDates";
import { priorityFilterLabelKey } from "../model/taskPriority";
import type { TaskFilterState } from "../viewState/taskViewState";
import type { TaskFilterKind } from "./taskFilterKinds";

interface SummaryContext {
	t: TFunction<"shell">;
	locale: string;
	dateFormat: DateDisplayFormat;
}

function listSummary(labels: readonly string[], t: TFunction<"shell">): string {
	const [first] = labels;
	if (first === undefined) return "";
	return labels.length === 1
		? first
		: t("tasks.filters.andMore", { first, count: labels.length - 1 });
}

export function filterValueSummary(
	kind: TaskFilterKind,
	filters: TaskFilterState,
	{ t, locale, dateFormat }: SummaryContext,
): string {
	switch (kind) {
		case "note":
			return listSummary(filters.note_paths.map(displayNameFromPath), t);
		case "folder":
			return listSummary(filters.folder_prefixes, t);
		case "tag":
			return listSummary(filters.tags.map(formatTagLabel), t);
		case "status":
			return listSummary(
				filters.statuses.map((status) => t(`tasks.status.${status}`)),
				t,
			);
		case "priority":
			return listSummary(
				[
					...filters.priorities.map((priority) => t(priorityFilterLabelKey(priority))),
					...(filters.include_no_priority ? [t("tasks.priority.none")] : []),
				],
				t,
			);
		case "dueBefore":
			return filters.due_before ? compactAbsoluteDate(filters.due_before, dateFormat, locale) : "";
		case "dueAfter":
			return filters.due_after ? compactAbsoluteDate(filters.due_after, dateFormat, locale) : "";
		case "dueNone":
			return "";
	}
}
