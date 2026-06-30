import { useReducedMotion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useFileTreeContext } from "../../contexts";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { invoke } from "../../lib/tauri";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import { springPresets } from "../ui/animations";
import { AllDocsCard, previewLines, titleFromPath } from "./AllDocsCard";

interface PinnedDocsPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
}

const PREVIEW_MAX_BYTES = 4096;

interface PinnedFileData {
	path: string;
	title: string;
	previewText: string;
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
						const preview = previewLines(data.previewText, data.title);

						return (
							<AllDocsCard
								key={data.path}
								notePath={data.path}
								title={data.title}
								preview={preview}
								noteAppearance={itemAppearance[data.path] ?? null}
								taskSummary={taskSummary}
								taskCount={taskSummary?.total_count ?? 0}
								selected={selectedPath === data.path}
								animationIndex={index}
								shouldReduceMotion={shouldReduceMotion}
								springPreset={springPresets.snappy}
								TaskProgressComponent={TaskProgressIndicator}
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
