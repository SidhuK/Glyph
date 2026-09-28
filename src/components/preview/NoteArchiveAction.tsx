import { ArchiveArrowDownIcon, ArchiveArrowUpIcon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { useArchivedPaths, useNoteArchive } from "../../hooks/useNoteArchive";
import { extractErrorMessage } from "../../lib/errorUtils";
import { HugeiconsIcon } from "../HugeiconsIcon";

export function NoteArchiveAction({ path }: { path: string }) {
	const { t } = useTranslation("shell");
	const paths = useArchivedPaths();
	const mutation = useNoteArchive();
	const archived = paths.data?.has(path) ?? false;
	const label = t(archived ? "noteCollections.unarchive" : "noteCollections.archive");
	if (!mutation.enabled) return null;
	if (paths.error) {
		return (
			<button
				type="button"
				className="markdownEditorToolbarBtn"
				title={extractErrorMessage(paths.error)}
				onClick={() => void paths.refetch()}
			>
				{t("noteCollections.retry")}
			</button>
		);
	}
	return (
		<button
			type="button"
			className="markdownEditorToolbarBtn"
			data-active={archived || undefined}
			title={archived ? t("noteCollections.archivedTooltip") : label}
			aria-label={label}
			aria-description={archived ? t("noteCollections.archived") : undefined}
			disabled={mutation.isPending || !paths.data}
			onClick={() => mutation.setArchived([path], !archived)}
		>
			<HugeiconsIcon
				icon={archived ? ArchiveArrowUpIcon : ArchiveArrowDownIcon}
				size="var(--icon-md)"
			/>
		</button>
	);
}
