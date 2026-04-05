import {
	ArrowLeft02Icon,
	ArrowUpRight01Icon,
	BubbleChatQuestionIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { memo } from "react";
import { useUILayoutContext } from "../../contexts";
import { useLicenseStatus } from "../../lib/license";
import { cn } from "../../lib/utils";
import {
	SETTINGS_TABS,
	type SettingsTab,
} from "../settings/settingsConfig";
import { Button } from "../ui/shadcn/button";

export const SidebarSettingsContent = memo(function SidebarSettingsContent() {
	const { settingsTab, setSettingsTab, closeSettings } = useUILayoutContext();
	const { status: licenseStatus } = useLicenseStatus(false);

	return (
		<>
			<div className="sidebarSection sidebarSectionGrow settingsSidebarNavSection">
				<div className="settingsSidebarBackRow">
					<button
						type="button"
						className="sidebarQuickActionBtn settingsBackButton"
						onClick={closeSettings}
					>
						<HugeiconsIcon icon={ArrowLeft02Icon} size={14} strokeWidth={0.9} />
						<span className="sidebarQuickActionLabel">Back</span>
					</button>
				</div>
				<div className="sidebarQuickActions settingsSidebarTabs">
					{SETTINGS_TABS.map((tab) => (
						<button
							key={tab.id}
							type="button"
							data-tab={tab.id}
							className={cn(
								"sidebarQuickActionBtn settingsTabButton",
								settingsTab === tab.id && "settingsTabButtonActive",
							)}
							onClick={() => setSettingsTab(tab.id as SettingsTab)}
							aria-pressed={settingsTab === tab.id}
							aria-current={settingsTab === tab.id ? "page" : undefined}
						>
							<span className="settingsTabIcon" aria-hidden="true">
								{tab.renderIcon()}
							</span>
							<span className="sidebarQuickActionLabel settingsTabLabel">
								{tab.label}
							</span>
							{tab.badgeText ? (
								<span
									className={`settingsTabBadge earlyAccessBadge ${tab.id === "git" ? "settingsBetaBadge" : ""}`}
								>
									{tab.badgeIcon ? tab.badgeIcon() : null}
									<span>{tab.badgeText}</span>
								</span>
							) : null}
						</button>
					))}
				</div>
			</div>

			<div className="sidebarFooter settingsSidebarFooter">
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
								size={14}
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
							onClick={() =>
								void openUrl(
									"https://glyph.userjot.com/?cursor=1&order=top&limit=10",
								)
							}
						>
							<HugeiconsIcon
								icon={BubbleChatQuestionIcon}
								size={15}
								strokeWidth={0.9}
							/>
							Send Feedback
							<HugeiconsIcon
								icon={ArrowUpRight01Icon}
								size={14}
								strokeWidth={0.9}
							/>
						</Button>
					</div>
				)}
			</div>
		</>
	);
});
