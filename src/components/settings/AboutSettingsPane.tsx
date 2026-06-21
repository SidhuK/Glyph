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
import { useUpdaterContext } from "../../contexts";
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
					setError(e instanceof Error ? e.message : "Failed to load app info");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

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
				setUpdateStatus("You're already on the latest version.");
				return;
			}
			setUpdateStatus(
				`v${update.version} is downloaded and ready. Click the update button to install it.`,
			);
		} catch (e) {
			setUpdateStatus(
				e instanceof Error ? e.message : "Failed to check for updates",
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
						Your thoughts deserve a home,
						<br />
						not a server.
					</p>
					<p className="aboutAttribution">
						Made by{" "}
						<button
							type="button"
							className="settingsInlineLink"
							onClick={() => void openUrl("https://x.com/karat_sidhu")}
						>
							Karat Sidhu
						</button>
					</p>
					<div className="aboutQuickLinks" aria-label="About links">
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="aboutLinkButton"
							onClick={() => void openUrl("https://glyphformac.com")}
						>
							<HugeiconsIcon
								icon={GlobeIcon}
								size="var(--icon-lg)"
								strokeWidth={1.6}
							/>
							Website
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="aboutLinkButton"
							onClick={() => void openUrl("https://discord.gg/cNqrBfFx7D")}
						>
							<HugeiconsIcon
								icon={DiscordIcon}
								size="var(--icon-lg)"
								strokeWidth={1.6}
							/>
							Discord
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="aboutLinkButton"
							onClick={() => void openUrl("https://glyphformac.com/terms")}
						>
							<HugeiconsIcon
								icon={File01Icon}
								size="var(--icon-lg)"
								strokeWidth={1.6}
							/>
							Terms
						</Button>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="aboutLinkButton"
							onClick={() => void openUrl("https://glyphformac.com/privacy")}
						>
							<HugeiconsIcon
								icon={Shield01Icon}
								size="var(--icon-lg)"
								strokeWidth={1.6}
							/>
							Privacy
						</Button>
					</div>
				</section>

				<SettingsSection
					title="Updates"
					description={
						licenseLoading
							? "Checking whether this build can use automatic updates."
							: !licenseStatus
								? "Glyph could not determine whether this build can use automatic updates."
								: licenseStatus?.can_auto_update
									? "Check for new releases and install them without leaving Glyph."
									: "Community builds are updated manually."
					}
				>
					{licenseLoading ? null : !licenseStatus ? (
						<SettingsRow
							label="License status"
							description="Glyph could not verify the current license state in this window, so update actions are unavailable right now."
							stacked
							interactive={false}
						>
							<p className="settingsHint">Unknown license status</p>
						</SettingsRow>
					) : licenseStatus.can_auto_update ? (
						<>
							<SettingsRow
								label="App updates"
								description="Checks immediately and downloads the latest published version in the background. Installation only happens when you choose it."
							>
								<div className="settingsActions">
									<Button
										type="button"
										size="sm"
										disabled={autoUpdater.isChecking}
										onClick={() => void handleCheckForUpdates()}
									>
										{autoUpdater.isChecking ? "Checking…" : "Check for Updates"}
									</Button>
									{autoUpdater.updateReady ? (
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={autoUpdater.installAndRelaunch}
										>
											{autoUpdater.updateVersion
												? `Install ${autoUpdater.updateVersion}`
												: "Install Update"}
										</Button>
									) : null}
								</div>
							</SettingsRow>
							<SettingsRow
								label="Alpha releases"
								description="Get early access to alpha builds. These may be unstable, so only turn this on if you’re comfortable testing unfinished releases."
							>
								<SettingsToggle
									checked={releaseChannelState === "alpha"}
									disabled={isSavingReleaseChannel}
									ariaLabel="Alpha releases"
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
														: "Failed to save release channel",
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
							label="Community build"
							description="You’re using the Community and Open Source version of Glyph. Purchase an official license to support Glyph’s development and receive the latest updates automatically."
							stacked
							interactive={false}
						>
							<div className="settingsActions">
								<Button
									type="button"
									size="sm"
									onClick={() => void openUrl(licenseStatus.purchase_url)}
								>
									Buy Official License
								</Button>
							</div>
						</SettingsRow>
					)}
					{!licenseLoading && licenseStatus?.can_auto_update && updateStatus ? (
						<SettingsRow
							label="Status"
							description="Latest updater activity from this window."
							stacked
							interactive={false}
						>
							<p className="settingsHint">{updateStatus}</p>
						</SettingsRow>
					) : null}
					<SettingsRow
						label="Changelog"
						description="Open the published Glyph changelog in your browser."
					>
						<div className="settingsActions">
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() =>
									void openUrl("https://glyphformac.com/changelog")
								}
							>
								<HugeiconsIcon
									icon={ListViewIcon}
									size="var(--icon-md)"
									strokeWidth={1.6}
								/>
								View Changelog
							</Button>
						</div>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
