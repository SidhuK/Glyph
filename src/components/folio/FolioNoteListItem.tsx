import { memo, useEffect, useMemo, useRef, useState } from "react";
import { databaseValueToneStyle } from "../../lib/database/palette";
import { normalizeInlineMarkdown } from "../../lib/markdownUtils";
import type { AllDocsItem, NoteTaskSummary } from "../../lib/tauri";
import { basename, parentDir } from "../../utils/path";
import { formatDatabaseTagLabel } from "../database/databaseTagLabel";
import { splitEditableFileName } from "../filetree/fileTreeItemHelpers";
import { TaskProgressIndicator } from "../tasks/TaskProgressIndicator";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../ui/shadcn/context-menu";

interface FolioNoteListItemProps {
	note: AllDocsItem;
	selected: boolean;
	onOpen: (path: string) => void;
	onOpenInNewTab: (path: string) => void;
	onPrefetch: (path: string) => void;
	onRename: (path: string) => void;
	onDelete: (path: string) => void;
	onFocus: () => void;
	taskSummary?: NoteTaskSummary | null;
	isRenaming?: boolean;
	onCommitRename: (
		path: string,
		nextName: string,
	) => Promise<boolean> | boolean;
	onCancelRename: () => void;
}

function titleFromPath(notePath: string): string {
	return basename(notePath).replace(/\.md$/i, "") || "Untitled";
}

function dateLabel(iso: string): string {
	try {
		return new Intl.DateTimeFormat(undefined, {
			month: "short",
			day: "numeric",
		}).format(new Date(iso));
	} catch {
		return "";
	}
}

function previewText(preview: string, title: string): string {
	const lowerTitle = title.trim().toLowerCase();
	const lines = preview.replace(/\r\n?/g, "\n").split("\n");
	const previewLines: string[] = [];

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || /^#\s+/.test(line)) continue;

		const withoutMarkdownPrefix = line
			.replace(/^#{2,6}\s+/, "")
			.replace(/^>\s?/, "")
			.replace(/^(?:[-*+]|\d+\.)\s+/, "")
			.replace(/^\[(?: |x|X)\]\s+/, "");
		const normalized = normalizeInlineMarkdown(withoutMarkdownPrefix);
		if (!normalized) continue;

		if (lowerTitle && normalized.toLowerCase().startsWith(lowerTitle)) {
			const withoutTitle = normalized.slice(title.length).trim();
			if (withoutTitle) previewLines.push(withoutTitle);
			continue;
		}

		previewLines.push(normalized);
	}

	return previewLines.join(" ") || "No preview";
}

function FolioRenameInput({
	initialName,
	relPath,
	fileStem,
	fileExt,
	onCommitRename,
	onCancelRename,
}: {
	initialName: string;
	relPath: string;
	fileStem: string;
	fileExt: string;
	onCommitRename: (
		path: string,
		nextName: string,
	) => Promise<boolean> | boolean;
	onCancelRename: () => void;
}) {
	const [draftName, setDraftName] = useState(initialName);
	const submittedRef = useRef(false);
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	const commitRename = async () => {
		if (submittedRef.current) return;
		submittedRef.current = true;
		const nextStem = draftName.trim() || fileStem || initialName.trim();
		const renamed = await onCommitRename(relPath, `${nextStem}${fileExt}`);
		if (!renamed) {
			submittedRef.current = false;
		}
	};

	return (
		<input
			ref={inputRef}
			className="folioNoteRenameInput"
			value={draftName}
			placeholder="Untitled"
			onChange={(event) => setDraftName(event.target.value)}
			onBlur={() => void commitRename()}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					void commitRename();
					return;
				}
				if (event.key === "Escape") {
					event.preventDefault();
					submittedRef.current = true;
					onCancelRename();
				}
			}}
		/>
	);
}

export const FolioNoteListItem = memo(function FolioNoteListItem({
	note,
	selected,
	onOpen,
	onOpenInNewTab,
	onPrefetch,
	onRename,
	onDelete,
	onFocus,
	taskSummary = null,
	isRenaming = false,
	onCommitRename,
	onCancelRename,
}: FolioNoteListItemProps) {
	const title = note.title.trim() || titleFromPath(note.note_path);
	const { stem: fileStem, ext: fileExt } = splitEditableFileName(
		basename(note.note_path),
	);
	const preview = useMemo(() => {
		return previewText(note.preview, title);
	}, [note.preview, title]);
	const updated = dateLabel(note.updated);
	const visibleTags = note.tags.slice(0, 2);
	const hiddenTagCount = Math.max(0, note.tags.length - visibleTags.length);
	const folder = parentDir(note.note_path);
	const taskProgress =
		taskSummary && taskSummary.total_count > 0 ? (
			<TaskProgressIndicator
				summary={taskSummary}
				className="folioNoteTaskProgress"
			/>
		) : null;
	const rowDetails = (
		<>
			<span className="folioNotePreview">{preview}</span>
			<span className="folioNoteFooter">
				<span className="folioNoteTags">
					{visibleTags.length > 0 ? (
						visibleTags.map((tag) => (
							<span
								key={tag}
								className="databaseCellPill folioNoteTag"
								style={databaseValueToneStyle(tag)}
								title={formatDatabaseTagLabel(tag)}
							>
								{formatDatabaseTagLabel(tag)}
							</span>
						))
					) : (
						<span className="folioNoteFolder">{folder || "No folder"}</span>
					)}
					{hiddenTagCount > 0 ? (
						<span className="databaseCellPill databaseCellPillMore folioNoteTag">
							+{hiddenTagCount}
						</span>
					) : null}
				</span>
				<span className="folioNoteDates">{updated}</span>
			</span>
		</>
	);

	return (
		<li className="folioNoteListItem">
			{isRenaming ? (
				<div
					className="folioNoteRow"
					data-state={selected ? "selected" : "idle"}
					data-folio-note-path={note.note_path}
					title={note.note_path}
				>
					<span className="folioNoteRowTop">
						<FolioRenameInput
							key={`${note.note_path}:${fileStem}`}
							initialName={fileStem || titleFromPath(note.note_path)}
							relPath={note.note_path}
							fileStem={fileStem}
							fileExt={fileExt}
							onCommitRename={onCommitRename}
							onCancelRename={onCancelRename}
						/>
						{taskProgress}
					</span>
					{rowDetails}
				</div>
			) : (
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<button
							type="button"
							className="folioNoteRow"
							data-state={selected ? "selected" : "idle"}
							data-folio-note-path={note.note_path}
							aria-current={selected ? "page" : undefined}
							onClick={(event) => {
								if (event.metaKey || event.ctrlKey) {
									onOpenInNewTab(note.note_path);
									return;
								}
								onOpen(note.note_path);
							}}
							onDoubleClick={() => onOpenInNewTab(note.note_path)}
							onAuxClick={(event) => {
								if (event.button === 1) onOpenInNewTab(note.note_path);
							}}
							onMouseEnter={() => onPrefetch(note.note_path)}
							onFocus={() => {
								onFocus();
								onPrefetch(note.note_path);
							}}
							title={note.note_path}
						>
							<span className="folioNoteRowTop">
								<span className="folioNoteTitle">{title}</span>
								{taskProgress}
							</span>
							{rowDetails}
						</button>
					</ContextMenuTrigger>
					<ContextMenuContent
						className="fileTreeCreateMenu"
						onCloseAutoFocus={(event) => event.preventDefault()}
					>
						<ContextMenuItem
							className="fileTreeCreateMenuItem"
							onSelect={() => onOpen(note.note_path)}
						>
							Open
						</ContextMenuItem>
						<ContextMenuItem
							className="fileTreeCreateMenuItem"
							onSelect={() => onOpenInNewTab(note.note_path)}
						>
							Open in New Tab
						</ContextMenuItem>
						<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
						<ContextMenuItem
							className="fileTreeCreateMenuItem"
							onSelect={() => onRename(note.note_path)}
						>
							Rename
						</ContextMenuItem>
						<ContextMenuItem
							variant="destructive"
							className="fileTreeCreateMenuItem"
							onSelect={() => onDelete(note.note_path)}
						>
							Delete
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			)}
		</li>
	);
});
