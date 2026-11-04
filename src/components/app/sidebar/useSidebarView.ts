import { useFileTreeContext, useUILayoutContext } from "@/contexts";
import { extractErrorMessage } from "@/lib/errorUtils";
import { showNativeContextMenu } from "@/lib/nativeContextMenu";
import { toast } from "@/lib/toast";
import { basename } from "@/utils/path";
import { type MouseEvent, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SidebarView, SidebarViewKind } from "./SidebarViewStrip";

/** Which library view is showing (files, pinned, tags, recents or a quick folder) and the
 * handlers that switch it, keeping folio scope and the selected folder in step. */
export function useSidebarView(onSelectDir: (dirPath: string) => void) {
	const { t } = useTranslation("shell");
	const { sidebarFolderTabs, toggleSidebarFolderTab, ensureTagsFresh } = useFileTreeContext();
	const { folioMode, setFolioScope } = useUILayoutContext();
	const [sidebarView, setSidebarView] = useState<SidebarView>({ kind: "files" });
	const activeSidebarView: SidebarView =
		sidebarView.kind === "folder" && !sidebarFolderTabs.includes(sidebarView.path)
			? { kind: "files" }
			: sidebarView;
	const activeFolderPath = activeSidebarView.kind === "folder" ? activeSidebarView.path : null;

	const handleSelectFolioFolder = useCallback(
		(dirPath: string) => {
			onSelectDir(dirPath);
			if (!dirPath) {
				setFolioScope({ kind: "all" });
				return;
			}
			setFolioScope({ kind: "folder", folderPrefix: dirPath });
		},
		[onSelectDir, setFolioScope],
	);
	const handleSidebarViewChange = useCallback(
		(view: SidebarViewKind) => {
			if (
				folioMode &&
				activeSidebarView.kind !== view &&
				(activeSidebarView.kind === "folder" ||
					view === "files" ||
					view === "pinned" ||
					view === "recents")
			) {
				handleSelectFolioFolder("");
			}
			if (activeSidebarView.kind === view) return;
			setSidebarView({ kind: view });
			if (activeSidebarView.kind === "folder" && !folioMode) {
				onSelectDir("");
			}
			if (view === "tags") {
				void ensureTagsFresh();
			}
		},
		[activeSidebarView.kind, ensureTagsFresh, folioMode, handleSelectFolioFolder, onSelectDir],
	);
	const handleSelectSidebarFolder = useCallback(
		(folderPath: string) => {
			if (!sidebarFolderTabs.includes(folderPath)) return;
			setSidebarView({ kind: "folder", path: folderPath });
			if (folioMode) {
				handleSelectFolioFolder(folderPath);
				return;
			}
			onSelectDir(folderPath);
		},
		[folioMode, handleSelectFolioFolder, onSelectDir, sidebarFolderTabs],
	);
	const handleToggleSidebarFolderTab = useCallback(
		async (folderPath: string) => {
			const isRemoving = sidebarFolderTabs.includes(folderPath);
			try {
				await toggleSidebarFolderTab(folderPath);
				if (isRemoving && activeFolderPath === folderPath) {
					handleSidebarViewChange("files");
				}
			} catch (error) {
				toast.error(t("sidebar.folderTabUpdateFailed"), {
					description: extractErrorMessage(error),
				});
			}
		},
		[activeFolderPath, handleSidebarViewChange, sidebarFolderTabs, t, toggleSidebarFolderTab],
	);
	const handleFolderTabContextMenu = useCallback(
		(event: MouseEvent<HTMLButtonElement>, folderPath: string) => {
			void showNativeContextMenu(event, [
				{
					label: t("sidebar.removeFolderTab", {
						folder: basename(folderPath),
					}),
					action: () => void handleToggleSidebarFolderTab(folderPath),
				},
			]).catch((error: unknown) => {
				console.error("Failed to show folder tab context menu", error);
			});
		},
		[handleToggleSidebarFolderTab, t],
	);

	return {
		activeSidebarView,
		handleSelectFolioFolder,
		handleSidebarViewChange,
		handleSelectSidebarFolder,
		handleToggleSidebarFolderTab,
		handleFolderTabContextMenu,
	};
}
