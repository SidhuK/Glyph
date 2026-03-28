import { CollectionsBookmarkIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { formatDistanceToNow } from "date-fns";
import { m, useReducedMotion } from "motion/react";
import { memo, useEffect, useMemo, useState, type CSSProperties } from "react";
import { formatDatabaseTagLabel } from "../database/databaseTagLabel";
import { springPresets } from "../ui/animations";
import { invoke, type AllDocsItem } from "../../lib/tauri";

interface AllDocsPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
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
		return normalized.slice(title.length).replace(/^[-:.\s]+/, "").trim();
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

export const AllDocsPane = memo(function AllDocsPane({
	onOpenFile,
}: AllDocsPaneProps) {
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [notes, setNotes] = useState<AllDocsItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		setError("");
		void invoke("all_docs_list", { limit: 2000 })
			.then((items) => {
				if (cancelled) return;
				setNotes(items);
				setSelectedNotePath((current) => current ?? items[0]?.note_path ?? null);
			})
			.catch((cause) => {
				if (cancelled) return;
				setError(cause instanceof Error ? cause.message : String(cause));
				setNotes([]);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const countLabel = useMemo(() => {
		const count = notes.length;
		return `${count} ${count === 1 ? "note" : "notes"}`;
	}, [notes.length]);
	const cardStyle = useMemo(
		() =>
			({
				minHeight: "288px",
				borderRadius: "18px",
			}) satisfies CSSProperties,
		[],
	);

	if (loading) {
		return <div className="databaseLoadingState">Loading all docs…</div>;
	}

	if (error) {
		return <div className="databaseLoadingState">Could not load docs: {error}</div>;
	}

	if (notes.length === 0) {
		return (
			<div className="databaseLoadingState">No notes yet. Create one to get started.</div>
		);
	}

	return (
		<section className="allDocsPane">
			<div className="allDocsHeader">
				<div className="allDocsTitleGroup">
					<div className="allDocsTitleIcon">
						<HugeiconsIcon icon={CollectionsBookmarkIcon} size={16} />
					</div>
					<div>
						<h1 className="allDocsTitle">All Notes</h1>
					</div>
				</div>
				<p className="allDocsCountBadge">{countLabel}</p>
			</div>
			<div className="allDocsGrid">
				{notes.map((note, index) => {
					const title = note.title.trim() || titleFromPath(note.note_path);
					const preview = previewText(note.preview, title);
					const visibleTags = note.tags.slice(0, 3);
					const extraTagCount = Math.max(note.tags.length - visibleTags.length, 0);
					const folder = folderLabel(note.note_path);

					return (
						<m.button
							key={note.note_path}
							type="button"
							className="databaseBoardCard allDocsCard"
							style={cardStyle}
							data-state={
								selectedNotePath === note.note_path ? "selected" : undefined
							}
							onClick={() => setSelectedNotePath(note.note_path)}
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
											delay: Math.min(index * 0.02, 0.18),
										}
							}
							title="Double-click to open note"
						>
							<div className="databaseBoardCardHead">
								<div className="databaseBoardCardHeaderRow">
									<span className="databaseBoardCardTitle">{title}</span>
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
									<div className="databaseBoardCardPreview">{preview}</div>
								) : (
									<div className="databaseBoardCardPreview is-placeholder">
										No preview yet
									</div>
								)}
							</div>
							{visibleTags.length > 0 ? (
								<div className="databaseBoardCardTags">
									{visibleTags.map((tag) => (
										<span key={`${note.note_path}:${tag}`} className="databaseBoardTag">
											{formatDatabaseTagLabel(tag)}
										</span>
									))}
									{extraTagCount > 0 ? (
										<span className="databaseBoardTag is-muted">+{extraTagCount}</span>
									) : null}
								</div>
							) : null}
						</m.button>
					);
				})}
			</div>
		</section>
	);
});
