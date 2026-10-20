import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuItemCheck,
	DropdownMenuItemIcon,
	DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import {
	AiBrain04Icon,
	Archive03Icon,
	ArrowDown01Icon,
	ChartRelationshipIcon,
	CheckListIcon,
	InboxIcon,
	LibraryIcon,
	NoteIcon,
	PlusSignSquareIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext } from "../../contexts";
import { ACTIVITY_TIMELINE_TAB_ID, ARCHIVE_TAB_ID, INBOX_TAB_ID } from "../../lib/activityTimeline";
import { AGENT_VIEW_TAB_ID } from "../../lib/agentView";
import { DATABASES_TAB_ID } from "../../lib/databases";
import { SPACE_CONNECTIONS_TAB_ID } from "../../lib/spaceConnections";
import { TASKS_TAB_ID } from "../../lib/tasks";
import type { FileTreeAppearance } from "../../lib/tauri";
import { isMarkdownPath } from "../../utils/path";
import { AppearanceIcon } from "../AppearanceIcon";
import { getFileTypeInfo } from "../filetree/fileTypeUtils";
import { isPathSpecial } from "./MainTabsBreadcrumbs";
import type { WorkspaceTab } from "./useTabManager";

const ROW_ICON_SIZE = "var(--icon-sm)";

// Same icons the sidebar uses for these views.
const SPECIAL_TAB_ICONS = new Map<string, IconSvgElement>([
	[AGENT_VIEW_TAB_ID, AiBrain04Icon],
	[INBOX_TAB_ID, InboxIcon],
	[ARCHIVE_TAB_ID, Archive03Icon],
	[ACTIVITY_TIMELINE_TAB_ID, NoteIcon],
	[DATABASES_TAB_ID, LibraryIcon],
	[SPACE_CONNECTIONS_TAB_ID, ChartRelationshipIcon],
	[TASKS_TAB_ID, CheckListIcon],
]);

interface TabOverflowMenuProps {
	tabs: WorkspaceTab[];
	activeTabId: string | null;
	tabLabel: (tab: WorkspaceTab) => string;
	onSelectTab: (tabId: string) => void;
}

function overflowLabel(tab: WorkspaceTab, tabLabel: (tab: WorkspaceTab) => string): string {
	if (!tab.target || isPathSpecial(tab.target)) return tabLabel(tab);
	return tab.target.replace(/([^/])\.[^./]+$/, "$1");
}

function TabRowIcon({
	tab,
	appearance,
}: {
	tab: WorkspaceTab;
	appearance: FileTreeAppearance | undefined;
}) {
	if (tab.kind === "blank" || !tab.target)
		return <DropdownMenuItemIcon icon={PlusSignSquareIcon} />;
	const specialIcon = SPECIAL_TAB_ICONS.get(tab.target);
	if (specialIcon) return <DropdownMenuItemIcon icon={specialIcon} />;
	if (appearance?.icon) {
		return (
			<AppearanceIcon
				iconName={appearance.icon}
				size={ROW_ICON_SIZE}
				className="glyphMenuItemIcon"
			/>
		);
	}
	const { Icon } = getFileTypeInfo(tab.target, isMarkdownPath(tab.target));
	return <Icon size={ROW_ICON_SIZE} className="glyphMenuItemIcon" aria-hidden="true" />;
}

/** Lists every open tab when the strip overflows, with a check on the active one. */
export function TabOverflowMenu({
	tabs,
	activeTabId,
	tabLabel,
	onSelectTab,
}: TabOverflowMenuProps) {
	const { t } = useTranslation("shell");
	const { itemAppearance } = useFileTreeContext();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						className="mainTabAdd mainTabOverflow"
						title={t("tabs.showAllTabs")}
						aria-label={t("tabs.showAllTabs")}
					/>
				}
			>
				<HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={2} aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" side="bottom">
				{tabs.map((tab) => {
					const active = tab.id === activeTabId;
					const label = overflowLabel(tab, tabLabel);
					return (
						<DropdownMenuItem
							key={tab.id}
							title={label}
							onClick={() => {
								if (!active) onSelectTab(tab.id);
							}}
						>
							<TabRowIcon
								tab={tab}
								appearance={tab.target ? itemAppearance[tab.target] : undefined}
							/>
							<span className="glyphMenuItemLabel">{label}</span>
							{active ? <DropdownMenuItemCheck /> : null}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
