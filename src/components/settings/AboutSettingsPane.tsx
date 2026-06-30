import {
	DiscordIcon,
	File01Icon,
	GlobeIcon,
	ListViewIcon,
	Shield01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdaterContext } from "../../contexts";
import { GLYPH_LINKS } from "../../lib/helpMenu";
import { useLicenseStatus } from "../../lib/license";
import {
	type ReleaseChannel,
	loadSettings,
	setReleaseChannel,
} from "../../lib/settings";
import type { AppInfo } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";

export function AboutSettingsPane() {
	const { t } = useTranslation(["settings", "common"]);
	const { status: licenseStatus, loading: licenseLoading } =
		useLicenseStatus(false);
	const autoUpdater = useUpdaterContext();
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
	const [releaseChannelState, setReleaseChannelState] =
		useState<ReleaseChannel>("stable");
	const releaseChannelTouchedRef = useRef(false);
	const [isSavingReleaseChannel, setIsSavingReleaseChannel] = useState(false);
	const [error, setError] = useState("");
	const [updateStatus, setUpdateStatus] = useState("");
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const info = await invoke("app_info");
				if (cancelled) return;
				setAppInfo(info);
			} catch (e) {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : t("errors.loadAppInfo"));
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [t]);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (!cancelled && !releaseChannelTouchedRef.current) {
					setReleaseChannelState(settings.ui.releaseChannel);
				}
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, []);

	const versionLabel = useMemo(() => {
		if (!appInfo?.version) return "";
		return `v${appInfo.version}`;
	}, [appInfo?.version]);

	const handleCheckForUpdates = async () => {
		if (!licenseStatus?.can_auto_update) return;
		if (autoUpdater.isChecking) return;
		setUpdateStatus("");
		try {
			const update = await autoUpdater.checkForUpdates();
			if (!update) {
				setUpdateStatus(t("about.updates.latestVersion"));
				return;
			}
			setUpdateStatus(
				t("about.updates.updateReady", { version: update.version }),
			);
		} catch (e) {
			setUpdateStatus(
				e instanceof Error ? e.message : t("about.updates.checkFailed"),
			);
		}
	};
	return (
		<div className="settingsPane aboutPane">
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<section className="aboutHero" aria-labelledby="about-title">
					<img
						src={`/glyph-app-icon.png?v=${appInfo?.version ?? "dev"}`}
						alt=""
						className="aboutLogo"
						aria-hidden="true"
					/>
					<h2 id="about-title" className="aboutAppName">
						{appInfo?.name ?? "Glyph"}
						{versionLabel ? (
							<span className="aboutVersion">{versionLabel}</span>
						) : null}
					</h2>
					<p className="aboutTagline">
						{t("about.taglineLine1")}
						<br />
						{t("about.taglineLine2")}
					</p>
					<p className="aboutAttribution">
						{t("about.madeBy")}{" "}
						<button
							type="button"
							className="settingsInlineLink"
							onClick={() => void openUrl(GLYPH_LINKS.x)}
						>
							Karat Sidhu
						</button>
					</p>
					<div className="aboutQuickLinks" aria-label={t("about.links")}>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="aboutLinkButton"
							onClick={() => void openUrl(GLYPH_LINKS.website)}
						>
							<HugeiconsIcon
								icon={GlobeIcon}
								size="var(--icon-lg)"
								strokeWidth={1.6}
							/>
							{t("about.website")}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="aboutLinkButton"
							onClick={() => void openUrl(GLYPH_LINKS.discord)}
						>
							<HugeiconsIcon
								icon={DiscordIcon}
								size="var(--icon-lg)"
								strokeWidth={1.6}
							/>
							{t("about.discord")}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="aboutLinkButton"
							onClick={() => void openUrl(GLYPH_LINKS.terms)}
						>
							<HugeiconsIcon
								icon={File01Icon}
								size="var(--icon-lg)"
								strokeWidth={1.6}
							/>
							{t("about.terms")}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="aboutLinkButton"
							onClick={() => void openUrl(GLYPH_LINKS.privacy)}
						>
							<HugeiconsIcon
								icon={Shield01Icon}
								size="var(--icon-lg)"
								strokeWidth={1.6}
							/>
							{t("about.privacy")}
						</Button>
					</div>
				</section>

				<SettingsSection
					title={t("about.updates.title")}
					description={
						licenseLoading
							? t("about.updates.checkingLicense")
							: !licenseStatus
								? t("about.updates.licenseUnknown")
								: licenseStatus?.can_auto_update
									? t("about.updates.canAutoUpdate")
									: t("about.updates.communityBuild")
					}
				>
					{licenseLoading ? null : !licenseStatus ? (
						<SettingsRow
							label={t("about.updates.licenseStatus")}
							description={t("about.updates.licenseStatusDescription")}
							stacked
							interactive={false}
						>
							<p className="settingsHint">
								{t("about.updates.unknownLicenseStatus")}
							</p>
						</SettingsRow>
					) : licenseStatus.can_auto_update ? (
						<>
							<SettingsRow
								label={t("about.updates.appUpdates")}
								description={t("about.updates.appUpdatesDescription")}
							>
								<div className="settingsActions">
									<Button
										type="button"
										size="sm"
										disabled={autoUpdater.isChecking}
										onClick={() => void handleCheckForUpdates()}
									>
										{autoUpdater.isChecking
											? t("about.updates.checking")
											: t("about.updates.checkForUpdates")}
									</Button>
									{autoUpdater.updateReady ? (
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={autoUpdater.installAndRelaunch}
										>
											{autoUpdater.updateVersion
												? t("about.updates.installVersion", {
														version: autoUpdater.updateVersion,
													})
												: t("about.updates.installUpdate")}
										</Button>
									) : null}
								</div>
							</SettingsRow>
							<SettingsRow
								label={t("about.updates.alphaReleases")}
								description={t("about.updates.alphaReleasesDescription")}
							>
								<SettingsToggle
									checked={releaseChannelState === "alpha"}
									disabled={isSavingReleaseChannel}
									ariaLabel={t("about.updates.alphaReleases")}
									onCheckedChange={(checked) => {
										const previous = releaseChannelState;
										const nextChannel: ReleaseChannel = checked
											? "alpha"
											: "stable";
										releaseChannelTouchedRef.current = true;
										setError("");
										setUpdateStatus("");
										setReleaseChannelState(nextChannel);
										setIsSavingReleaseChannel(true);
										void setReleaseChannel(nextChannel)
											.catch((cause) => {
												setReleaseChannelState(previous);
												setError(
													cause instanceof Error
														? cause.message
														: t("about.updates.saveReleaseChannelFailed"),
												);
											})
											.finally(() => {
												setIsSavingReleaseChannel(false);
											});
									}}
								/>
							</SettingsRow>
						</>
					) : (
						<SettingsRow
							label={t("about.updates.communityBuildLabel")}
							description={t("about.updates.communityBuildDescription")}
							stacked
							interactive={false}
						>
							<div className="settingsActions">
								<Button
									type="button"
									size="sm"
									onClick={() => void openUrl(licenseStatus.purchase_url)}
								>
									{t("about.updates.buyOfficialLicense")}
								</Button>
							</div>
						</SettingsRow>
					)}
					{!licenseLoading && licenseStatus?.can_auto_update && updateStatus ? (
						<SettingsRow
							label={t("about.updates.statusLabel")}
							description={t("about.updates.statusDescription")}
							stacked
							interactive={false}
						>
							<p className="settingsHint">{updateStatus}</p>
						</SettingsRow>
					) : null}
					<SettingsRow
						label={t("about.updates.changelog")}
						description={t("about.updates.changelogDescription")}
					>
						<div className="settingsActions">
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => void openUrl(GLYPH_LINKS.changelog)}
							>
								<HugeiconsIcon
									icon={ListViewIcon}
									size="var(--icon-md)"
									strokeWidth={1.6}
								/>
								{t("about.updates.viewChangelog")}
							</Button>
						</div>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
