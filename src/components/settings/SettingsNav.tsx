import { memo } from "react";
import { useTranslation } from "react-i18next";
import { useSpace, useUILayoutContext } from "../../contexts";
import { spaceDisplayName } from "../../lib/spaceRegistry";
import { Highlight, HighlightItem } from "../ui/shadcn/highlight";
import { SettingsNavFooter } from "./SettingsNavFooter";
import { SettingsNavSearchField } from "./SettingsNavSearchField";
import { SETTINGS_TAB_GROUPS, type SettingsTabGroup } from "./settingsConfig";
import { localizedSettingsTabLabel } from "./settingsSearch";
import { useSettingsSearch } from "./search/SettingsSearchContext";
import { useActiveSettingsTab, useDeveloperMode } from "./useDeveloperMode";

function useGroupHeading() {
	const { t } = useTranslation("settings.general");
	const { spacePath } = useSpace();
	return (group: SettingsTabGroup) =>
		group.id === "workspace" && spacePath
			? t("nav.groupSpace", { name: spaceDisplayName(spacePath) })
			: t(group.headingKey);
}

export const SettingsNav = memo(function SettingsNav() {
	const { i18n } = useTranslation("settings.general");
	const { setSettingsTab } = useUILayoutContext();
	const settingsTab = useActiveSettingsTab();
	const { enabled: developerModeEnabled } = useDeveloperMode();
	const { filter } = useSettingsSearch();
	const groupHeading = useGroupHeading();

	return (
		<div className="settingsSidebarNavSection">
			<SettingsNavSearchField />
			<div className="settingsSidebarTabs">
				<Highlight value={settingsTab} className="settingsSidebarTabsHighlight">
					{SETTINGS_TAB_GROUPS.map((group) => (
						<section
							key={group.id}
							className="settingsSidebarTabGroup"
							aria-labelledby={`settings-sidebar-group-${group.id}`}
						>
							<h3
								id={`settings-sidebar-group-${group.id}`}
								className="settingsSidebarTabGroupHeading"
							>
								{groupHeading(group)}
							</h3>
							{group.tabs
								.filter((tab) => tab.id !== "developer" || developerModeEnabled)
								.map((tab) => (
									<HighlightItem key={tab.id} value={tab.id}>
										<button
											type="button"
											data-tab={tab.id}
											data-search-dimmed={(filter && !filter.matchedTabs.has(tab.id)) || undefined}
											className="settingsTabButton"
											onClick={() => setSettingsTab(tab.id)}
											aria-current={settingsTab === tab.id ? "page" : undefined}
										>
											<span className="settingsTabIcon" aria-hidden="true">
												{tab.renderIcon()}
											</span>
											<span className="settingsTabLabel">
												{localizedSettingsTabLabel(tab.id, i18n.language)}
											</span>
										</button>
									</HighlightItem>
								))}
						</section>
					))}
				</Highlight>
			</div>
			<SettingsNavFooter />
		</div>
	);
});
