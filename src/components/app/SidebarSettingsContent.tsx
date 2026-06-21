import {
	ArrowLeft02Icon,
	ArrowUpRight01Icon,
	BubbleChatQuestionIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { memo, useMemo, useState } from "react";
import { useUILayoutContext } from "../../contexts";
import { useLicenseStatus } from "../../lib/license";
import { cn } from "../../lib/utils";
import { Search, X } from "../Icons";
import { SETTINGS_TAB_GROUPS } from "../settings/settingsConfig";
import {
	scrollToSettingsSearchEntry,
	searchSettingsEntries,
} from "../settings/settingsSearch";
import { Button } from "../ui/shadcn/button";

export const SidebarSettingsContent = memo(function SidebarSettingsContent() {
	const { settingsTab, setSettingsTab, closeSettings } = useUILayoutContext();
	const { status: licenseStatus } = useLicenseStatus(false);
	const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
	const [settingsSearchActive, setSettingsSearchActive] = useState(false);
	const settingsSearchResults = useMemo(
		() => searchSettingsEntries(settingsSearchQuery, 8),
		[settingsSearchQuery],
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
						placeholder="Search settings"
						aria-label="Search settings"
					/>
					{hasSearchQuery ? (
						<button
							type="button"
							className="settingsSidebarSearchClear"
							onClick={clearSettingsSearch}
							aria-label="Clear settings search"
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
									{group.label}
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
											{tab.label}
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
						<div className="settingsFeedbackEyebrow">Community Build</div>
						<div className="settingsFeedbackTitle">
							Thanks for downloading and building Glyph yourself.
						</div>
						<p className="settingsFeedbackBody">
							Support the project with the official license to get automatic
							updates and the official build.
						</p>
						<Button
							type="button"
							className="settingsFeedbackButton settingsFeedbackButtonCommunity"
							onClick={() => void openUrl(licenseStatus.purchase_url)}
						>
							Buy Official License
							<HugeiconsIcon
								icon={ArrowUpRight01Icon}
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
						</Button>
					</div>
				) : (
					<div className="settingsFeedbackCard">
						<div className="settingsFeedbackEyebrow">Still in Early Access</div>
						<div className="settingsFeedbackTitle">Help shape Glyph</div>
						<p className="settingsFeedbackBody">
							Glyph is actively evolving and changing, so you may run into rough
							edges here and there. If something feels off, I'd really love to
							hear about it.
						</p>
						<Button
							type="button"
							className="settingsFeedbackButton"
							onClick={() => void openUrl("https://discord.gg/cNqrBfFx7D")}
						>
							<HugeiconsIcon
								icon={BubbleChatQuestionIcon}
								size="var(--icon-lg)"
								strokeWidth={0.9}
							/>
							Send Feedback
							<HugeiconsIcon
								icon={ArrowUpRight01Icon}
								size="var(--icon-md)"
								strokeWidth={0.9}
							/>
						</Button>
					</div>
				)}
			</div>
		</>
	);
});
