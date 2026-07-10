import {
	ArrowLeft02Icon,
	ArrowUpRight01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUILayoutContext } from "../../contexts";
import { GLYPH_LINKS } from "../../lib/helpMenu";
import { useLicenseStatus } from "../../lib/license";
import { cn } from "../../lib/utils";
import { Search, X } from "../Icons";
import { SETTINGS_TAB_GROUPS } from "../settings/settingsConfig";
import {
	localizedSettingsTabLabel,
	scrollToSettingsSearchEntry,
	searchSettingsEntries,
} from "../settings/settingsSearch";
import { Button } from "../ui/shadcn/button";

export const SidebarSettingsContent = memo(function SidebarSettingsContent() {
	const { t: tGeneral, i18n } = useTranslation("settings.general");
	const { settingsTab, setSettingsTab, closeSettings } = useUILayoutContext();
	const { status: licenseStatus } = useLicenseStatus(false);
	const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
	const [settingsSearchActive, setSettingsSearchActive] = useState(false);
	const settingsSearchResults = useMemo(
		() => searchSettingsEntries(settingsSearchQuery, 8, i18n.language),
		[settingsSearchQuery, i18n.language],
	);
	const hasSearchQuery =
		settingsSearchActive && settingsSearchQuery.trim().length > 0;

	const selectSearchResult = (
		result: (typeof settingsSearchResults)[number],
	) => {
		setSettingsSearchActive(false);
		setSettingsSearchQuery("");
		setSettingsTab(result.tab);
		scrollToSettingsSearchEntry(result);
	};

	const clearSettingsSearch = () => {
		setSettingsSearchActive(false);
		setSettingsSearchQuery("");
	};

	return (
		<>
			<div className="sidebarSection sidebarSectionGrow settingsSidebarNavSection">
				<div className="settingsSidebarBackRow">
					<button
						type="button"
						className="sidebarQuickActionBtn settingsBackButton"
						onClick={closeSettings}
					>
						<HugeiconsIcon
							icon={ArrowLeft02Icon}
							size="var(--icon-md)"
							strokeWidth={0.9}
						/>
						<span className="sidebarQuickActionLabel">Back</span>
					</button>
				</div>

				<div className="settingsSidebarSearch">
					<Search size="var(--icon-md)" className="settingsSidebarSearchIcon" />
					<input
						type="search"
						className="settingsSidebarSearchInput"
						value={settingsSearchQuery}
						onChange={(event) => {
							const nextQuery = event.target.value;
							setSettingsSearchQuery(nextQuery);
							setSettingsSearchActive(nextQuery.trim().length > 0);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter" && settingsSearchResults[0]) {
								event.preventDefault();
								selectSearchResult(settingsSearchResults[0]);
							}
							if (event.key === "Escape" && settingsSearchQuery) {
								event.preventDefault();
								clearSettingsSearch();
							}
						}}
						placeholder={tGeneral("nav.searchPlaceholder")}
						aria-label={tGeneral("nav.searchAriaLabel")}
					/>
					{hasSearchQuery ? (
						<button
							type="button"
							className="settingsSidebarSearchClear"
							onClick={clearSettingsSearch}
							aria-label={tGeneral("nav.clearSearchAriaLabel")}
						>
							<X size="var(--icon-sm)" />
						</button>
					) : null}
				</div>

				{hasSearchQuery ? (
					<div className="settingsSidebarSearchResults" aria-live="polite">
						{settingsSearchResults.length > 0 ? (
							settingsSearchResults.map((result) => (
								<button
									key={result.id}
									type="button"
									className={cn(
										"settingsSearchResultButton",
										settingsTab === result.tab &&
											"settingsSearchResultButtonActive",
									)}
									onClick={() => selectSearchResult(result)}
									aria-current={settingsTab === result.tab ? "page" : undefined}
								>
									<span className="settingsSearchResultTitle">
										{result.title}
									</span>
									<span className="settingsSearchResultMeta">
										{result.section
											? `${result.tabLabel} / ${result.section}`
											: result.tabLabel}
									</span>
									{result.description ? (
										<span className="settingsSearchResultDescription">
											{result.description}
										</span>
									) : null}
								</button>
							))
						) : (
							<div className="settingsSearchEmpty">No matching settings</div>
						)}
					</div>
				) : (
					<div className="sidebarQuickActions settingsSidebarTabs">
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
									{group.id === "application"
										? tGeneral("nav.groupApplication")
										: group.label}
								</h3>
								{group.tabs.map((tab) => (
									<button
										key={tab.id}
										type="button"
										data-tab={tab.id}
										className={cn(
											"sidebarQuickActionBtn settingsTabButton",
											settingsTab === tab.id && "settingsTabButtonActive",
										)}
										onClick={() => setSettingsTab(tab.id)}
										aria-pressed={settingsTab === tab.id}
										aria-current={settingsTab === tab.id ? "page" : undefined}
									>
										<span className="settingsTabIcon" aria-hidden="true">
											{tab.renderIcon()}
										</span>
										<span className="sidebarQuickActionLabel settingsTabLabel">
											{localizedSettingsTabLabel(tab.id, i18n.language)}
										</span>
									</button>
								))}
							</section>
						))}
					</div>
				)}
			</div>

			<div className="settingsSidebarFooter">
				{licenseStatus?.mode === "community_build" ? (
					<div className="settingsFeedbackCard settingsFeedbackCardCommunity">
						<span className="settingsFeedbackBadge">Community build</span>
						<div className="settingsFeedbackTitle">
							Thanks for building Glyph
						</div>
						<p className="settingsFeedbackBody">
							Get automatic updates and the official build with a license.
						</p>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="settingsFeedbackAction settingsFeedbackActionCommunity"
							onClick={() => void openUrl(licenseStatus.purchase_url)}
						>
							Buy official license
							<HugeiconsIcon
								icon={ArrowUpRight01Icon}
								size="var(--icon-sm)"
								strokeWidth={1.5}
							/>
						</Button>
					</div>
				) : (
					<div className="settingsFeedbackCard">
						<span className="settingsFeedbackBadge">Early access</span>
						<div className="settingsFeedbackTitle">Help shape Glyph</div>
						<p className="settingsFeedbackBody">
							Glyph is actively evolving — you may hit rough edges. If something
							feels off, I'd love to hear about it.
						</p>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="settingsFeedbackAction"
							onClick={() => void openUrl(GLYPH_LINKS.discord)}
						>
							Send feedback
							<HugeiconsIcon
								icon={ArrowUpRight01Icon}
								size="var(--icon-sm)"
								strokeWidth={1.5}
							/>
						</Button>
					</div>
				)}
			</div>
		</>
	);
});
