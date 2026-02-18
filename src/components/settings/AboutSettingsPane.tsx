import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useState } from "react";
import type { AppInfo } from "../../lib/tauri";
import { invoke } from "../../lib/tauri";

export function AboutSettingsPane() {
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
	const [error, setError] = useState("");
	const [copyLabel, setCopyLabel] = useState("Copy Debug Info");

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
							void openUrl("https://github.com/SidhuK/Tether/releases")
						}
					>
						Changelog
					</button>
					<button
						type="button"
						onClick={() =>
							void openUrl("https://github.com/SidhuK/Tether/releases/latest")
						}
					>
						Check for Updates
					</button>
				</div>
			</div>
		</div>
	);
}
