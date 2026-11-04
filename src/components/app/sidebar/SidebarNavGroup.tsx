import { useAISidebarContext, useUILayoutContext } from "@/contexts";
import { useShortcutBindings } from "@/hooks/useShortcutBindings";
import type { SidebarVisibilityKey } from "@/lib/settings/model";
import { useTranslation } from "react-i18next";
import {
	AllNotesCountBadge,
	OrderedSidebarItems,
	SidebarActionButton,
} from "./SidebarActionButton";
import { SidebarCreateRow } from "./SidebarCreateRow";
import { SidebarPeriodNotesRow } from "./SidebarPeriodNotesRow";
import { SidebarAllNotesButton, SidebarCollectionsButton } from "./SidebarPrefetchButtons";
import { SidebarSearchBar } from "./SidebarSearchBar";
import type { SidebarContentProps } from "./sidebarContentProps";
import { SIDEBAR_NAV_ACTIONS } from "./sidebarNavActions";

export type SidebarNavGroupProps = Pick<
	SidebarContentProps,
	| "spacePath"
	| "activeTopSection"
	| "newNoteFolder"
	| "onNewNote"
	| "onNewCanvas"
	| "onOpenAgent"
	| "onOpenInbox"
	| "onOpenArchive"
	| "onOpenAllDocs"
	| "onPrefetchAllDocs"
	| "onOpenDatabases"
	| "onPrefetchDatabases"
	| "onOpenTasks"
	| "onOpenConnections"
	| "onOpenSearch"
	| "onOpenQuickNote"
	| "onCreateFromTemplate"
	| "onGitSyncNow"
	| "onOpenPeriodNote"
>;

/** The top nav: create, destinations and shortcuts, in the user's sidebar order. */
export function SidebarNavGroup({
	spacePath,
	activeTopSection,
	newNoteFolder,
	onNewNote,
	onNewCanvas,
	onOpenAgent,
	onOpenInbox,
	onOpenArchive,
	onOpenAllDocs,
	onPrefetchAllDocs,
	onOpenDatabases,
	onPrefetchDatabases,
	onOpenTasks,
	onOpenConnections,
	onOpenSearch,
	onOpenQuickNote,
	onCreateFromTemplate,
	onGitSyncNow,
	onOpenPeriodNote,
}: SidebarNavGroupProps) {
	const { t } = useTranslation("shell");
	const { getBinding } = useShortcutBindings();
	const { aiEnabled } = useAISidebarContext();
	const { sidebarOrder, sidebarVisibility, archiveEnabled, settingsSpacePath } =
		useUILayoutContext();
	const actionHandlers = {
		onOpenAgent,
		onOpenInbox,
		onOpenArchive,
		onOpenTasks,
		onOpenConnections,
		onOpenQuickNote,
		onCreateFromTemplate,
		onGitSyncNow,
	};
	const isActionShown = (key: SidebarVisibilityKey) => {
		if (key === "agent") return aiEnabled && sidebarVisibility.agent;
		if (key === "archive") {
			return sidebarVisibility.archive && archiveEnabled && settingsSpacePath === spacePath;
		}
		return sidebarVisibility[key];
	};

	return (
		<div className="sidebarTopNavigation">
			<OrderedSidebarItems order={sidebarOrder}>
				{SIDEBAR_NAV_ACTIONS.map((item) =>
					isActionShown(item.key) ? (
						<SidebarActionButton
							key={item.key}
							data-sidebar-key={item.key}
							label={t(item.labelKey)}
							icon={item.icon}
							badge={item.key === "inbox" ? <AllNotesCountBadge inbox /> : null}
							active={item.section !== undefined && activeTopSection === item.section}
							onClick={actionHandlers[item.handler]}
						/>
					) : null,
				)}
				{sidebarVisibility.newNote || sidebarVisibility.newCanvas ? (
					<SidebarCreateRow
						key="create"
						data-sidebar-key={sidebarVisibility.newNote ? "newNote" : "newCanvas"}
						showNewNote={sidebarVisibility.newNote}
						showCanvas={sidebarVisibility.newCanvas}
						newNoteFolder={newNoteFolder}
						onNewNote={onNewNote}
						onNewCanvas={onNewCanvas}
						onOpenPeriodNote={onOpenPeriodNote}
						onOpenQuickNote={onOpenQuickNote}
						onCreateFromTemplate={onCreateFromTemplate}
						getBinding={getBinding}
					/>
				) : null}
				{sidebarVisibility.allNotes ? (
					<SidebarAllNotesButton
						key="allNotes"
						data-sidebar-key="allNotes"
						active={activeTopSection === "all-notes"}
						onOpenAllDocs={onOpenAllDocs}
						onPrefetchAllDocs={onPrefetchAllDocs}
					/>
				) : null}
				{sidebarVisibility.databases ? (
					<SidebarCollectionsButton
						key="databases"
						data-sidebar-key="databases"
						active={activeTopSection === "databases"}
						onOpenDatabases={onOpenDatabases}
						onPrefetchDatabases={onPrefetchDatabases}
					/>
				) : null}
				{sidebarVisibility.search ? (
					<SidebarSearchBar
						key="search"
						data-sidebar-key="search"
						onOpenSearch={onOpenSearch}
						getBinding={getBinding}
					/>
				) : null}
				{sidebarVisibility.periodNotes ? (
					<SidebarPeriodNotesRow
						key="periodNotes"
						data-sidebar-key="periodNotes"
						onOpenPeriodNote={onOpenPeriodNote}
					/>
				) : null}
			</OrderedSidebarItems>
		</div>
	);
}
