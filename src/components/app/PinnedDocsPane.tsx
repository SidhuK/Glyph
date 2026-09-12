import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useReducedMotion } from "motion/react";
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext, useSpace } from "../../contexts";
import { pathInWorkspace } from "../../hooks/useFolderWorkspace";
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
	const {
		pinnedFiles: allPinnedFiles,
		itemAppearance,
		folderWorkspace,
	} = useFileTreeContext();
	const pinnedFiles = useMemo(
		() =>
			allPinnedFiles.filter((path) =>
				pathInWorkspace(path, folderWorkspace.folder),
			),
		[allPinnedFiles, folderWorkspace.folder],
	);
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [selectedPath, setSelectedPath] = useState<string | null>(null);
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();
	const collectionsQuery = useQuery({
		queryKey: navigationQueryKeys.databaseSummaries(),
		queryFn: () => invoke("databases_list"),
	});
	const pinnedCollections = useMemo(
		() =>
			collectionsQuery.data?.filter(
				(collection) =>
					collection.pinned &&
					(!folderWorkspace.folder ||
						(collection.source.kind === "folder" &&
							pathInWorkspace(
								collection.source.value,
								folderWorkspace.folder,
							))),
			) ?? [],
		[collectionsQuery.data, folderWorkspace.folder],
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

	const previewsQuery = useQuery({
		queryKey: ["folder-workspace", "pinned-previews", spacePath, pinnedFiles],
		enabled: Boolean(spacePath),
		queryFn: async (): Promise<PinnedFileData[]> => {
			if (pinnedFiles.length === 0) return [];
			const previews = await invoke("space_read_text_previews_batch", {
				paths: pinnedFiles,
				max_bytes: PREVIEW_MAX_BYTES,
			});
			const failed = previews.find((preview) => preview.error);
			if (failed) throw new Error(failed.error ?? t("pinned.loadFailed"));
			return previews.map((preview) => ({
				path: preview.rel_path,
				title: titleFromPath(preview.rel_path),
				previewText: preview.text ?? "",
			}));
		},
	});
	const fileData = previewsQuery.data ?? [];
	const loading = previewsQuery.isLoading;

	const notePaths = useMemo(
		() => pinnedFiles.filter((p) => p.toLowerCase().endsWith(".md")),
		[pinnedFiles],
	);
	const taskSummariesByPath = useTaskSummariesForPaths(notePaths, true);

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
				{previewsQuery.error ? (
					<div className="databaseLoadingState" role="alert">
						{t("pinned.loadFailed")}: {extractErrorMessage(previewsQuery.error)}
					</div>
				) : null}
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
