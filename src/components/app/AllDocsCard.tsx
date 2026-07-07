import { m } from "motion/react";
import type { KeyboardEvent } from "react";
import { useHoverPrefetch } from "../../hooks/useHoverPrefetch";
import { normalizeInlineMarkdown } from "../../lib/markdownUtils";
import { prefetchNote } from "../../lib/navigationPrefetch";
import type {
	AllDocsItem,
	FileTreeAppearance,
	NoteTaskSummary,
} from "../../lib/tauri";
import type { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import {
	DatabaseNoteAppearanceIcon,
	databaseNoteAppearanceStyle,
} from "../database/DatabaseNoteAppearanceIcon";
import type { springPresets } from "../ui/animations";

export function titleFromPath(notePath: string): string {
	const fileName = notePath.split("/").pop() ?? notePath;
	return fileName.replace(/\.md$/i, "");
}

type PreviewLineKind = "heading" | "quote" | "task" | "list" | "code" | "body";

export type PreviewLine = {
	key: string;
	kind: PreviewLineKind;
	text: string;
};

function pushPreviewLine(
	parsed: PreviewLine[],
	kind: PreviewLineKind,
	text: string,
) {
	parsed.push({ key: `${kind}:${parsed.length}:${text}`, kind, text });
}

export function previewLines(preview: string, title: string): PreviewLine[] {
	const lines = preview.replace(/\r\n?/g, "\n").split("\n");
	const parsed: PreviewLine[] = [];
	const normalizedTitle = normalizeInlineMarkdown(title).trim().toLowerCase();
	let inFence = false;

	for (const raw of lines) {
		const line = raw.trim();
		if (!line) continue;
		if (/^```/.test(line)) {
			inFence = !inFence;
			continue;
		}

		if (inFence) {
			const text = normalizeInlineMarkdown(line);
			if (text) pushPreviewLine(parsed, "code", text);
			continue;
		}

		const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
		if (headingMatch?.[1]) {
			const text = normalizeInlineMarkdown(headingMatch[1]);
			if (text) pushPreviewLine(parsed, "heading", text);
			continue;
		}

		const quoteMatch = line.match(/^>\s?(.*)$/);
		if (quoteMatch?.[1]) {
			const text = normalizeInlineMarkdown(quoteMatch[1]);
			if (text) pushPreviewLine(parsed, "quote", text);
			continue;
		}

		const taskMatch = line.match(
			/^(?:(?:[-*+]|\d+\.)\s+)?\[(?: |x|X)\]\s+(.*)$/,
		);
		if (taskMatch?.[1]) {
			const text = normalizeInlineMarkdown(taskMatch[1]);
			if (text) pushPreviewLine(parsed, "task", text);
			continue;
		}

		const listMatch = line.match(/^(?:[-*+]|\d+\.)\s+(.*)$/);
		if (listMatch?.[1]) {
			const text = normalizeInlineMarkdown(listMatch[1]);
			if (text) pushPreviewLine(parsed, "list", text);
			continue;
		}

		const text = normalizeInlineMarkdown(line);
		if (text) pushPreviewLine(parsed, "body", text);
	}

	const filtered = parsed.filter((line) => {
		const normalizedLine = normalizeInlineMarkdown(line.text)
			.trim()
			.toLowerCase();
		return !(normalizedTitle && normalizedLine === normalizedTitle);
	});

	return filtered;
}

export interface AllDocsCardProps {
	notePath: string;
	noteAppearance?: FileTreeAppearance | null;
	title: string;
	preview: PreviewLine[];
	taskSummary: NoteTaskSummary | undefined;
	taskCount: number;
	selected: boolean;
	animationIndex: number;
	shouldReduceMotion: boolean;
	springPreset: typeof springPresets.snappy;
	TaskProgressComponent: typeof TaskProgressIndicator;
	onSelect: () => void;
	onPrefetch?: () => void;
	onOpen: () => void;
}

type PreparedAllDocsCardProps = Omit<
	AllDocsCardProps,
	"shouldReduceMotion" | "springPreset" | "TaskProgressComponent"
>;

export interface PrepareAllDocsCardPropsArgs {
	note: AllDocsItem;
	index: number;
	sectionIndex: number;
	selectedNotePath: string | null;
	taskSummariesByPath?: Record<string, NoteTaskSummary>;
	selectNote: (notePath: string) => void;
	onOpenFile: (relPath: string) => Promise<void>;
}

export function prepareAllDocsCardProps({
	note,
	index,
	sectionIndex,
	selectedNotePath,
	taskSummariesByPath = {},
	selectNote,
	onOpenFile,
}: PrepareAllDocsCardPropsArgs): PreparedAllDocsCardProps {
	const noteTitle = note.title.trim() || titleFromPath(note.note_path);
	const taskSummary = taskSummariesByPath[note.note_path] ?? undefined;
	return {
		notePath: note.note_path,
		title: noteTitle,
		preview: previewLines(note.preview, noteTitle),
		taskSummary,
		taskCount: taskSummary?.total_count ?? 0,
		selected: selectedNotePath === note.note_path,
		animationIndex: sectionIndex * 12 + index,
		onSelect: () => selectNote(note.note_path),
		onPrefetch: () => prefetchNote(note.note_path),
		onOpen: () => void onOpenFile(note.note_path),
	};
}

export function AllDocsCard({
	notePath,
	noteAppearance = null,
	title,
	preview,
	taskSummary,
	taskCount,
	selected,
	animationIndex,
	shouldReduceMotion,
	springPreset,
	TaskProgressComponent,
	onSelect,
	onPrefetch,
	onOpen,
}: AllDocsCardProps) {
	const { cancelHoverPrefetch, hoverPrefetchProps } = useHoverPrefetch(() => {
		onPrefetch?.();
	});
	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "Enter") {
			event.preventDefault();
			cancelHoverPrefetch();
			onOpen();
			return;
		}
		if (event.key === " ") {
			event.preventDefault();
			cancelHoverPrefetch();
			onSelect();
		}
	};
	const noteAppearanceStyle = databaseNoteAppearanceStyle(
		notePath,
		noteAppearance,
	);

	return (
		<m.button
			type="button"
			className="allDocsCard"
			data-state={selected ? "selected" : undefined}
			aria-label={`Select ${title}. Press Enter to open.`}
			aria-pressed={selected}
			onClick={() => {
				cancelHoverPrefetch();
				onSelect();
			}}
			{...hoverPrefetchProps}
			onFocus={onPrefetch}
			onDoubleClick={onOpen}
			onKeyDown={handleKeyDown}
			initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={
				shouldReduceMotion
					? { duration: 0 }
					: {
							...springPreset,
							delay: Math.min(animationIndex * 0.02, 0.18),
						}
			}
			title="Double-click to open note"
		>
			<div className="allDocsCardSurface">
				<div className="allDocsCardTop">
					<span
						className="allDocsCardTitle"
						title={title}
						style={noteAppearanceStyle}
					>
						<DatabaseNoteAppearanceIcon
							notePath={notePath}
							appearance={noteAppearance}
							className="allDocsCardTitleIcon"
							size="var(--icon-md)"
						/>
						{title}
					</span>
					{taskSummary && taskCount > 0 ? (
						<span className="allDocsCardTaskSummary is-top">
							<TaskProgressComponent
								summary={taskSummary}
								className="allDocsCardTaskProgress"
							/>
							<span className="allDocsCardTaskText">
								{taskSummary.completed_count}/{taskCount}
							</span>
						</span>
					) : null}
				</div>
				{preview.length > 0 ? (
					<div className="allDocsCardPreview">
						{preview.map((line) => (
							<div
								key={`${notePath}:preview:${line.key}`}
								className={`allDocsCardPreviewLine is-${line.kind}`}
							>
								{line.text}
							</div>
						))}
					</div>
				) : (
					<div className="allDocsCardPreview is-placeholder">
						No preview yet
					</div>
				)}
			</div>
		</m.button>
	);
}
