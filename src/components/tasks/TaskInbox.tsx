import type { SearchJumpRequest } from "../../lib/searchJump";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { TaskList } from "./TaskList";
import { taskViews, useTaskInbox } from "./useTaskInbox";

export function TaskInbox({
	onOpenFile,
	paneId,
}: {
	onOpenFile: (path: string, jump?: SearchJumpRequest) => Promise<void>;
	paneId: string;
}) {
	const { spacePath } = useSpace();
	return (
		<TaskInboxContent key={spacePath} onOpenFile={onOpenFile} paneId={paneId} />
	);
}
function TaskInboxContent({
	onOpenFile,
	paneId,
}: {
	onOpenFile: (path: string, jump?: SearchJumpRequest) => Promise<void>;
	paneId: string;
}) {
	const { t } = useTranslation("shell");
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
	return (
		<section className="taskInbox" aria-label={t("tasks.title")}>
			<header className="taskInboxHeader">
				<div>
					<h1>{t("tasks.title")}</h1>
				</div>
				<Button
					variant="ghost"
					size="sm"
					disabled={query.isFetching || busy}
					onClick={() => {
						void refresh();
					}}
				>
					{t("tasks.refresh")}
				</Button>
			</header>
			<div className="taskInboxToolbar">
				<div className="taskFilters">
					<div
						className="taskViews"
						role="group"
						aria-label={t("tasks.filter")}
					>
						{taskViews.map((value) => (
							<button
								type="button"
								key={value}
								className={`taskView${view === value ? " is-active" : ""}`}
								aria-pressed={view === value}
								onClick={() => setView(value)}
							>
								{t(`tasks.views.${value}`)}
								<span className="taskCount">{counts[value]}</span>
							</button>
						))}
					</div>
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
			) : filtered.length === 0 ? (
				<div className="taskInboxMessage" role="status">
					<h2>{t(search ? "tasks.noResults" : `tasks.empty.${view}`)}</h2>
					<p>
						{t(
							search
								? "tasks.searchHint"
								: view === "all"
									? "tasks.emptyHint"
									: view === "today"
										? "tasks.todayHint"
										: view === "upcoming"
											? "tasks.upcomingHint"
											: "tasks.completedHint",
						)}
					</p>
					{search ? (
						<Button variant="ghost" onClick={() => setSearch("")}>
							{t("tasks.clearSearch")}
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
					key={`${view}:${search}`}
					tasks={filtered}
					today={today}
					busy={busy}
					onUpdate={update}
					onOpen={(task) => openSource.mutate(task)}
				/>
			)}
		</section>
	);
}
