import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { isPathSpecial } from "./MainTabsBreadcrumbs";
import type { WorkspaceTab } from "./useTabManager";

const ROW_ICON_SIZE = "var(--icon-sm)";

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

/** Lists every open tab when the strip overflows, with a check on the active one. */
export function TabOverflowMenu({
	tabs,
	activeTabId,
	tabLabel,
	onSelectTab,
}: TabOverflowMenuProps) {
	const { t } = useTranslation("shell");
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
							<span className="glyphMenuItemLabel">{label}</span>
							{active ? (
								<HugeiconsIcon
									icon={Tick02Icon}
									size={ROW_ICON_SIZE}
									strokeWidth={2.25}
									className="glyphMenuItemCheck"
								/>
							) : null}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
