import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowDown01Icon, Calendar03Icon, File01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { useSpace } from "@/contexts";
import { useRecentFiles } from "@/hooks/useRecentFiles";
import { displayNameFromPath } from "@/utils/path";
import { useSpaceNotes } from "../data/useSpaceNotes";
import type { QuickAddTarget } from "../data/useTaskCreate";
import { TaskSearchList, type TaskSearchItem, searchItemIcon } from "../menus/TaskSearchList";
import { notePathLabel } from "../model/taskTitle";
import { useTasks } from "../TasksContext";

const RECENT_NOTE_LIMIT = 8;
const NOTE_RESULT_LIMIT = 40;
const DAILY_ITEM_ID = "\u0000daily";

function isMarkdownPath(path: string): boolean {
	return /\.md$/i.test(path);
}

function noteItem(path: string, selected: boolean): TaskSearchItem {
	return {
		id: path,
		label: displayNameFromPath(path),
		detail: notePathLabel(path),
		selected,
		icon: searchItemIcon(File01Icon),
	};
}

function TargetSearch({ onDone }: { onDone: () => void }) {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const { quickAddTarget, setQuickAddTarget, dailyNotePath } = useTasks();
	const [query, setQuery] = useState("");
	const { recentFiles } = useRecentFiles(spacePath, RECENT_NOTE_LIMIT);
	const needle = query.trim().toLowerCase();
	const notes = useSpaceNotes(needle.length > 0);
	const selectedPath = quickAddTarget?.kind === "note" ? quickAddTarget.path : null;
	const paths = needle
		? (notes.data ?? [])
				.filter((path) => path.toLowerCase().includes(needle))
				.slice(0, NOTE_RESULT_LIMIT)
		: recentFiles
				.map((file) => file.path)
				.filter((path) => isMarkdownPath(path) && path !== dailyNotePath);
	const items: TaskSearchItem[] = [
		...(dailyNotePath && !needle
			? [
					{
						id: DAILY_ITEM_ID,
						label: t("tasks.quickAdd.dailyNote"),
						detail: notePathLabel(dailyNotePath),
						selected: quickAddTarget?.kind === "daily",
						icon: searchItemIcon(Calendar03Icon),
					},
				]
			: []),
		...paths.map((path) => noteItem(path, path === selectedPath)),
	];
	const choose = (id: string) => {
		const target: QuickAddTarget =
			id === DAILY_ITEM_ID ? { kind: "daily" } : { kind: "note", path: id };
		setQuickAddTarget(target);
		onDone();
	};
	return (
		<TaskSearchList
			label={t("tasks.quickAdd.targetSearch")}
			placeholder={t("tasks.quickAdd.targetPlaceholder")}
			emptyLabel={notes.isFetching ? t("tasks.quickAdd.searching") : t("tasks.quickAdd.noNotes")}
			query={query}
			onQueryChange={setQuery}
			items={items}
			onSelect={choose}
		/>
	);
}

export function QuickAddTargetPicker() {
	const { t } = useTranslation("shell");
	const { quickAddTarget } = useTasks();
	const [open, setOpen] = useState(false);
	const label =
		quickAddTarget === null
			? t("tasks.quickAdd.chooseNote")
			: quickAddTarget.kind === "daily"
				? t("tasks.quickAdd.dailyNote")
				: displayNameFromPath(quickAddTarget.path);
	return (
		<div className="tasksQuickAddTarget">
			<span>{t("tasks.quickAdd.addTo")}</span>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<button
							type="button"
							className="tasksQuickAddTargetButton"
							data-empty={quickAddTarget ? undefined : "true"}
						/>
					}
				>
					<span className="tasksQuickAddTargetName">{label}</span>
					<HugeiconsIcon icon={ArrowDown01Icon} size="var(--icon-xs)" aria-hidden="true" />
				</PopoverTrigger>
				<PopoverContent align="start" sideOffset={6} className="tasksPopover tasksTargetPopover">
					{open ? <TargetSearch onDone={() => setOpen(false)} /> : null}
				</PopoverContent>
			</Popover>
		</div>
	);
}
