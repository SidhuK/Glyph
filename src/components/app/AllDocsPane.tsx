import { CollectionsBookmarkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
	type CSSProperties,
	type ComponentProps,
	type Dispatch,
	type SetStateAction,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { AllDocsItem } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	getPrefetchedAllDocs,
	invalidateAllDocsPrefetch,
	prefetchAllDocs,
	prefetchNote,
} from "../../lib/navigationPrefetch";
import { formatDatabaseTagLabel } from "../database/databaseTagLabel";
import { springPresets } from "../ui/animations";

interface AllDocsPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
	title?: string;
	icon?: ComponentProps<typeof HugeiconsIcon>["icon"];
	folderPrefix?: string | null;
	emptyMessage?: string;
	initialNotes?: AllDocsItem[] | null;
}

const CARD_STYLE = {
	minHeight: "264px",
	borderRadius: "18px",
} satisfies CSSProperties;

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

function previewText(preview: string, title: string): string {
	const normalized = preview.replace(/\s+/g, " ").trim();
	if (!normalized) return "";
	if (normalized.toLowerCase().startsWith(title.toLowerCase())) {
		return normalized
			.slice(title.length)
			.replace(/^[-:.\s]+/, "")
			.trim();
	}
	return normalized;
}

function updatedLabel(iso: string): string {
	try {
		return `Updated ${formatDistanceToNow(new Date(iso), { addSuffix: true })}`;
	} catch {
		return "Recently updated";
	}
}

type AllDocsSection = {
	id: string;
	label: string;
	notes: AllDocsItem[];
};

function applyNotesResult(
	items: AllDocsItem[],
	setNotes: Dispatch<SetStateAction<AllDocsItem[]>>,
	setSelectedNotePath: Dispatch<SetStateAction<string | null>>,
) {
	setNotes(items);
	setSelectedNotePath((current) =>
		items.some((item) => item.note_path === current)
			? current
			: (items[0]?.note_path ?? null),
	);
}

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
	icon = CollectionsBookmarkIcon,
	folderPrefix = null,
	emptyMessage = "No notes yet. Create one to get started.",
	initialNotes = null,
}: AllDocsPaneProps) {
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [notes, setNotes] = useState<AllDocsItem[]>(
		() => initialNotes ?? getPrefetchedAllDocs(folderPrefix) ?? [],
	);
	const [loading, setLoading] = useState(
		() => (initialNotes ?? getPrefetchedAllDocs(folderPrefix)) === null,
	);
	const [error, setError] = useState("");
	const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
	const normalizedFolderPrefix = useMemo(
		() => normalizeFolderPrefix(folderPrefix),
		[folderPrefix],
	);

	const fetchNotes = useCallback(
		async (cancelled?: { current: boolean }) => {
			setLoading(true);
			setError("");
			try {
				const items = await prefetchAllDocs(normalizedFolderPrefix);
				if (cancelled?.current) return;
				applyNotesResult(items, setNotes, setSelectedNotePath);
			} catch (cause) {
				if (cancelled?.current) return;
				setError(cause instanceof Error ? cause.message : String(cause));
				setNotes([]);
			} finally {
				if (!cancelled?.current) setLoading(false);
			}
		},
		[normalizedFolderPrefix],
	);

	useTauriEvent("notes:external_changed", () => {
		invalidateAllDocsPrefetch(normalizedFolderPrefix);
		void fetchNotes();
	});

	useEffect(() => {
		const cancelled = { current: false };
		if (notes.length > 0) {
			void fetchNotes(cancelled);
			return () => {
				cancelled.current = true;
			};
		}
		void fetchNotes(cancelled);
		return () => {
			cancelled.current = true;
		};
	}, [fetchNotes, notes.length]);

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

	if (loading) {
		return <div className="databaseLoadingState">Loading all docs…</div>;
	}

	if (error) {
		return (
			<div className="databaseLoadingState">Could not load docs: {error}</div>
		);
	}

	if (notes.length === 0) {
		return <div className="databaseLoadingState">{emptyMessage}</div>;
	}

	return (
		<section className="allDocsPane">
			<div className="allDocsHeader">
				<div className="allDocsTitleGroup">
					<div className="allDocsTitleIcon">
						<HugeiconsIcon icon={icon} size={16} strokeWidth={0.9} />
					</div>
					<div>
						<h1 className="allDocsTitle">{title}</h1>
					</div>
				</div>
				<p className="allDocsCountBadge">{countLabel}</p>
			</div>
			<div className="allDocsSections">
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
								const preview = previewText(note.preview, noteTitle);
								const visibleTags = note.tags.slice(0, 3);
								const extraTagCount = Math.max(
									note.tags.length - visibleTags.length,
									0,
								);
								const folder = folderLabel(note.note_path);
								const animationIndex = sectionIndex * 12 + index;

								return (
									<m.button
										key={note.note_path}
										type="button"
										className="databaseBoardCard allDocsCard"
										style={CARD_STYLE}
										data-state={
											selectedNotePath === note.note_path
												? "selected"
												: undefined
										}
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
										<div className="databaseBoardCardHead">
											<div className="databaseBoardCardHeaderRow">
												<span className="databaseBoardCardTitle">
													{noteTitle}
												</span>
												<span className="databaseBoardCardOpenHint">Open</span>
											</div>
											<div className="allDocsMetaRow">
												<span className="databaseBoardCardPath" title={folder}>
													{folder}
												</span>
												<span className="allDocsMetaDot" aria-hidden="true">
													•
												</span>
												<span className="databaseBoardCardTimestamp">
													{updatedLabel(note.updated)}
												</span>
											</div>
											{preview ? (
												<div className="databaseBoardCardPreview">
													{preview}
												</div>
											) : (
												<div className="databaseBoardCardPreview is-placeholder">
													No preview yet
												</div>
											)}
										</div>
										{visibleTags.length > 0 ? (
											<div className="databaseBoardCardTags">
												{visibleTags.map((tag) => (
													<span
														key={`${note.note_path}:${tag}`}
														className="databaseBoardTag"
													>
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
