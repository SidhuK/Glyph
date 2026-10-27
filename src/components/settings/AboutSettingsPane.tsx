import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	DiscordIcon,
	File01Icon,
	GlobeIcon,
	ListViewIcon,
	Shield01Icon,
} from "@hugeicons/core-free-icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import karatPortrait from "../../assets/karat-sidhu-blueprint.webp";
import { useUpdaterContext } from "../../contexts";
import { GLYPH_LINKS } from "../../lib/helpMenu";
import { extractErrorMessage } from "../../lib/errorUtils";
import { useLicenseStatus } from "../../lib/license";
import { type ReleaseChannel, loadSettings } from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import type { AppInfo } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";
import { SettingsRow, SettingsSection, SettingsToggle } from "./SettingsScaffold";
import { useDeveloperMode } from "./useDeveloperMode";

export function AboutSettingsPane() {
	const { t } = useTranslation("settings.general");
	const { status: licenseStatus, loading: licenseLoading } = useLicenseStatus(false);
	const autoUpdater = useUpdaterContext();
	const developerMode = useDeveloperMode();
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
	const [releaseChannelState, setReleaseChannelState] = useState<ReleaseChannel>("stable");
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
					setError(e instanceof Error ? e.message : t("about.errors.loadInfoFailed"));
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
				setUpdateStatus(t("about.updates.upToDate"));
				return;
			}
			setUpdateStatus(t("about.updates.ready", { version: update.version }));
		} catch (e) {
			setUpdateStatus(e instanceof Error ? e.message : t("about.errors.checkFailed"));
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
						{versionLabel ? <span className="aboutVersion">{versionLabel}</span> : null}
					</h2>
					<p className="aboutTagline">
						{t("about.tagline.first")}
						<br />
						{t("about.tagline.second")}
					</p>
					<details className="aboutDeveloperDetails">
						<summary className="aboutAttribution aboutDeveloperSummary">
							{t("about.developer.madeBy")} <span className="settingsInlineLink">Karat Sidhu</span>
						</summary>
						<article className="aboutDeveloperCard">
							<div className="aboutDeveloperPortrait">
								<span className="aboutDeveloperMark" aria-hidden="true">
									KS / 01
								</span>
								<img src={karatPortrait} alt="" />
							</div>
							<div className="aboutDeveloperStory">
								<p className="aboutDeveloperEyebrow">{t("about.developer.eyebrow")}</p>
								<h3>Karat Sidhu</h3>
								<p className="aboutDeveloperBio">{t("about.developer.bio")}</p>
								<div className="aboutDeveloperLinks">
									<button
										type="button"
										className="aboutDeveloperLink"
										onClick={() => void openUrl(GLYPH_LINKS.github)}
									>
										{t("about.developer.github")}
										<span aria-hidden="true">↗</span>
									</button>
									<button
										type="button"
										className="aboutDeveloperLink"
										onClick={() => void openUrl(GLYPH_LINKS.x)}
									>
										{t("about.developer.twitter")}
										<span aria-hidden="true">↗</span>
									</button>
								</div>
							</div>
						</article>
					</details>
					<div className="aboutQuickLinks" aria-label={t("about.links.ariaLabel")}>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="aboutLinkButton"
							onClick={() => void openUrl(GLYPH_LINKS.website)}
						>
							<HugeiconsIcon icon={GlobeIcon} size="var(--icon-lg)" />
							{t("about.links.website")}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="aboutLinkButton"
							onClick={() => void openUrl(GLYPH_LINKS.discord)}
						>
							<HugeiconsIcon icon={DiscordIcon} size="var(--icon-lg)" />
							Discord
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="aboutLinkButton"
							onClick={() => void openUrl(GLYPH_LINKS.terms)}
						>
							<HugeiconsIcon icon={File01Icon} size="var(--icon-lg)" />
							{t("about.links.terms")}
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="aboutLinkButton"
							onClick={() => void openUrl(GLYPH_LINKS.privacy)}
						>
							<HugeiconsIcon icon={Shield01Icon} size="var(--icon-lg)" />
							{t("about.links.privacy")}
						</Button>
					</div>
				</section>

				<SettingsSection
					title={t("about.updates.sectionTitle")}
					description={
						licenseLoading
							? t("about.updates.descriptionLoading")
							: !licenseStatus
								? t("about.updates.descriptionUnknown")
								: licenseStatus?.can_auto_update
									? t("about.updates.descriptionAuto")
									: t("about.updates.descriptionManual")
					}
				>
					{licenseLoading ? null : !licenseStatus ? (
						<SettingsRow
							label={t("about.updates.licenseStatus.label")}
							description={t("about.updates.licenseStatus.description")}
							stacked
							interactive={false}
						>
							<p className="settingsHint">{t("about.updates.licenseStatus.unknown")}</p>
						</SettingsRow>
					) : licenseStatus.can_auto_update ? (
						<>
							<SettingsRow
								label={t("about.updates.appUpdates.label")}
								description={t("about.updates.appUpdates.description")}
							>
								<div className="settingsActions">
									<Button
										type="button"
										size="sm"
										disabled={autoUpdater.isChecking}
										onClick={() => void handleCheckForUpdates()}
									>
										{autoUpdater.isChecking
											? t("about.updates.appUpdates.checking")
											: t("about.updates.appUpdates.check")}
									</Button>
									{autoUpdater.updateReady ? (
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={autoUpdater.installAndRelaunch}
										>
											{autoUpdater.updateVersion
												? t("about.updates.appUpdates.installVersion", {
														version: autoUpdater.updateVersion,
													})
												: t("about.updates.appUpdates.install")}
										</Button>
									) : null}
								</div>
							</SettingsRow>
							<SettingsRow
								label={t("about.updates.alpha.label")}
								description={t("about.updates.alpha.description")}
							>
								<SettingsToggle
									checked={releaseChannelState === "alpha"}
									disabled={isSavingReleaseChannel}
									ariaLabel={t("about.updates.alpha.label")}
									onCheckedChange={(checked) => {
										const previous = releaseChannelState;
										const nextChannel: ReleaseChannel = checked ? "alpha" : "stable";
										releaseChannelTouchedRef.current = true;
										setError("");
										setUpdateStatus("");
										setReleaseChannelState(nextChannel);
										setIsSavingReleaseChannel(true);
										void DURABLE_SETTINGS.releaseChannel
											.write(nextChannel)
											.catch((cause) => {
												setReleaseChannelState(previous);
												setError(
													cause instanceof Error
														? cause.message
														: t("about.errors.saveChannelFailed"),
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
							label={t("about.updates.communityBuild.label")}
							description={t("about.updates.communityBuild.description")}
							stacked
							interactive={false}
						>
							<div className="settingsActions">
								<Button
									type="button"
									size="sm"
									onClick={() => void openUrl(licenseStatus.purchase_url)}
								>
									{t("license.buyOfficial")}
								</Button>
							</div>
						</SettingsRow>
					)}
					{!licenseLoading && licenseStatus?.can_auto_update && updateStatus ? (
						<SettingsRow
							label={t("about.updates.status.label")}
							description={t("about.updates.status.description")}
							stacked
							interactive={false}
						>
							<p className="settingsHint">{updateStatus}</p>
						</SettingsRow>
					) : null}
					<SettingsRow
						label={t("about.updates.changelog.label")}
						description={t("about.updates.changelog.description")}
					>
						<div className="settingsActions">
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => void openUrl(GLYPH_LINKS.changelog)}
							>
								<HugeiconsIcon icon={ListViewIcon} size="var(--icon-md)" />
								{t("about.updates.changelog.view")}
							</Button>
						</div>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection title={t("about.developerMode.sectionTitle")}>
					{developerMode.save.error ? (
						<div className="settingsError">{extractErrorMessage(developerMode.save.error)}</div>
					) : null}
					<SettingsRow
						label={t("about.developerMode.label")}
						description={t("about.developerMode.description")}
						searchId="about-developer-mode"
					>
						<SettingsToggle
							checked={developerMode.enabled}
							disabled={!developerMode.loaded || developerMode.save.isPending}
							ariaLabel={t("about.developerMode.ariaLabel")}
							onCheckedChange={(checked) => developerMode.save.mutate(checked)}
						/>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
