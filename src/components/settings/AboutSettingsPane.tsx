import {
	BubbleChatQuestionIcon,
	CodesandboxIcon,
	NewTwitterIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUpdaterContext } from "../../contexts";
import { CHANGELOG_DATA } from "../../data/releaseNotes";
import { useLicenseStatus } from "../../lib/license";
import type { AppInfo } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";
import { ChangelogSection } from "./ChangelogSection";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";

export function AboutSettingsPane() {
	const { status: licenseStatus, loading: licenseLoading } =
		useLicenseStatus(false);
	const autoUpdater = useUpdaterContext();
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
	const [error, setError] = useState("");
	const [copyLabel, setCopyLabel] = useState("Copy Diagnostics");
	const copyResetTimerRef = useRef<
		ReturnType<typeof window.setTimeout> | undefined
	>(undefined);
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

	const versionLabel = useMemo(() => {
		if (!appInfo?.version) return "";
		return `v${appInfo.version}`;
	}, [appInfo?.version]);

	const scheduleCopyLabelReset = () => {
		if (copyResetTimerRef.current !== undefined) {
			window.clearTimeout(copyResetTimerRef.current);
		}
		copyResetTimerRef.current = window.setTimeout(() => {
			setCopyLabel("Copy Diagnostics");
			copyResetTimerRef.current = undefined;
		}, 1800);
	};

	const handleCopyDebugInfo = async () => {
		const info = `Name: ${appInfo?.name ?? "Glyph"}\nVersion: ${appInfo?.version ?? "-"}\nIdentifier: ${appInfo?.identifier ?? "-"}`;
		try {
			await navigator.clipboard.writeText(info);
			setCopyLabel("Copied to Clipboard");
			scheduleCopyLabelReset();
		} catch {
			setCopyLabel("Copy Failed");
			scheduleCopyLabelReset();
		}
	};

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
				<section className="settingsCard aboutHeroCard">
					<div className="aboutIdentity">
						<div className="aboutLogoWrap">
							<img
								src={`/glyph-app-icon.png?v=${appInfo?.version ?? "dev"}`}
								alt=""
								className="aboutLogo"
								aria-hidden="true"
							/>
						</div>
						<div className="aboutIdentityCopy">
							<div className="aboutTitleRow">
								<span className="aboutAppName">{appInfo?.name ?? "Glyph"}</span>
								<span className="aboutVersion">{versionLabel}</span>
							</div>
							<div className="aboutStatusRow">
								<span className="settingsPill aboutEarlyAccessBadge earlyAccessBadge">
									Early Access
								</span>
								<span
									className="aboutOpenSourceMark"
									title="Open Source project"
								>
									<HugeiconsIcon
										icon={CodesandboxIcon}
										size={12}
										strokeWidth={0.9}
									/>
									<span>Open Source</span>
								</span>
							</div>
						</div>
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
					) : (
						<SettingsRow
							label="Community build"
							description="Thanks for downloading and building Glyph yourself. To get updates, download the latest source and build again, or get the official licensed build to support the project and unlock automatic updates."
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
				</SettingsSection>

				<SettingsSection
					title="What’s New"
					description="See what’s new in recent versions of Glyph."
				>
					<ChangelogSection versions={CHANGELOG_DATA.versions} />
				</SettingsSection>

				<SettingsSection
					title="Support"
					description="Project links and diagnostics that help with support requests."
				>
					<SettingsRow
						label="Links"
						description="Open the author and project pages in your browser."
					>
						<div className="settingsActions aboutActions">
							<Button
								type="button"
								size="icon-sm"
								variant="outline"
								onClick={() => void openUrl("https://x.com/karat_sidhu")}
								aria-label="X (Twitter)"
								title="X (Twitter)"
							>
								<HugeiconsIcon
									icon={NewTwitterIcon}
									size={16}
									strokeWidth={0.9}
								/>
							</Button>
							<Button
								type="button"
								size="icon-sm"
								variant="outline"
								onClick={() =>
									void openUrl(
										"https://glyph.userjot.com/?cursor=1&order=top&limit=10",
									)
								}
								aria-label="Feedback"
								title="Feedback"
							>
								<HugeiconsIcon
									icon={BubbleChatQuestionIcon}
									size={16}
									strokeWidth={0.9}
								/>
							</Button>
						</div>
					</SettingsRow>
					<SettingsRow
						label="Diagnostics"
						description="Copy app metadata so you can paste it into bug reports or support threads."
					>
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="min-w-36 rounded-md border-border bg-background justify-center shadow-none"
							onClick={() => void handleCopyDebugInfo()}
						>
							{copyLabel}
						</Button>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
