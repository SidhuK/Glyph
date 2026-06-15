import { AlphaIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { type AppInfo, invoke } from "../../lib/tauri";

function isAlphaVersion(version: string | undefined): boolean {
	if (!version) return false;
	return version.toLowerCase().includes("alpha");
}

export function SidebarAlphaBadge() {
	const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const info = await invoke("app_info");
				if (!cancelled) setAppInfo(info);
			} catch {
				// silently ignore
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	if (!isAlphaVersion(appInfo?.version)) return null;

	return (
		<div className="sidebarAlphaBadgeRow">
			<div className="sidebarAlphaBadge">
				<HugeiconsIcon icon={AlphaIcon} size="10px" strokeWidth={1.8} />
				<span className="sidebarAlphaBadgeText">Alpha</span>
			</div>
		</div>
	);
}
