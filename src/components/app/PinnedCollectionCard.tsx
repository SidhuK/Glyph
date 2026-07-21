import { LibraryIcon, StarIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import type { WorkspaceDatabaseSummary } from "../../lib/tauri";

interface PinnedCollectionCardProps {
	collection: WorkspaceDatabaseSummary;
	onOpen: () => void;
	onUnpin: () => void;
}

function collectionDescription(
	collection: WorkspaceDatabaseSummary,
	t: TFunction<"shell">,
) {
	if (collection.source.kind === "search") {
		return t("pinned.savedSearch");
	}
	if (collection.source.kind === "tag") {
		return t("pinned.tagCollection", {
			tag: collection.source.value.replace(/^#/, ""),
		});
	}
	if (collection.source.kind === "folder") {
		return t("pinned.folderCollection", { folder: collection.source.value });
	}
	return t("pinned.allNotesCollection");
}

export function PinnedCollectionCard({
	collection,
	onOpen,
	onUnpin,
}: PinnedCollectionCardProps) {
	const { t } = useTranslation("shell");
	return (
		<article className="pinnedCollectionCard">
			<button
				type="button"
				className="pinnedCollectionCardOpen"
				onClick={onOpen}
			>
				<span className="pinnedCollectionCardCopy">
					<span className="pinnedCollectionCardTitle">
						<HugeiconsIcon
							icon={LibraryIcon}
							size="var(--icon-md)"
							strokeWidth={0.9}
						/>
						<strong>{collection.name}</strong>
					</span>
					<span>{collectionDescription(collection, t)}</span>
				</span>
			</button>
			<button
				type="button"
				className="pinnedCollectionCardToggle"
				onClick={onUnpin}
				title={t("collections.unpin")}
				aria-label={t("collections.unpinNamed", { name: collection.name })}
			>
				<HugeiconsIcon
					icon={StarIcon}
					size="var(--icon-md)"
					strokeWidth={0.9}
				/>
			</button>
		</article>
	);
}
