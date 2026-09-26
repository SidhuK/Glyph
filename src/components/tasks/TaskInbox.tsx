import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getTodayDateString } from "../../lib/dailyNotes";
import type { InboxTask } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";
import { TaskInboxRow } from "./TaskInboxRow";
import { TaskScheduleForm } from "./TaskScheduleForm";
import { useTaskInbox } from "./useTaskInbox";

const FILTERS = ["open", "overdue", "reminders", "completed"] as const;

export default function TaskInbox({ onOpenNote }: { onOpenNote: (path: string) => void }) {
	const { t } = useTranslation("shell");
	const { query, update, now } = useTaskInbox();
	const [filter, setFilter] = useState<(typeof FILTERS)[number]>("open");
	const [search, setSearch] = useState("");
	// Retain the reviewed revision while editing, even if the query refreshes.
	const [editing, setEditing] = useState<InboxTask | null>(null);
	const scroll = useRef<HTMLDivElement>(null);
	const today = getTodayDateString(new Date(now));
	const tasks = useMemo(() => {
		const needle = search.toLocaleLowerCase();
		return (query.data ?? [])
			.filter((task) => {
				if (filter === "completed" ? !task.checked : task.checked) return false;
				if (filter === "overdue" && (task.schedule.kind !== "dated" || task.schedule.due >= today))
					return false;
				if (
					filter === "reminders" &&
					(!task.schedule.reminder || Date.parse(task.schedule.reminder) > now)
				)
					return false;
				return `${task.text} ${task.note_path}`.toLocaleLowerCase().includes(needle);
			})
			.sort((a, b) => {
				const dueA = a.schedule.kind === "dated" ? a.schedule.due : "9999-12-31";
				const dueB = b.schedule.kind === "dated" ? b.schedule.due : "9999-12-31";
				return (
					dueA.localeCompare(dueB) || a.note_path.localeCompare(b.note_path) || a.start - b.start
				);
			});
	}, [query.data, search, filter, today, now]);
	const virtualizer = useVirtualizer({
		count: tasks.length,
		getScrollElement: () => scroll.current,
		estimateSize: () => 120,
		getItemKey: (index) => {
			const task = tasks[index];
			return task ? `${task.note_path}:${task.start}` : index;
		},
		overscan: 5,
	});
	return (
		<div className="flex min-h-0 flex-col gap-3">
			<div className="flex flex-wrap gap-2">
				{FILTERS.map((value) => (
					<Button
						key={value}
						size="sm"
						variant={filter === value ? "secondary" : "ghost"}
						aria-pressed={filter === value}
						onClick={() => setFilter(value)}
					>
						{t(`taskInbox.${value}`)}
					</Button>
				))}
				<Button
					size="sm"
					variant="outline"
					disabled={query.isFetching}
					onClick={() => void query.refetch()}
				>
					{t("taskInbox.refresh")}
				</Button>
			</div>
			<input
				type="search"
				className="rounded border p-2"
				value={search}
				aria-label={t("taskInbox.search")}
				placeholder={t("taskInbox.search")}
				onChange={(event) => setSearch(event.target.value)}
			/>
			{query.isPending ? <p role="status">{t("taskInbox.loading")}</p> : null}
			{query.isError ? <p role="alert">{t("taskInbox.loadFailed")}</p> : null}
			{update.isError ? <p role="alert">{update.error.message}</p> : null}
			{editing ? (
				<section className="rounded border p-3" aria-label={t("taskInbox.schedule")}>
					<div className="flex items-center justify-between gap-2">
						<p className="truncate text-sm">{editing.text || t("taskInbox.untitled")}</p>
						<Button
							size="sm"
							variant="ghost"
							disabled={update.isPending}
							onClick={() => setEditing(null)}
						>
							{t("taskInbox.close")}
						</Button>
					</div>
					<TaskScheduleForm
						key={`${editing.note_path}:${editing.etag}:${editing.start}`}
						schedule={editing.schedule}
						disabled={update.isPending}
						onSave={(schedule) =>
							update.mutate(
								{ task: editing, edit: { kind: "schedule", schedule } },
								{ onSuccess: () => setEditing(null) },
							)
						}
					/>
				</section>
			) : null}
			{query.isSuccess && tasks.length === 0 ? (
				<p className="py-8 text-center text-muted-foreground">{t("taskInbox.empty")}</p>
			) : null}
			<div ref={scroll} className="min-h-0 overflow-auto" style={{ height: "min(45vh, 600px)" }}>
				<div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
					{virtualizer.getVirtualItems().map((row) => {
						const task = tasks[row.index];
						if (!task) return null;
						return (
							<div
								key={row.key}
								data-index={row.index}
								ref={virtualizer.measureElement}
								className="absolute top-0 left-0 w-full border-b py-3"
								style={{ transform: `translateY(${row.start}px)` }}
							>
								<TaskInboxRow
									task={task}
									now={now}
									today={today}
									disabled={update.isPending}
									onUpdate={update.mutate}
									onEdit={setEditing}
									onOpenNote={onOpenNote}
								/>
							</div>
						);
					})}
				</div>
			</div>
			<p className="text-xs text-muted-foreground">{t("taskInbox.help")}</p>
		</div>
	);
}
