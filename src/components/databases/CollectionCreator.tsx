import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Database01Icon } from "@hugeicons/core-free-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import {
	busiestCollectionFolder,
	collectionFoldersQueryKey,
	useCollectionFolders,
} from "../../hooks/database/useCollectionFolders";
import { folderNameFromPath, nextCollectionName } from "../../lib/database/collection";
import { extractErrorMessage } from "../../lib/errorUtils";
import { promptCreateFolderName } from "../../lib/promptCreateFolderName";
import { spaceDisplayName } from "../../lib/spaceRegistry";
import {
	type DatabaseConfig,
	type WorkspaceDatabaseDocument,
	type WorkspaceDatabaseSummary,
	invoke,
} from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";
import { CollectionFolderMenu } from "./CollectionFolderMenu";
import { CollectionLayoutTiles } from "./CollectionLayoutTiles";

type CollectionLayout = DatabaseConfig["view"]["layout"];

interface CollectionCreatorProps {
	summaries: WorkspaceDatabaseSummary[];
	onCreated: (document: WorkspaceDatabaseDocument) => void;
	onError: (message: string) => void;
	onCancel: (() => void) | null;
}

export function CollectionCreator({
	summaries,
	onCreated,
	onError,
	onCancel,
}: CollectionCreatorProps) {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const queryClient = useQueryClient();
	const foldersQuery = useCollectionFolders(spacePath);
	const folders = foldersQuery.data ?? [];
	const [layout, setLayout] = useState<CollectionLayout>("board");
	const [chosenFolder, setChosenFolder] = useState<string | null>(null);
	const folder =
		chosenFolder && folders.some((entry) => entry.path === chosenFolder)
			? chosenFolder
			: busiestCollectionFolder(folders);

	const createCollection = useMutation({
		mutationFn: (input: { folder: string; layout: CollectionLayout }) =>
			invoke("databases_create", {
				name: nextCollectionName(summaries, folderNameFromPath(input.folder)),
				folder: input.folder,
				source: null,
				pinned: false,
				first_view: {
					name:
						input.layout === "board"
							? t("collections.viewMenu.board")
							: t("collections.viewMenu.table"),
					layout: input.layout,
				},
			}),
		onSuccess: onCreated,
		onError: (cause) => onError(extractErrorMessage(cause)),
	});

	const createFolder = useMutation({
		mutationFn: async () => {
			const name = await promptCreateFolderName({ parentDir: "", spacePath });
			if (!name) return null;
			await invoke("space_create_dir", { path: name });
			return name;
		},
		onSuccess: async (path) => {
			if (!path) return;
			await queryClient.invalidateQueries({ queryKey: collectionFoldersQueryKey(spacePath) });
			setChosenFolder(path);
		},
		onError: (cause) => onError(extractErrorMessage(cause)),
	});

	const busy = createCollection.isPending || createFolder.isPending;

	return (
		<div className="collectionCreator">
			<div className="collectionCreatorIcon" aria-hidden="true">
				<HugeiconsIcon icon={Database01Icon} size="var(--icon-3xl)" />
			</div>
			<h2 className="collectionCreatorTitle">{t("collections.creator.title")}</h2>
			<p className="collectionCreatorText">{t("collections.creator.description")}</p>
			<CollectionLayoutTiles value={layout} onChange={setLayout} />
			{foldersQuery.isError ? (
				<p className="collectionCreatorNote" role="alert">
					{t("collections.creator.loadFoldersFailed", {
						error: extractErrorMessage(foldersQuery.error),
					})}
				</p>
			) : folder ? (
				<form
					className="collectionCreatorActions"
					onSubmit={(event) => {
						event.preventDefault();
						createCollection.mutate({ folder, layout });
					}}
				>
					<CollectionFolderMenu
						folders={folders}
						value={folder}
						onChange={setChosenFolder}
						spaceName={spacePath ? spaceDisplayName(spacePath) : ""}
						disabled={busy}
					/>
					<Button type="submit" size="sm" className="collectionCreatorCta" disabled={busy}>
						{createCollection.isPending
							? t("collections.creator.creating")
							: layout === "board"
								? t("collections.creator.createBoard")
								: t("collections.creator.createTable")}
					</Button>
				</form>
			) : foldersQuery.isSuccess ? (
				<div className="collectionCreatorActions">
					<span className="collectionCreatorNote">{t("collections.creator.noFolders")}</span>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="collectionCreatorSecondary"
						onClick={() => createFolder.mutate()}
						disabled={busy}
					>
						{t("collections.creator.newFolder")}
					</Button>
				</div>
			) : null}
			{onCancel ? (
				<Button
					type="button"
					size="sm"
					variant="ghost"
					className="collectionCreatorCancel"
					onClick={onCancel}
					disabled={busy}
				>
					{t("collections.creator.cancel")}
				</Button>
			) : null}
		</div>
	);
}
