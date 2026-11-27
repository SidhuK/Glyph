import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { File01Icon } from "@hugeicons/core-free-icons";
import type { TaskRecord } from "@/lib/tauri";
import { notePathLabel, taskNoteTitle } from "../model/taskTitle";

export function TaskNoteChip({ record }: { record: TaskRecord }) {
	return (
		<span className="tasksNoteChip" title={notePathLabel(record.note_path)}>
			<HugeiconsIcon icon={File01Icon} size="var(--icon-xs)" aria-hidden="true" />
			<span className="tasksNoteChipLabel">{taskNoteTitle(record)}</span>
		</span>
	);
}
