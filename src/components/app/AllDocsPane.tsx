import { Folder01Icon } from "@hugeicons/core-free-icons";
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
import {
	type KeyboardEvent,
	memo,
	useCallback,
	useMemo,
	useState,
} from "react";
import { useFileTreeContext } from "../../contexts";
import { useTaskProgressIndicatorSetting } from "../../hooks/useTaskProgressIndicatorSetting";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { normalizeInlineMarkdown } from "../../lib/markdownUtils";
import {
	loadAllDocs,
	navigationQueryKeys,
	prefetchNote,
} from "../../lib/navigationPrefetch";
import {
	DEFAULT_TAG_ICON_NAME,
	resolveTagIconName,
	tagIconOverridesFromAppearance,
} from "../../lib/tagIcons";
import type { AllDocsItem, NoteTaskSummary } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { DatabaseColumnIcon } from "../database/DatabaseColumnIcon";
import { formatDatabaseTagLabel } from "../database/databaseTagLabel";
import { TaskProgressIndicator } from "../tasks/TaskProgressIndicator";
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
	const parentFolders = parts.slice(0, -1);
	return parentFolders[parentFolders.length - 1] ?? "Workspace root";
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

function updatedTimeframe(iso: string): string {
	try {
		return formatDistanceToNow(new Date(iso), { addSuffix: true }).replace(
			/^about\s+/i,
			"",
		);
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

interface AllDocsCardProps {
	notePath: string;
	title: string;
	preview: PreviewLine[];
	tags: string[];
	extraTagCount: number;
	pathLabel: string;
	updatedAt: string;
	taskSummary: NoteTaskSummary | undefined;
	taskCount: number;
	selected: boolean;
	animationIndex: number;
	shouldReduceMotion: boolean;
	springPreset: typeof springPresets.snappy;
	iconNameForTag: (tag: string) => string;
	updatedTimeframe: (iso: string) => string;
	formatTagLabel: (tag: string) => string;
	TaskProgressComponent: typeof TaskProgressIndicator;
	onSelect: () => void;
	onPrefetch: () => void;
	onOpen: () => void;
}

type PreparedAllDocsCardProps = Omit<
	AllDocsCardProps,
	| "shouldReduceMotion"
	| "springPreset"
	| "iconNameForTag"
	| "updatedTimeframe"
	| "formatTagLabel"
	| "TaskProgressComponent"
>;

interface PrepareAllDocsCardPropsArgs {
	note: AllDocsItem;
	index: number;
	sectionIndex: number;
	selectedNotePath: string | null;
	taskSummariesByPath: Record<string, NoteTaskSummary>;
	showTaskProgressIndicator: boolean;
	selectNote: (notePath: string) => void;
	onOpenFile: AllDocsPaneProps["onOpenFile"];
}

function prepareAllDocsCardProps({
	note,
	index,
	sectionIndex,
	selectedNotePath,
	taskSummariesByPath,
	showTaskProgressIndicator,
	selectNote,
	onOpenFile,
}: PrepareAllDocsCardPropsArgs): PreparedAllDocsCardProps {
	const noteTitle = note.title.trim() || titleFromPath(note.note_path);
	const taskSummary = showTaskProgressIndicator
		? taskSummariesByPath[note.note_path]
		: undefined;

	return {
		notePath: note.note_path,
		title: noteTitle,
		preview: previewLines(note.preview, noteTitle),
		tags: note.tags.slice(0, 1),
		extraTagCount: Math.max(note.tags.length - 1, 0),
		pathLabel: folderLabel(note.note_path),
		updatedAt: note.updated,
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
	title,
	preview,
	tags,
	extraTagCount,
	pathLabel,
	updatedAt,
	taskSummary,
	taskCount,
	selected,
	animationIndex,
	shouldReduceMotion,
	springPreset,
	iconNameForTag,
	updatedTimeframe,
	formatTagLabel,
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
					<span className="allDocsCardTitle" title={title}>
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
				<div className="allDocsCardFooter">
					<div className="allDocsCardMetaRow">
						<span className="allDocsCardPath" title={notePath}>
							<HugeiconsIcon
								icon={Folder01Icon}
								className="allDocsCardPathIcon"
								size={12}
								strokeWidth={1.2}
							/>
							<span className="allDocsCardPathLabel">{pathLabel}</span>
						</span>
						<span className="allDocsCardTime">
							{updatedTimeframe(updatedAt)}
						</span>
					</div>
					{tags.length > 0 ? (
						<div className="allDocsCardSignals">
							<div className="allDocsCardTags">
								{tags.map((tag) => (
									<span key={`${notePath}:${tag}`} className="allDocsCardTag">
										<DatabaseColumnIcon
											iconName={iconNameForTag(tag)}
											className="allDocsCardTagIcon"
											size={11}
											strokeWidth={1.2}
										/>
										{formatTagLabel(tag)}
									</span>
								))}
								{extraTagCount > 0 ? (
									<span className="allDocsCardTag is-muted">
										+{extraTagCount}
									</span>
								) : null}
							</div>
						</div>
					) : null}
				</div>
			</div>
		</m.button>
	);
}

export const AllDocsPane = memo(function AllDocsPane({
	onOpenFile,
	title = "All Notes",
	folderPrefix = null,
	emptyMessage = "No notes yet. Create one to get started.",
	initialNotes = null,
}: AllDocsPaneProps) {
	const { beautifulTags, tagAppearance } = useFileTreeContext();
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
	const [taskSummaryRefreshKey, setTaskSummaryRefreshKey] = useState(0);
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
	const notePaths = useMemo(() => notes.map((note) => note.note_path), [notes]);
	const showTaskProgressIndicator = useTaskProgressIndicatorSetting();
	const taskSummariesByPath = useTaskSummariesForPaths(
		notePaths,
		showTaskProgressIndicator,
		taskSummaryRefreshKey,
	);
	const tagIconOverrides = useMemo(
		() => tagIconOverridesFromAppearance(tagAppearance),
		[tagAppearance],
	);
	const iconNameForTag = useCallback(
		(tag: string) =>
			beautifulTags
				? resolveTagIconName(tag, tagIconOverrides, beautifulTags)
				: DEFAULT_TAG_ICON_NAME,
		[beautifulTags, tagIconOverrides],
	);

	useTauriEvent("notes:external_changed", () => {
		void queryClient.invalidateQueries({
			queryKey: navigationQueryKeys.allDocsList(normalizedFolderPrefix),
		});
		setTaskSummaryRefreshKey((key) => key + 1);
	});

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

	const loadingLabel = title.toLowerCase();

	if (notesQuery.isLoading) {
		return <div className="databaseLoadingState">Loading {loadingLabel}…</div>;
	}

	if (notesQuery.error) {
		return (
			<div className="databaseLoadingState">
				Could not load {loadingLabel}:{" "}
				{notesQuery.error instanceof Error
					? notesQuery.error.message
					: String(notesQuery.error)}
			</div>
		);
	}

	return (
		<section className="allDocsPane">
			<header className="allDocsHeader">
				<div className="allDocsHeadingGroup">
					<h1 className="allDocsTitle">{title}</h1>
				</div>
			</header>
			<div className="allDocsSections">
				{notes.length === 0 ? (
					<div className="databaseLoadingState">{emptyStateMessage}</div>
				) : null}
				{sections.map((section, sectionIndex) => (
					<section key={section.id} className="allDocsSection">
						<div className="allDocsSectionHeader">
							<h2 className="allDocsSectionTitle">{section.label}</h2>
						</div>
						<div className="allDocsGrid">
							{section.notes.map((note, index) => {
								const cardProps = prepareAllDocsCardProps({
									note,
									index,
									sectionIndex,
									selectedNotePath,
									taskSummariesByPath,
									showTaskProgressIndicator,
									selectNote: setSelectedNotePath,
									onOpenFile,
								});

								return (
									<AllDocsCard
										key={note.note_path}
										{...cardProps}
										shouldReduceMotion={shouldReduceMotion}
										springPreset={springPresets.snappy}
										iconNameForTag={iconNameForTag}
										updatedTimeframe={updatedTimeframe}
										formatTagLabel={formatDatabaseTagLabel}
										TaskProgressComponent={TaskProgressIndicator}
									/>
								);
							})}
						</div>
					</section>
				))}
			</div>
		</section>
	);
});
