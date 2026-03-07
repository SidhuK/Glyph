import { CodesandboxIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppInfo } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";

export function AboutSettingsPane() {
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
	const [error, setError] = useState("");
	const [copyLabel, setCopyLabel] = useState("Copy Diagnostics");
	const copyResetTimerRef = useRef<
		ReturnType<typeof window.setTimeout> | undefined
	>(undefined);
	const [updateStatus, setUpdateStatus] = useState("");
	const [checkingUpdates, setCheckingUpdates] = useState(false);

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

	useEffect(() => {
		return () => {
			if (copyResetTimerRef.current !== undefined) {
				window.clearTimeout(copyResetTimerRef.current);
				copyResetTimerRef.current = undefined;
			}
		};
	}, []);

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
		if (checkingUpdates) return;
		setCheckingUpdates(true);
		setUpdateStatus("");
		try {
			const update = await check();
			if (!update) {
				setUpdateStatus("You're already on the latest version.");
				return;
			}
			setUpdateStatus(`Downloading v${update.version}...`);
			await update.download();
			setUpdateStatus(`Installing v${update.version}...`);
			await update.install();
			setUpdateStatus("Restarting Glyph...");
			await relaunch();
		} catch (e) {
			setUpdateStatus(
				e instanceof Error ? e.message : "Failed to check for updates",
			);
		} finally {
			setCheckingUpdates(false);
		}
	};

	return (
		<div className="settingsPane aboutPane">
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<SettingsSection
					title="Glyph"
					description="Build details and quick project information."
				>
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
									<HugeiconsIcon icon={CodesandboxIcon} size={12} />
									<span>Open Source</span>
								</span>
							</div>
						</div>
					</div>
					<SettingsRow
						label="Identifier"
						description="Useful when debugging builds, updates, or diagnostics."
					>
						<div className="settingsValue mono">
							{appInfo?.identifier ?? "Loading…"}
						</div>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection
					title="Updates"
					description="Check for new releases and install them without leaving Glyph."
				>
					<SettingsRow
						label="App updates"
						description="Download and install the latest published version."
					>
						<Button
							type="button"
							size="sm"
							disabled={checkingUpdates}
							onClick={() => void handleCheckForUpdates()}
						>
							{checkingUpdates ? "Checking…" : "Check for Updates"}
						</Button>
					</SettingsRow>
					{updateStatus ? (
						<SettingsRow
							label="Status"
							description="Latest updater activity from this window."
							stacked
						>
							<p className="settingsHint">{updateStatus}</p>
						</SettingsRow>
					) : null}
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
								size="sm"
								variant="outline"
								onClick={() => void openUrl("https://x.com/karat_sidhu")}
							>
								X
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => void openUrl("https://github.com/SidhuK")}
							>
								GitHub
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
							variant="ghost"
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
