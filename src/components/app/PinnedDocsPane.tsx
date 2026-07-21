import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext } from "../../contexts";
import { useTaskSummariesForPaths } from "../../hooks/useTaskSummariesForPaths";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	invalidateDatabasePrefetch,
	navigationQueryKeys,
} from "../../lib/navigationPrefetch";
import { invoke } from "../../lib/tauri";
import { toast } from "../../lib/toast";
import { TaskProgressIndicator } from "../checklists/TaskProgressIndicator";
import { springPresets } from "../ui/animations";
import { AllDocsCard, previewLines, titleFromPath } from "./AllDocsCard";
import { PinnedCollectionCard } from "./PinnedCollectionCard";

interface PinnedDocsPaneProps {
	onOpenFile: (relPath: string) => Promise<void>;
	onOpenDatabase: (databaseId: string) => void;
}

const PREVIEW_MAX_BYTES = 4096;

interface PinnedFileData {
	path: string;
	title: string;
	previewText: string;
}

export const PinnedDocsPane = memo(function PinnedDocsPane({
	onOpenFile,
	onOpenDatabase,
}: PinnedDocsPaneProps) {
	const { t } = useTranslation("shell");
	const { pinnedFiles, itemAppearance } = useFileTreeContext();
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const [fileData, setFileData] = useState<PinnedFileData[]>([]);
	const [loading, setLoading] = useState(true);
	const queryClient = useQueryClient();
	const collectionsQuery = useQuery({
		queryKey: navigationQueryKeys.databaseSummaries(),
		queryFn: () => invoke("databases_list"),
	});
	const pinnedCollections = useMemo(
		() =>
			collectionsQuery.data?.filter((collection) => collection.pinned) ?? [],
		[collectionsQuery.data],
	);
	const unpinCollection = useMutation({
		mutationFn: (databaseId: string) =>
			invoke("databases_set_pinned", {
				database_id: databaseId,
				pinned: false,
			}),
		onSuccess: (document) => {
			invalidateDatabasePrefetch(document.database.id);
			void queryClient.invalidateQueries({
				queryKey: navigationQueryKeys.databaseSummaries(),
			});
		},
		onError: (cause) => {
			toast.error(t("collections.unpinFailed"), {
				description: extractErrorMessage(cause),
			});
		},
	});

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

	if (loading || (pinnedFiles.length === 0 && collectionsQuery.isLoading)) {
		return (
			<section className="allDocsPane">
				<header className="allDocsHeader">
					<h1 className="allDocsTitle">{t("pinned.title")}</h1>
				</header>
				<div className="databaseLoadingState">{t("pinned.loading")}</div>
			</section>
		);
	}

	if (
		!collectionsQuery.error &&
		pinnedFiles.length === 0 &&
		pinnedCollections.length === 0
	) {
		return (
			<section className="allDocsPane">
				<header className="allDocsHeader">
					<h1 className="allDocsTitle">{t("pinned.title")}</h1>
				</header>
				<div className="databaseLoadingState">{t("pinned.empty")}</div>
			</section>
		);
	}

	return (
		<section className="allDocsPane">
			<header className="allDocsHeader">
				<h1 className="allDocsTitle">{t("pinned.title")}</h1>
			</header>
			<div className="allDocsSections">
				{collectionsQuery.error ? (
					<div className="databaseLoadingState">
						{t("pinned.loadFailed")}:{" "}
						{extractErrorMessage(collectionsQuery.error)}
					</div>
				) : null}
				{pinnedCollections.length > 0 ? (
					<section className="pinnedCollectionsSection">
						<h2 className="allDocsSectionTitle">{t("pinned.collections")}</h2>
						<div className="pinnedCollectionsGrid">
							{pinnedCollections.map((collection) => (
								<PinnedCollectionCard
									key={collection.id}
									collection={collection}
									onOpen={() => onOpenDatabase(collection.id)}
									onUnpin={() => unpinCollection.mutate(collection.id)}
								/>
							))}
						</div>
					</section>
				) : null}
				{fileData.length > 0 ? (
					<h2 className="allDocsSectionTitle">{t("pinned.notes")}</h2>
				) : null}
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
