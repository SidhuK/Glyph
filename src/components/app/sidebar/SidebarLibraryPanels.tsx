import { TagsPane } from "@/components/TagsPane";
import { useFileTreeContext, useUILayoutContext } from "@/contexts";
import { useTagRefactor } from "@/hooks/useTagRefactor";
import { extractErrorMessage } from "@/lib/errorUtils";
import { toast } from "@/lib/toast";
import { Activity, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { PinnedFilesPane, RecentFilesPane } from "../RecentFilesPane";
import type { SidebarView } from "./SidebarViewStrip";

interface SidebarLibraryPanelsProps {
	view: SidebarView;
	spacePath: string | null;
	onOpenFile: (path: string) => void;
	onSelectTag: (tag: string) => void;
	/** Runs after a tag or person is opened (the rail flyout closes on it). */
	onActivate: () => void;
}

/** The Pinned, Recents and Tags panels. Inactive ones stay mounted in hidden Activity
 * boundaries; the file tree panel is SidebarFilesPanel. */
export function SidebarLibraryPanels({
	view,
	spacePath,
	onOpenFile,
	onSelectTag,
	onActivate,
}: SidebarLibraryPanelsProps) {
	const { t } = useTranslation("shell");
	const {
		activeFilePath,
		pinnedFiles,
		tags,
		people,
		beautifulTags,
		tagAppearance,
		tagsError,
		setTagAppearance,
	} = useFileTreeContext();
	const { openTagMenu } = useTagRefactor();
	const { folioMode, setFolioScope } = useUILayoutContext();

	const handleChangeTagIcon = useCallback(
		async (tag: string, iconName: string | null) => {
			try {
				await setTagAppearance(tag, iconName);
			} catch (error) {
				toast.error(t("sidebar.tagIconUpdateFailed"), {
					description: extractErrorMessage(error),
				});
				throw error;
			}
		},
		[setTagAppearance, t],
	);
	const handleSelectTag = (tag: string) => {
		if (folioMode) setFolioScope({ kind: "tag", tag });
		else onSelectTag(tag);
		onActivate();
	};
	const handleSelectPerson = (handle: string) => {
		if (folioMode) setFolioScope({ kind: "person", handle });
		else onSelectTag(handle);
		onActivate();
	};

	return (
		<>
			<Activity mode={view.kind === "pinned" ? "visible" : "hidden"}>
				<section
					className="sidebarStackItem sidebarStackItemGrow sidebarViewPanel"
					data-section="pinned"
					id="sidebar-pinned-panel"
					role="tabpanel"
					aria-labelledby="sidebar-pinned-tab"
				>
					<PinnedFilesPane
						pinnedFiles={pinnedFiles}
						activeFilePath={activeFilePath}
						onOpenFile={onOpenFile}
					/>
				</section>
			</Activity>
			<Activity mode={view.kind === "recents" ? "visible" : "hidden"}>
				<section
					className="sidebarStackItem sidebarStackItemGrow sidebarViewPanel"
					data-section="recents"
					id="sidebar-recents-panel"
					role="tabpanel"
					aria-labelledby="sidebar-recents-tab"
				>
					<RecentFilesPane
						spacePath={spacePath}
						activeFilePath={activeFilePath}
						onOpenFile={onOpenFile}
					/>
				</section>
			</Activity>
			<Activity mode={view.kind === "tags" ? "visible" : "hidden"}>
				<section
					className="sidebarStackItem sidebarStackItemGrow sidebarViewPanel"
					data-section="tags"
					id="sidebar-tags-panel"
					role="tabpanel"
					aria-labelledby="sidebar-tags-tab"
				>
					<TagsPane
						tags={tags}
						people={people}
						onSelectTag={handleSelectTag}
						onSelectPerson={handleSelectPerson}
						beautifulTags={beautifulTags}
						tagAppearance={tagAppearance}
						tagsError={tagsError}
						onChangeTagIcon={handleChangeTagIcon}
						onTagContextMenu={openTagMenu}
					/>
				</section>
			</Activity>
		</>
	);
}
