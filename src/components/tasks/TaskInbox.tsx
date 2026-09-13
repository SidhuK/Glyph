import {
	Calendar03Icon,
	CheckmarkCircle02Icon,
	CheckListIcon,
	RefreshIcon,
	Sun01Icon,
	ArrowLeft01Icon,
} from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import { HugeiconsIcon } from "../HugeiconsIcon";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { TaskList } from "./TaskList";
import { taskViews, useTaskInbox } from "./useTaskInbox";

const viewIcons = {
	all: CheckListIcon,
	today: Sun01Icon,
	upcoming: Calendar03Icon,
	completed: CheckmarkCircle02Icon,
};

export function TaskInbox({
	onOpenFile,
	paneId,
}: Parameters<typeof useTaskInbox>[0]) {
	const { spacePath } = useSpace();
	return (
		<TaskInboxContent key={spacePath} onOpenFile={onOpenFile} paneId={paneId} />
	);
}
function TaskInboxContent({
	onOpenFile,
	paneId,
}: Parameters<typeof useTaskInbox>[0]) {
	const { t } = useTranslation("shell");
	const [selectedNote, setSelectedNote] = useState<string | null>(null);
	const {
		query,
		update,
		busy,
		refresh,
		view,
		setView,
		search,
		setSearch,
		today,
		filtered,
		counts,
		openSource,
	} = useTaskInbox({ onOpenFile, paneId });
	const visibleTasks = selectedNote
		? filtered.filter((task) => task.note_path === selectedNote)
		: filtered;
	const selectedTask = query.data?.find(
		(task) => task.note_path === selectedNote,
	);
	return (
		<section className="taskInbox" aria-label={t("tasks.title")}>
			<header className="taskInboxHeader">
				<div>
					<h1>{t("tasks.title")}</h1>
				</div>
				<Button
					variant="ghost"
					size="sm"
					aria-label={t("tasks.refresh")}
					title={t("tasks.refresh")}
					disabled={query.isFetching || busy}
					onClick={() => {
						void refresh();
					}}
				>
					<HugeiconsIcon icon={RefreshIcon} size="var(--icon-sm)" />
				</Button>
			</header>
			<div className="taskInboxToolbar">
				<div className="taskViews" role="group" aria-label={t("tasks.filter")}>
					{taskViews.map((value) => (
						<button
							type="button"
							key={value}
							className={`taskView${view === value ? " is-active" : ""}`}
							aria-pressed={view === value}
							onClick={() => {
								setSelectedNote(null);
								setView(value);
							}}
						>
							<HugeiconsIcon icon={viewIcons[value]} size="var(--icon-sm)" />
							{t(`tasks.views.${value}`)}
							<span className="taskCount">{counts[value]}</span>
						</button>
					))}
				</div>
				<Input
					type="search"
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder={t("tasks.search")}
					aria-label={t("tasks.search")}
					className="taskSearch"
				/>
			</div>
			{selectedNote ? (
				<div className="taskNoteNavigation">
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setSelectedNote(null)}
					>
						<HugeiconsIcon icon={ArrowLeft01Icon} size="var(--icon-sm)" />{" "}
						{t("tasks.backToOverview")}
					</Button>
					<h2>{selectedTask?.note_title ?? selectedNote}</h2>
					<Button
						variant="ghost"
						size="sm"
						disabled={!selectedTask || busy}
						onClick={() => {
							if (selectedTask) openSource.mutate(selectedTask);
						}}
					>
						{t("tasks.openNote")}
					</Button>
				</div>
			) : null}
			{query.isError ? (
				<div className="taskInboxMessage" role="alert">
					<h2>{t("tasks.loadFailed")}</h2>
					<p>{extractErrorMessage(query.error)}</p>
					<Button
						variant="outline"
						onClick={() => {
							void refresh();
						}}
					>
						{t("tasks.retry")}
					</Button>
				</div>
			) : query.isPending ? (
				<div className="taskInboxMessage" role="status">
					{t("tasks.loading")}
				</div>
			) : visibleTasks.length === 0 ? (
				<div className="taskInboxMessage" role="status">
					<h2>
						{t(
							search
								? "tasks.noResults"
								: selectedNote
									? "tasks.noteComplete"
									: `tasks.empty.${view}`,
						)}
					</h2>
					<p>
						{t(
							search
								? "tasks.searchHint"
								: selectedNote
									? "tasks.noteCompleteHint"
									: `tasks.${view}Hint`,
						)}
					</p>
					{search ? (
						<Button variant="ghost" onClick={() => setSearch("")}>
							{t("tasks.clearSearch")}
						</Button>
					) : selectedNote ? (
						<Button variant="ghost" onClick={() => setSelectedNote(null)}>
							{t("tasks.backToOverview")}
						</Button>
					) : view !== "all" ? (
						<Button variant="ghost" onClick={() => setView("all")}>
							{t("tasks.showAll")}
						</Button>
					) : (
						<code>- [ ] {t("tasks.example")}</code>
					)}
				</div>
			) : (
				<TaskList
					key={`${view}:${search}:${selectedNote}`}
					tasks={visibleTasks}
					groupUnscheduled={view === "all" && !selectedNote}
					onSelectNote={setSelectedNote}
					today={today}
					busy={busy}
					onUpdate={update}
					onOpen={(task) => openSource.mutate(task)}
				/>
			)}
		</section>
	);
}
