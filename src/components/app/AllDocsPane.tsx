import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	isSameDay,
	isSameMonth,
	isSameWeek,
	startOfToday,
	subDays,
} from "date-fns";
import { m, useReducedMotion } from "motion/react";
import {
	type KeyboardEvent,
	memo,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useFileTreeContext } from "../../contexts";

import { useVirtualLoadMore } from "../../hooks/useLoadMoreTriggers";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { normalizeInlineMarkdown } from "../../lib/markdownUtils";
import {
	ALL_DOCS_PAGE_SIZE,
	loadAllDocsPage,
	navigationQueryKeys,
	prefetchNote,
} from "../../lib/navigationPrefetch";
import type {
	AllDocsItem,
	FileTreeAppearance,
	NoteTaskSummary,
} from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import {
	DatabaseNoteAppearanceIcon,
	databaseNoteAppearanceStyle,
} from "../database/DatabaseNoteAppearanceIcon";
import { springPresets } from "../ui/animations";
import { CanvasPaneAwait } from "./CanvasPaneAwait";

interface AllDocsPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
	initialNotes?: AllDocsItem[] | null;
}

function titleFromPath(notePath: string): string {
	const fileName = notePath.split("/").pop() ?? notePath;
	return fileName.replace(/\.md$/i, "");
}

type PreviewLineKind = "heading" | "quote" | "task" | "list" | "code" | "body";

type PreviewLine = {
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
		const lower = line.text.toLowerCase();
		const lowerTitle = title.trim().toLowerCase();
		return !(lowerTitle && lower.startsWith(lowerTitle));
	});

	return filtered;
}

type AllDocsSection = {
	id: string;
	label: string;
	notes: AllDocsItem[];
};

type VirtualAllDocsRow =
	| {
			id: string;
			kind: "header";
			label: string;
	  }
	| {
			id: string;
			kind: "cards";
			sectionIndex: number;
			rowIndex: number;
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

interface AllDocsCardProps {
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
	onPrefetch: () => void;
	onOpen: () => void;
}

type PreparedAllDocsCardProps = Omit<
	AllDocsCardProps,
	"shouldReduceMotion" | "springPreset" | "TaskProgressComponent"
>;

interface PrepareAllDocsCardPropsArgs {
	note: AllDocsItem;
	index: number;
	sectionIndex: number;
	selectedNotePath: string | null;
	taskSummariesByPath?: Record<string, NoteTaskSummary>;
	selectNote: (notePath: string) => void;
	onOpenFile: AllDocsPaneProps["onOpenFile"];
}

function prepareAllDocsCardProps({
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

function AllDocsCard({
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
	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		if (event.key === "Enter") {
			event.preventDefault();
			onOpen();
			return;
		}
		if (event.key === " ") {
			event.preventDefault();
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
			aria-label={`Open ${title}`}
			onClick={onSelect}
			onMouseEnter={onPrefetch}
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

export const AllDocsPane = memo(function AllDocsPane({
	onOpenFile,
	initialNotes = null,
}: AllDocsPaneProps) {
	const { itemAppearance } = useFileTreeContext();
	const shouldReduceMotion = useReducedMotion() ?? false;
	const paneRef = useRef<HTMLElement>(null);
	const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
	const [taskSummaryRefreshKey, setTaskSummaryRefreshKey] = useState(0);
	const [paneWidth, setPaneWidth] = useState(0);
	const queryClient = useQueryClient();
	const notesQuery = useInfiniteQuery({
		queryKey: navigationQueryKeys.allDocsPages(null),
		queryFn: ({ pageParam }) => {
			const offset = typeof pageParam === "number" ? pageParam : 0;
			return loadAllDocsPage(null, offset);
		},
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
		initialData: initialNotes
			? {
					pages: [
						{
							items: initialNotes.slice(0, ALL_DOCS_PAGE_SIZE),
							nextOffset:
								initialNotes.length >= ALL_DOCS_PAGE_SIZE
									? ALL_DOCS_PAGE_SIZE
									: null,
						},
					],
					pageParams: [0],
				}
			: undefined,
	});
	const notes = useMemo(
		() => notesQuery.data?.pages.flatMap((page) => page.items) ?? [],
		[notesQuery.data],
	);
	const notePaths = useMemo(() => notes.map((note) => note.note_path), [notes]);
	const taskSummariesByPath = useTaskSummariesForPaths(
		notePaths,
		true,
		taskSummaryRefreshKey,
	);
	useTauriEvent("notes:external_changed", () => {
		void queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.allDocs(),
		});
		setTaskSummaryRefreshKey((key) => key + 1);
	});

	useEffect(() => {
		const pane = paneRef.current;
		if (!pane) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			setPaneWidth(entry.contentRect.width);
		});
		observer.observe(pane);
		setPaneWidth(pane.clientWidth);
		return () => observer.disconnect();
	}, []);

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

	const columnCount = useMemo(() => {
		const minCardWidth = paneWidth <= 640 ? 144 : paneWidth <= 900 ? 160 : 184;
		const gap = 14;
		return Math.max(1, Math.floor((paneWidth + gap) / (minCardWidth + gap)));
	}, [paneWidth]);
	const virtualRows = useMemo<VirtualAllDocsRow[]>(() => {
		const rows: VirtualAllDocsRow[] = [];
		for (const [sectionIndex, section] of sections.entries()) {
			rows.push({
				id: `header:${section.id}`,
				kind: "header",
				label: section.label,
			});
			for (
				let startIndex = 0, rowIndex = 0;
				startIndex < section.notes.length;
				startIndex += columnCount, rowIndex += 1
			) {
				rows.push({
					id: `cards:${section.id}:${rowIndex}`,
					kind: "cards",
					sectionIndex,
					rowIndex,
					notes: section.notes.slice(startIndex, startIndex + columnCount),
				});
			}
		}
		return rows;
	}, [columnCount, sections]);
	const cardEstimate = useMemo(() => {
		if (paneWidth <= 0) return 200;
		const gap = 14;
		const width = (paneWidth - gap * (columnCount - 1)) / columnCount;
		const minHeight = paneWidth <= 640 ? 176 : 184;
		return Math.max(minHeight, width) + gap;
	}, [columnCount, paneWidth]);
	const rowVirtualizer = useVirtualizer<HTMLElement, HTMLDivElement>({
		count: virtualRows.length,
		estimateSize: (index) =>
			virtualRows[index]?.kind === "header" ? 32 : cardEstimate,
		getScrollElement: () => paneRef.current,
		overscan: 5,
	});
	const virtualItems = rowVirtualizer.getVirtualItems();
	useVirtualLoadMore({
		hasMore: notesQuery.hasNextPage,
		isLoading: notesQuery.isFetchingNextPage,
		onLoadMore: notesQuery.fetchNextPage,
		virtualItems,
		totalItems: virtualRows.length,
		remainingItems: 4,
	});

	if (notesQuery.isLoading) {
		return <CanvasPaneAwait variant="all-docs" />;
	}

	if (notesQuery.error) {
		return (
			<div className="databaseLoadingState">
				Could not load all notes:{" "}
				{notesQuery.error instanceof Error
					? notesQuery.error.message
					: String(notesQuery.error)}
			</div>
		);
	}

	return (
		<section ref={paneRef} className="allDocsPane">
			<header className="allDocsHeader">
				<div className="allDocsHeadingGroup">
					<h1 className="allDocsTitle">All Notes</h1>
				</div>
			</header>
			<div
				className="allDocsSections is-virtualized"
				style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
			>
				{notes.length === 0 ? (
					<div className="databaseLoadingState">
						No notes yet. Create one to get started.
					</div>
				) : null}
				{virtualItems.map((virtualRow) => {
					const row = virtualRows[virtualRow.index];
					if (!row) return null;
					return (
						<div
							key={virtualRow.key}
							data-index={virtualRow.index}
							ref={(node) => rowVirtualizer.measureElement(node)}
							className="allDocsVirtualRow"
							style={{ transform: `translateY(${virtualRow.start}px)` }}
						>
							{row.kind === "header" ? (
								<div className="allDocsSectionHeader">
									<h2 className="allDocsSectionTitle">{row.label}</h2>
								</div>
							) : (
								<div className="allDocsGrid">
									{row.notes.map((note, index) => {
										const cardProps = prepareAllDocsCardProps({
											note,
											index: row.rowIndex * columnCount + index,
											sectionIndex: row.sectionIndex,
											selectedNotePath,
											taskSummariesByPath,
											selectNote: setSelectedNotePath,
											onOpenFile,
										});

										return (
											<AllDocsCard
												key={note.note_path}
												{...cardProps}
												noteAppearance={itemAppearance[note.note_path] ?? null}
												shouldReduceMotion={shouldReduceMotion}
												springPreset={springPresets.snappy}
												TaskProgressComponent={TaskProgressIndicator}
											/>
										);
									})}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</section>
	);
});
