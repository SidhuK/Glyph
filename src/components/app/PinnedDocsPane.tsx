import { m, useReducedMotion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useFileTreeContext } from "../../contexts";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { normalizeInlineMarkdown } from "../../lib/markdownUtils";
import type { FileTreeAppearance, NoteTaskSummary } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import {
	DatabaseNoteAppearanceIcon,
	databaseNoteAppearanceStyle,
} from "../database/DatabaseNoteAppearanceIcon";
import { springPresets } from "../ui/animations";

interface PinnedDocsPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
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

function titleFromPath(notePath: string): string {
	const fileName = notePath.split("/").pop() ?? notePath;
	return fileName.replace(/\.md$/i, "");
}

const PREVIEW_MAX_BYTES = 4096;

interface PinnedFileData {
	path: string;
	title: string;
	previewText: string;
}

function PinnedCard({
	path,
	title,
	previewText,
	itemAppearance,
	taskSummary,
	taskCount,
	selected,
	animationIndex,
	shouldReduceMotion,
	onSelect,
	onOpen,
}: {
	path: string;
	title: string;
	previewText: string;
	itemAppearance: FileTreeAppearance | null | undefined;
	taskSummary: NoteTaskSummary | null | undefined;
	taskCount: number;
	selected: boolean;
	animationIndex: number;
	shouldReduceMotion: boolean;
	onSelect: () => void;
	onOpen: () => void;
}) {
	const preview = useMemo(
		() => previewLines(previewText, title),
		[previewText, title],
	);
	const noteAppearanceStyle = databaseNoteAppearanceStyle(
		path,
		itemAppearance ?? null,
	);

	return (
		<m.button
			type="button"
			className="allDocsCard"
			data-state={selected ? "selected" : undefined}
			aria-label={`Open ${title}`}
			onClick={onSelect}
			onDoubleClick={onOpen}
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
				<div className="allDocsCardTop">
					<span
						className="allDocsCardTitle"
						title={title}
						style={noteAppearanceStyle}
					>
						<DatabaseNoteAppearanceIcon
							notePath={path}
							appearance={itemAppearance ?? null}
							className="allDocsCardTitleIcon"
							size="var(--icon-md)"
						/>
						{title}
					</span>
					{taskSummary && taskCount > 0 ? (
						<span className="allDocsCardTaskSummary is-top">
							<TaskProgressIndicator
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
								key={`${path}:preview:${line.key}`}
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

export const PinnedDocsPane = memo(function PinnedDocsPane({
	onOpenFile,
}: PinnedDocsPaneProps) {
	const { pinnedFiles, itemAppearance } = useFileTreeContext();
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [fileData, setFileData] = useState<PinnedFileData[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);

		void Promise.all(
			pinnedFiles.map(async (path) => {
				try {
					const preview = await invoke("space_read_text_preview", {
						path,
						max_bytes: PREVIEW_MAX_BYTES,
					});
					return {
						path,
						title: titleFromPath(path),
						previewText: (preview as { text: string }).text,
					} satisfies PinnedFileData;
				} catch {
					return {
						path,
						title: titleFromPath(path),
						previewText: "",
					} satisfies PinnedFileData;
				}
			}),
		).then((results) => {
			if (!cancelled) {
				setFileData(results);
				setLoading(false);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [pinnedFiles]);

	const notePaths = useMemo(
		() => pinnedFiles.filter((p) => p.toLowerCase().endsWith(".md")),
		[pinnedFiles],
	);
	const taskSummariesByPath = useTaskSummariesForPaths(notePaths, true, 0);

	const handleOpen = useCallback(
		(path: string) => {
			void onOpenFile(path);
		},
		[onOpenFile],
	);

	if (loading) {
		return (
			<section className="allDocsPane">
				<header className="allDocsHeader">
					<div className="allDocsHeadingGroup">
						<h1 className="allDocsTitle">Pinned</h1>
					</div>
				</header>
				<div className="databaseLoadingState">Loading pinned notes...</div>
			</section>
		);
	}

	if (pinnedFiles.length === 0) {
		return (
			<section className="allDocsPane">
				<header className="allDocsHeader">
					<div className="allDocsHeadingGroup">
						<h1 className="allDocsTitle">Pinned</h1>
					</div>
				</header>
				<div className="databaseLoadingState">
					No pinned notes yet. Pin a note from the file tree to get started.
				</div>
			</section>
		);
	}

	return (
		<section className="allDocsPane">
			<header className="allDocsHeader">
				<div className="allDocsHeadingGroup">
					<h1 className="allDocsTitle">Pinned</h1>
				</div>
			</header>
			<div className="allDocsSections">
				<div className="allDocsGrid">
					{fileData.map((data, index) => {
						const taskSummary = taskSummariesByPath[data.path] ?? undefined;

						return (
							<PinnedCard
								key={data.path}
								path={data.path}
								title={data.title}
								previewText={data.previewText}
								itemAppearance={itemAppearance[data.path]}
								taskSummary={taskSummary}
								taskCount={taskSummary?.total_count ?? 0}
								selected={selectedPath === data.path}
								animationIndex={index}
								shouldReduceMotion={shouldReduceMotion}
								onSelect={() => setSelectedPath(data.path)}
								onOpen={() => handleOpen(data.path)}
							/>
						);
					})}
				</div>
			</div>
		</section>
	);
});
