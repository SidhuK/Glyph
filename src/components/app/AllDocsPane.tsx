import { Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	formatDistanceToNow,
	isSameDay,
	isSameMonth,
	isSameWeek,
	startOfToday,
	subDays,
} from "date-fns";
import { m, useReducedMotion } from "motion/react";
import { memo, useMemo, useState } from "react";
import { normalizeInlineMarkdown } from "../../lib/markdownUtils";
import {
	loadAllDocs,
	navigationQueryKeys,
	prefetchNote,
} from "../../lib/navigationPrefetch";
import type { AllDocsItem } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { formatDatabaseTagLabel } from "../database/databaseTagLabel";
import { springPresets } from "../ui/animations";

interface AllDocsPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
	title?: string;
	folderPrefix?: string | null;
	emptyMessage?: string;
	initialNotes?: AllDocsItem[] | null;
}

function normalizeFolderPrefix(value: string | null): string | null {
	if (typeof value !== "string") return null;
	const normalized = value
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
	return normalized || null;
}

function titleFromPath(notePath: string): string {
	const fileName = notePath.split("/").pop() ?? notePath;
	return fileName.replace(/\.md$/i, "");
}

function folderLabel(notePath: string): string {
	const parts = notePath.split("/").filter(Boolean);
	if (parts.length <= 1) return "Workspace root";
	return parts.slice(0, -1).join(" / ");
}

type PreviewLineKind = "heading" | "quote" | "list" | "code" | "body";

type PreviewLine = {
	kind: PreviewLineKind;
	text: string;
};

function previewLines(preview: string, title: string): PreviewLine[] {
	const lines = preview.replace(/\r\n?/g, "\n").split("\n");
	const parsed: PreviewLine[] = [];
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
			if (text) parsed.push({ kind: "code", text });
			continue;
		}

		const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
		if (headingMatch?.[1]) {
			const text = normalizeInlineMarkdown(headingMatch[1]);
			if (text) parsed.push({ kind: "heading", text });
			continue;
		}

		const quoteMatch = line.match(/^>\s?(.*)$/);
		if (quoteMatch?.[1]) {
			const text = normalizeInlineMarkdown(quoteMatch[1]);
			if (text) parsed.push({ kind: "quote", text });
			continue;
		}

		const taskMatch = line.match(
			/^(?:(?:[-*+]|\d+\.)\s+)?\[(?: |x|X)\]\s+(.*)$/,
		);
		if (taskMatch?.[1]) {
			const text = normalizeInlineMarkdown(taskMatch[1]);
			if (text) parsed.push({ kind: "list", text });
			continue;
		}

		const listMatch = line.match(/^(?:[-*+]|\d+\.)\s+(.*)$/);
		if (listMatch?.[1]) {
			const text = normalizeInlineMarkdown(listMatch[1]);
			if (text) parsed.push({ kind: "list", text });
			continue;
		}

		const text = normalizeInlineMarkdown(line);
		if (text) parsed.push({ kind: "body", text });
	}

	const filtered = parsed.filter((line) => {
		const lower = line.text.toLowerCase();
		const lowerTitle = title.trim().toLowerCase();
		return !(lowerTitle && lower.startsWith(lowerTitle));
	});

	return filtered;
}

function updatedTimeframe(iso: string): string {
	try {
		return formatDistanceToNow(new Date(iso), { addSuffix: true })
			.replace(/^about\s+/i, "")
			.replace(/\s+ago$/i, "")
			.replace(/^in\s+/i, "");
	} catch {
		return "recently";
	}
}

type AllDocsSection = {
	id: string;
	label: string;
	notes: AllDocsItem[];
};

function sectionForDate(iso: string): AllDocsSection["id"] {
	const today = startOfToday();
	const yesterday = subDays(today, 1);

	try {
		const date = new Date(iso);
		if (Number.isNaN(date.getTime())) return "earlier";
		if (isSameDay(date, today)) return "today";
		if (isSameDay(date, yesterday)) return "yesterday";
		if (isSameWeek(date, today, { weekStartsOn: 1 })) return "this-week";
		if (isSameMonth(date, today)) return "this-month";
		return "earlier";
	} catch {
		return "earlier";
	}
}

const SECTION_ORDER: Array<{ id: AllDocsSection["id"]; label: string }> = [
	{ id: "today", label: "Today" },
	{ id: "yesterday", label: "Yesterday" },
	{ id: "this-week", label: "This Week" },
	{ id: "this-month", label: "This Month" },
	{ id: "earlier", label: "Earlier" },
];

export const AllDocsPane = memo(function AllDocsPane({
	onOpenFile,
	title = "All Notes",
	folderPrefix = null,
	emptyMessage = "No notes yet. Create one to get started.",
	initialNotes = null,
}: AllDocsPaneProps) {
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
	const queryClient = useQueryClient();
	const normalizedFolderPrefix = useMemo(
		() => normalizeFolderPrefix(folderPrefix),
		[folderPrefix],
	);
	const notesQuery = useQuery({
		queryKey: navigationQueryKeys.allDocsList(normalizedFolderPrefix),
		queryFn: () => loadAllDocs(normalizedFolderPrefix),
		initialData: initialNotes ?? undefined,
	});
	const notes = notesQuery.data ?? [];

	useTauriEvent("notes:external_changed", () => {
		void queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.allDocsList(normalizedFolderPrefix),
		});
	});

	const countLabel = useMemo(() => {
		const count = notes.length;
		return `${count} ${count === 1 ? "note" : "notes"}`;
	}, [notes.length]);
	const sections = useMemo<AllDocsSection[]>(() => {
		const buckets = new Map<string, AllDocsItem[]>();
		for (const note of notes) {
			const id = sectionForDate(note.updated);
			const existing = buckets.get(id);
			if (existing) existing.push(note);
			else buckets.set(id, [note]);
		}
		return SECTION_ORDER.map((section) => ({
			id: section.id,
			label: section.label,
			notes: buckets.get(section.id) ?? [],
		})).filter((section) => section.notes.length > 0);
	}, [notes]);
	const emptyStateMessage = useMemo(() => {
		if (notes.length === 0) {
			return emptyMessage;
		}
		return "No notes found.";
	}, [emptyMessage, notes.length]);

	if (notesQuery.isLoading) {
		return <div className="databaseLoadingState">Loading all docs…</div>;
	}

	if (notesQuery.error) {
		return (
			<div className="databaseLoadingState">
				Could not load docs:{" "}
				{notesQuery.error instanceof Error
					? notesQuery.error.message
					: String(notesQuery.error)}
			</div>
		);
	}

	return (
		<section className="allDocsPane">
			<div className="allDocsHeader">
				<div className="allDocsTitleGroup">
					<div>
						<h1 className="allDocsTitle">{title}</h1>
					</div>
				</div>
				<div className="allDocsHeaderControls">
					<p className="allDocsCountBadge">{countLabel}</p>
				</div>
			</div>
			<div className="allDocsSections">
				{notes.length === 0 ? (
					<div className="databaseLoadingState">{emptyStateMessage}</div>
				) : null}
				{sections.map((section, sectionIndex) => (
					<section key={section.id} className="allDocsSection">
						<div className="allDocsSectionHeader">
							<h2 className="allDocsSectionTitle">{section.label}</h2>
							<span className="allDocsSectionCount">
								{section.notes.length}
							</span>
						</div>
						<div className="allDocsGrid">
							{section.notes.map((note, index) => {
								const noteTitle =
									note.title.trim() || titleFromPath(note.note_path);
								const preview = previewLines(note.preview, noteTitle);
								const visibleTags = note.tags.slice(0, 1);
								const extraTagCount = Math.max(
									note.tags.length - visibleTags.length,
									0,
								);
								const notePath = folderLabel(note.note_path);
								const animationIndex = sectionIndex * 12 + index;

								return (
									<m.button
										key={note.note_path}
										type="button"
										className="allDocsCard"
										data-state={
											selectedNotePath === note.note_path
												? "selected"
												: undefined
										}
										aria-label={`Open ${noteTitle}`}
										onClick={() => setSelectedNotePath(note.note_path)}
										onMouseEnter={() => prefetchNote(note.note_path)}
										onFocus={() => prefetchNote(note.note_path)}
										onDoubleClick={() => void onOpenFile(note.note_path)}
										onKeyDown={(event) => {
											if (event.key === "Enter") {
												event.preventDefault();
												void onOpenFile(note.note_path);
												return;
											}
											if (event.key === " ") {
												event.preventDefault();
												setSelectedNotePath(note.note_path);
											}
										}}
										initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
										animate={{ opacity: 1, y: 0 }}
										transition={
											shouldReduceMotion
												? { duration: 0 }
												: {
														...springPresets.snappy,
														delay: Math.min(animationIndex * 0.02, 0.18),
													}
										}
										title="Double-click to open note"
									>
										<div className="allDocsCardSurface">
											{preview.length > 0 ? (
												<div className="allDocsCardPreview">
													{preview.map((line, lineIndex) => (
														<div
															key={`${note.note_path}:preview:${lineIndex}`}
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
											{visibleTags.length > 0 ? (
												<div className="allDocsCardTags">
													{visibleTags.map((tag) => (
														<span
															key={`${note.note_path}:${tag}`}
															className="databaseBoardTag"
														>
															<HugeiconsIcon
																icon={Tag01Icon}
																className="databaseTagPillIcon"
																size={11}
																strokeWidth={1.2}
															/>
															{formatDatabaseTagLabel(tag)}
														</span>
													))}
													{extraTagCount > 0 ? (
														<span className="databaseBoardTag is-muted">
															+{extraTagCount}
														</span>
													) : null}
												</div>
											) : null}
										</div>
										<div className="allDocsCardCaption">
											<span className="allDocsCardTitle" title={noteTitle}>
												{noteTitle}
											</span>
											<div className="allDocsCardMetaRow">
												<span
													className="allDocsCardPath"
													title={note.note_path}
												>
													{notePath}
												</span>
												<span className="allDocsCardTime">
													{updatedTimeframe(note.updated)}
												</span>
											</div>
										</div>
									</m.button>
								);
							})}
						</div>
					</section>
				))}
			</div>
		</section>
	);
});
