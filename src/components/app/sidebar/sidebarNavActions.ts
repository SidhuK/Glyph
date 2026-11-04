import type { SidebarVisibilityKey } from "@/lib/settings/model";
import {
	AiBrain04Icon as AgentIcon,
	Archive03Icon as ArchiveIcon,
	ChartRelationshipIcon as ConnectionsIcon,
	InboxIcon,
	StickyNote03Icon as QuickNoteIcon,
	Refresh04Icon as SyncIcon,
	CheckListIcon as TasksIcon,
	Layout01Icon as TemplatesIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { SidebarContentProps, SidebarTopSection } from "./sidebarContentProps";

type SidebarNavActionHandler = keyof Pick<
	SidebarContentProps,
	| "onOpenAgent"
	| "onOpenInbox"
	| "onOpenArchive"
	| "onOpenTasks"
	| "onOpenConnections"
	| "onOpenQuickNote"
	| "onCreateFromTemplate"
	| "onGitSyncNow"
>;

interface SidebarNavAction {
	key: SidebarVisibilityKey;
	labelKey: string;
	icon: IconSvgElement;
	/** The top section that marks this row active. */
	section?: SidebarTopSection;
	handler: SidebarNavActionHandler;
}

/** Nav rows that are a plain icon, label and handler. Rows with their own behaviour (create,
 * all notes, collections, search, period notes) render their own components. */
export const SIDEBAR_NAV_ACTIONS: readonly SidebarNavAction[] = [
	{
		key: "agent",
		labelKey: "sidebar.agent",
		icon: AgentIcon,
		section: "agent",
		handler: "onOpenAgent",
	},
	{
		key: "inbox",
		labelKey: "sidebar.inbox",
		icon: InboxIcon,
		section: "inbox",
		handler: "onOpenInbox",
	},
	{
		key: "archive",
		labelKey: "sidebar.archive",
		icon: ArchiveIcon,
		section: "archive",
		handler: "onOpenArchive",
	},
	{
		key: "tasks",
		labelKey: "sidebar.tasks",
		icon: TasksIcon,
		section: "tasks",
		handler: "onOpenTasks",
	},
	{
		key: "connections",
		labelKey: "sidebar.connections",
		icon: ConnectionsIcon,
		section: "connections",
		handler: "onOpenConnections",
	},
	{
		key: "quickNote",
		labelKey: "sidebar.quickNote",
		icon: QuickNoteIcon,
		handler: "onOpenQuickNote",
	},
	{
		key: "templates",
		labelKey: "sidebar.templates",
		icon: TemplatesIcon,
		handler: "onCreateFromTemplate",
	},
	{
		key: "gitSync",
		labelKey: "sidebar.gitSync",
		icon: SyncIcon,
		handler: "onGitSyncNow",
	},
];
