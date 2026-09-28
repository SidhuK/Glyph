import { ArchiveArrowDownIcon, ArchiveArrowUpIcon, InboxIcon } from "@hugeicons/core-free-icons";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useEditorContext, useSpace, useUILayoutContext } from "../../contexts";
import { useArchivedPaths, useNoteArchive } from "../../hooks/useNoteArchive";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invoke } from "../../lib/tauri";
import { toast } from "../../lib/toast";
import { basename, isMarkdownPath } from "../../utils/path";
import { HugeiconsIcon } from "../HugeiconsIcon";
import type { Command } from "./commandPaletteHelpers";

export function useNoteCollectionCommands(
	path: string | null,
	openFile: (path: string) => Promise<void>,
): Command[] {
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const { defaultNewNoteFolder, settingsSpacePath } = useUILayoutContext();
	const { prepareEditorsForExternalMutation } = useEditorContext();
	const archivedPaths = useArchivedPaths();
	const archive = useNoteArchive();
	const inbox = settingsSpacePath === spacePath ? defaultNewNoteFolder : null;
	const archived = Boolean(path && archivedPaths.data?.has(path));
	const sendToInbox = useMutation({
		mutationFn: async () => {
			if (!path || !spacePath || !inbox) return;
			if ((await invoke("space_get_current")) !== spacePath) {
				throw new Error(t("noteCollections.spaceChanged"));
			}
			if (!(await prepareEditorsForExternalMutation([path]))) {
				throw new Error(t("noteCollections.unsaved"));
			}
			let restoreArchiveOnFailure = false;
			if (archived) {
				const result = await archive
					.mutateAsync({
						paths: [path],
						archived: false,
						expectedSpace: spacePath,
						showSuccess: false,
					})
					.catch(() => null); // The archive mutation already reports its error.
				if (!result || result.failures.length) return;
				restoreArchiveOnFailure = result.changed_paths.includes(path);
			}
			const target = `${inbox}/${basename(path)}`;
			if (target !== path) {
				try {
					await invoke("space_rename_path", {
						from_path: path,
						to_path: target,
						expected_space: spacePath,
					});
				} catch (error) {
					if (restoreArchiveOnFailure) {
						// Restore only the archive state changed by this action. The hook reports rollback failures.
						await archive
							.mutateAsync({
								paths: [path],
								archived: true,
								expectedSpace: spacePath,
								showSuccess: false,
							})
							.catch(() => null);
					}
					throw error;
				}
			}

			if ((await invoke("space_get_current")) === spacePath) await openFile(target);
		},
		onError: (error) =>
			toast.error(t("noteCollections.actionFailed"), {
				description: extractErrorMessage(error),
			}),
	});
	if (!spacePath || !path || !isMarkdownPath(path)) return [];
	const enabled =
		Boolean(archivedPaths.data) &&
		!archivedPaths.error &&
		!archive.isPending &&
		!sendToInbox.isPending;
	const commands: Command[] = [
		{
			id: "send-note-to-inbox",
			icon: <HugeiconsIcon icon={InboxIcon} size="var(--icon-lg)" />,
			enabled:
				enabled &&
				Boolean(inbox) &&
				(!archived || archive.enabled) &&
				(archived || !path.startsWith(`${inbox}/`)),
			action: () => sendToInbox.mutate(),
		},
	];
	if (archive.enabled) {
		commands.push({
			id: archived ? "unarchive-note" : "archive-note",
			icon: (
				<HugeiconsIcon
					icon={archived ? ArchiveArrowUpIcon : ArchiveArrowDownIcon}
					size="var(--icon-lg)"
				/>
			),
			enabled,
			action: () => archive.setArchived([path], !archived),
		});
	}
	return commands;
}
