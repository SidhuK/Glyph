import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { useEffect, useMemo, useState } from "react";
import type { AppInfo } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";

export function AboutSettingsPane() {
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
	const [error, setError] = useState("");
	const [copyLabel, setCopyLabel] = useState("Copy Debug Info");
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

	const handleCopyDebugInfo = async () => {
		const info = `Name: ${appInfo?.name ?? "Glyph"}\nVersion: ${appInfo?.version ?? "-"}\nIdentifier: ${appInfo?.identifier ?? "-"}`;
		try {
			await navigator.clipboard.writeText(info);
			setCopyLabel("Copied");
			window.setTimeout(() => setCopyLabel("Copy Debug Info"), 1800);
		} catch {
			setCopyLabel("Copy failed");
			window.setTimeout(() => setCopyLabel("Copy Debug Info"), 1800);
		}
	};

	const handleCheckForUpdates = async () => {
		if (checkingUpdates) return;
		setCheckingUpdates(true);
		setUpdateStatus("");
		try {
			const update = await check();
			if (!update) {
				setUpdateStatus("You are on the latest version.");
				return;
			}
			setUpdateStatus(`Installing v${update.version}...`);
			await update.downloadAndInstall();
			setUpdateStatus("Update installed. Restarting Glyph...");
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

			<div className="aboutContent">
				<div className="aboutLogoWrap">
					<img
						src="/glyph-app-icon.png"
						alt=""
						className="aboutLogo"
						aria-hidden="true"
					/>
				</div>
				<div className="aboutTitleRow">
					<span className="aboutAppName">{appInfo?.name ?? "Glyph"}</span>
					<span className="aboutVersion">{versionLabel}</span>
				</div>

				<div className="aboutLinksRow">
					<button
						type="button"
						onClick={() => void openUrl("https://x.com/karat_sidhu")}
					>
						Twitter
					</button>
					<span className="aboutDot">·</span>
					<button
						type="button"
						onClick={() => void openUrl("https://github.com/SidhuK")}
					>
						GitHub
					</button>
					<span className="aboutDot">·</span>
					<button type="button" onClick={() => void handleCopyDebugInfo()}>
						{copyLabel}
					</button>
				</div>

				<div className="aboutLinksRow aboutActionsRow">
					<button
						type="button"
						onClick={() =>
							void openUrl("https://github.com/SidhuK/Glyph/releases")
						}
					>
						Changelog
					</button>
					<button
						type="button"
						disabled={checkingUpdates}
						onClick={() => void handleCheckForUpdates()}
					>
						{checkingUpdates ? "Checking..." : "Check for Updates"}
					</button>
				</div>
				{updateStatus ? <p className="settingsHint">{updateStatus}</p> : null}
			</div>
		</div>
	);
}
