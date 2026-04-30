import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
	NoteTaskSummary,
	WorkspaceDatabasePreviewContext,
} from "../../lib/tauri";
import { NotePropertiesPanel } from "../editor/NotePropertiesPanel";
import type { TOCHeading } from "../editor/hooks/useTableOfContents";
import {
	dispatchMarkdownLinkClick,
	dispatchWikiLinkClick,
} from "../editor/markdown/editorEvents";
import type { NoteInlineEditorMode } from "../editor/types";
import { TaskProgressIndicator } from "../tasks/TaskProgressIndicator";

interface SidebarBacklinkItem {
	id: string;
	label: string;
}

interface LinkedNoteItem {
	id: string;
	label: string;
	kind: "wiki" | "markdown";
}

interface NotesInfoSidebarProps {
	open: boolean;
	mode: NoteInlineEditorMode;
	zenModeActive: boolean;
	hasError: boolean;
	relPath: string;
	frontmatter: string | null;
	onFrontmatterChange: (nextFrontmatter: string | null) => void;
	stats: {
		words: number;
		characters: number;
		readingTime: string;
	};
	taskSummary: NoteTaskSummary;
	tocHeadings: TOCHeading[];
	tocActiveId: string | null;
	onSelectHeading: (heading: TOCHeading) => void;
	backlinks: SidebarBacklinkItem[];
	linkedNotes: LinkedNoteItem[];
	previewContext: WorkspaceDatabasePreviewContext | null;
	lastSavedMtimeMs: number | null;
	lineCount: number;
	utf8SizeBytes: number;
	saveLabel: string;
	onClose: () => void;
}

function formatMetadataDate(value: string | null | undefined): string {
	if (!value) return "—";
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return value;
	return parsed.toLocaleString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function formatFileSize(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "—";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let size = bytes;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex += 1;
	}
	const fractionDigits =
		unitIndex === 0 ? 0 : size >= 100 ? 0 : size >= 10 ? 1 : 2;
	return `${size.toLocaleString(undefined, {
		maximumFractionDigits: fractionDigits,
	})} ${units[unitIndex]}`;
}

export function NotesInfoSidebar({
	open,
	mode,
	zenModeActive,
	hasError,
	relPath,
	frontmatter,
	onFrontmatterChange,
	stats,
	taskSummary,
	tocHeadings,
	tocActiveId,
	onSelectHeading,
	backlinks,
	linkedNotes,
	previewContext,
	lastSavedMtimeMs,
	lineCount,
	utf8SizeBytes,
	saveLabel,
	onClose,
}: NotesInfoSidebarProps) {
	const [host, setHost] = useState<HTMLElement | null>(null);

	useEffect(() => {
		if (typeof document === "undefined") return;
		setHost(document.getElementById("notes-info-sidebar-root"));
	}, []);

	if (!open || mode === "plain" || zenModeActive || hasError) return null;

	const sidebar = (
		<aside className="notesInfoSidebarPanel" aria-label="Note info panel">
			<div className="markdownEditorInfoHeader">
				<button
					type="button"
					className="markdownEditorInfoClose"
					onClick={onClose}
					aria-label="Close info panel"
					title="Close info panel"
				>
					<span aria-hidden>×</span>
				</button>
			</div>
			<div className="markdownEditorInfoBody">
				<section className="markdownEditorInfoSection markdownEditorInfoSectionFrontmatter">
					<NotePropertiesPanel
						frontmatter={frontmatter}
						onChange={onFrontmatterChange}
					/>
				</section>

				<section className="markdownEditorInfoSection">
					<h3 className="markdownEditorInfoSectionLabel">Stats</h3>
					<div className="markdownEditorInfoRows">
						<div className="markdownEditorInfoRow">
							<span>Words</span>
							<strong>{stats.words.toLocaleString()}</strong>
						</div>
						<div className="markdownEditorInfoRow">
							<span>Characters</span>
							<strong>{stats.characters.toLocaleString()}</strong>
						</div>
						<div className="markdownEditorInfoRow">
							<span>Reading time</span>
							<strong>{stats.readingTime}</strong>
						</div>
					</div>
				</section>

				<section className="markdownEditorInfoSection">
					<h3 className="markdownEditorInfoSectionLabel">Tasks</h3>
					<div className="markdownEditorInfoTaskSummary">
						<TaskProgressIndicator summary={taskSummary} />
						<span>
							{taskSummary.completed_count.toLocaleString()} of{" "}
							{taskSummary.total_count.toLocaleString()} done
						</span>
					</div>
				</section>

				<section className="markdownEditorInfoSection">
					<h3 className="markdownEditorInfoSectionLabel">Outline</h3>
					{tocHeadings.length > 0 ? (
						<div className="markdownEditorInfoOutline">
							{tocHeadings.map((heading) => (
								<button
									key={heading.id}
									type="button"
									className="markdownEditorInfoOutlineItem"
									data-active={tocActiveId === heading.id ? "true" : undefined}
									data-level={heading.level}
									onClick={() => onSelectHeading(heading)}
									title={heading.text}
								>
									{heading.text}
								</button>
							))}
						</div>
					) : (
						<div className="markdownEditorInfoEmpty">
							No headings in this note yet.
						</div>
					)}
				</section>

				{backlinks.length > 0 ? (
					<section className="markdownEditorInfoSection">
						<h3 className="markdownEditorInfoSectionLabel">Backlinks</h3>
						<div className="markdownEditorInfoLinkList">
							{backlinks.map((item) => (
								<button
									key={item.id}
									type="button"
									className="wikiLink"
									data-target={item.id}
									onClick={() =>
										dispatchWikiLinkClick({
											raw: `[[${item.id}]]`,
											target: item.id,
											alias: null,
											anchorKind: "none",
											anchor: null,
											unresolved: false,
										})
									}
									title={item.id}
								>
									<span className="wikiLinkIcon" aria-hidden="true" />
									{item.label}
								</button>
							))}
						</div>
					</section>
				) : null}

				<section className="markdownEditorInfoSection">
					<h3 className="markdownEditorInfoSectionLabel">Linked notes</h3>
					{linkedNotes.length > 0 ? (
						<div className="markdownEditorInfoLinkList">
							{linkedNotes.map((item) => (
								<button
									key={`${item.kind}:${item.id}`}
									type="button"
									className="wikiLink"
									data-target={item.kind === "wiki" ? item.id : undefined}
									onClick={() => {
										if (item.kind === "wiki") {
											dispatchWikiLinkClick({
												raw: `[[${item.id}]]`,
												target: item.id,
												alias: null,
												anchorKind: "none",
												anchor: null,
												unresolved: false,
											});
											return;
										}
										dispatchMarkdownLinkClick({
											href: item.id,
											sourcePath: relPath,
										});
									}}
									title={item.id}
								>
									<span className="wikiLinkIcon" aria-hidden="true" />
									{item.label}
								</button>
							))}
						</div>
					) : (
						<div className="markdownEditorInfoEmpty">No linked notes.</div>
					)}
				</section>

				<section className="markdownEditorInfoSection">
					<h3 className="markdownEditorInfoSectionLabel">File info</h3>
					<div className="markdownEditorInfoRows">
						<div className="markdownEditorInfoRow">
							<span>Path</span>
							<span className="markdownEditorInfoPathValue">{relPath}</span>
						</div>
						<div className="markdownEditorInfoRow">
							<span>Modified</span>
							<strong>
								{formatMetadataDate(
									lastSavedMtimeMs
										? new Date(lastSavedMtimeMs).toISOString()
										: (previewContext?.updated ?? null),
								)}
							</strong>
						</div>
						<div className="markdownEditorInfoRow">
							<span>Created</span>
							<strong>{formatMetadataDate(previewContext?.created)}</strong>
						</div>
						<div className="markdownEditorInfoRow">
							<span>Lines</span>
							<strong>
								{(previewContext?.line_count ?? lineCount).toLocaleString()}
							</strong>
						</div>
						<div className="markdownEditorInfoRow">
							<span>Size</span>
							<strong>{formatFileSize(utf8SizeBytes)}</strong>
						</div>
						<div className="markdownEditorInfoRow">
							<span>Save status</span>
							<strong>{saveLabel}</strong>
						</div>
					</div>
				</section>
			</div>
		</aside>
	);

	return host ? createPortal(sidebar, host) : sidebar;
}
