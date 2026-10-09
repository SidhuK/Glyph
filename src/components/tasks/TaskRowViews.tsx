import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowRight01Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import type { TaskItem, TaskNoteGroup } from "../../lib/tauri";
import type { CssVars } from "../../lib/utils";
import { displayNameFromPath } from "../../utils/path";
import type { TaskRow } from "./buildTaskRows";
import { TaskNoteBreadcrumb } from "./TaskNoteBreadcrumb";
import { TaskNoteProgress } from "./TaskNoteProgress";

export interface TaskRowContext {
	/** Trimmed, lowercased search text; empty when not searching. */
	needle: string;
	/** Chosen folder scope; breadcrumbs show paths relative to it. */
	folderPrefix: string | null;
	onComplete: (group: TaskNoteGroup, item: TaskItem) => void;
	onCancel: (group: TaskNoteGroup, item: TaskItem) => void;
	onOpen: (notePath: string, heading: string | null) => void;
	onToggleCollapsed: (notePath: string) => void;
}

function Highlight({ text, needle }: { text: string; needle: string }) {
	const index = needle ? text.toLowerCase().indexOf(needle) : -1;
	if (index < 0) return text;
	return (
		<>
			{text.slice(0, index)}
			<mark className="tasksMatch">{text.slice(index, index + needle.length)}</mark>
			{text.slice(index + needle.length)}
		</>
	);
}

function noteTitle(group: TaskNoteGroup) {
	return group.title || displayNameFromPath(group.note_path);
}

export function TaskNoteRow({
	row,
	context,
}: {
	row: Extract<TaskRow, { kind: "note" }>;
	context: TaskRowContext;
}) {
	const { t } = useTranslation("shell");
	const { group, openCount, collapsed } = row;
	const title = noteTitle(group);
	return (
		<div className="tasksNoteRow" data-collapsed={collapsed ? "true" : undefined}>
			{context.needle ? (
				// Search shows matches inside every group, so there is nothing to toggle; keep the gutter.
				<span className="tasksChevron" aria-hidden="true" />
			) : (
				<button
					type="button"
					className="tasksChevron"
					aria-expanded={!collapsed}
					aria-label={t(collapsed ? "tasks.expandNote" : "tasks.collapseNote", { title })}
					onClick={() => context.onToggleCollapsed(group.note_path)}
				>
					<HugeiconsIcon icon={ArrowRight01Icon} size="var(--icon-sm)" />
				</button>
			)}
			<h2 className="tasksNoteTitleHeading">
				<button
					type="button"
					className="tasksNoteTitle"
					title={title}
					aria-label={t("tasks.openNote", { title })}
					onClick={() => context.onOpen(group.note_path, null)}
				>
					<Highlight text={title} needle={context.needle} />
				</button>
			</h2>
			<TaskNoteBreadcrumb notePath={group.note_path} folderPrefix={context.folderPrefix} />
			<TaskNoteProgress total={group.total_count} open={openCount} />
		</div>
	);
}

export function TaskHeadingRow({ text }: { text: string }) {
	return <div className="tasksHeadingRow">{text}</div>;
}

export function TaskItemRow({
	row,
	context,
}: {
	row: Extract<TaskRow, { kind: "task" }>;
	context: TaskRowContext;
}) {
	const { t } = useTranslation("shell");
	const { group, item, text, depth, completing } = row;
	const openLabel = t("tasks.openNote", { title: noteTitle(group) });
	const depthStyle: CssVars<"--task-depth"> = { "--task-depth": depth };
	const open = () => context.onOpen(group.note_path, item.heading);
	return (
		<div
			className="tasksTaskRow"
			data-completing={completing ? "true" : undefined}
			data-nested={depth > 0 ? "true" : undefined}
			style={depthStyle}
		>
			<label className="tasksCheckboxWrap">
				<input
					type="checkbox"
					className="tasksCheckbox"
					checked={completing}
					aria-label={t(completing ? "tasks.markNotDone" : "tasks.markDone", { task: text })}
					onChange={() =>
						completing ? context.onCancel(group, item) : context.onComplete(group, item)
					}
				/>
			</label>
			<button type="button" className="tasksTaskText" title={text} onClick={open}>
				<span className="tasksTaskTextClamp">
					<Highlight text={text} needle={context.needle} />
				</span>
			</button>
			<button
				type="button"
				className="tasksOpenButton"
				tabIndex={-1}
				aria-label={openLabel}
				title={openLabel}
				onClick={open}
			>
				<HugeiconsIcon icon={ArrowRight02Icon} size="var(--icon-sm)" />
			</button>
		</div>
	);
}
