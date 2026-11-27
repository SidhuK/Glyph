import { INLINE_TAG_PATTERN, isHexColorCode } from "@/components/editor/noteProperties/utils";
import type { TaskRecord } from "@/lib/tauri";
import { displayNameFromPath } from "@/utils/path";
import { stripInlineMarkdown } from "./inlineMarkdown";

const displayTitles = new WeakMap<TaskRecord, string>();

const CODE_SPAN_SPLIT = /(`[^`]+`)/;

function titleWithoutTags(title: string): string {
	return title
		.split(CODE_SPAN_SPLIT)
		.map((part, index) =>
			index % 2 === 1
				? part
				: part.replace(INLINE_TAG_PATTERN, (match, leading: string, name: string) =>
						isHexColorCode(name) ? match : leading,
					),
		)
		.join("");
}

export function taskDisplayTitle(record: TaskRecord): string {
	const cached = displayTitles.get(record);
	if (cached !== undefined) return cached;
	const display = stripInlineMarkdown(titleWithoutTags(record.title)).replace(/\s+/g, " ").trim();
	displayTitles.set(record, display);
	return display;
}

export function taskNoteTitle(record: Pick<TaskRecord, "note_title" | "note_path">): string {
	return record.note_title || displayNameFromPath(record.note_path);
}

export function notePathLabel(notePath: string): string {
	return notePath.replace(/\.md$/i, "");
}
