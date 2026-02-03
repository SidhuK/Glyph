import { listen } from "@tauri-apps/api/event";
import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { Settings as SettingsIcon, Sparkles } from "./components/Icons";
import { MotionIconButton } from "./components/MotionUI";
import { AiSettingsPane } from "./components/settings/AiSettingsPane";
import { GeneralSettingsPane } from "./components/settings/GeneralSettingsPane";
import { VaultSettingsPane } from "./components/settings/VaultSettingsPane";
import type { SettingsTab } from "./lib/windows";

function parseTabFromHash(hash: string): SettingsTab {
	const raw = hash.startsWith("#/settings")
		? hash.slice("#/settings".length)
		: "";
	const query = raw.startsWith("?") ? raw.slice(1) : "";
	const params = new URLSearchParams(query);
	const tab = params.get("tab");
	if (tab === "vault" || tab === "ai" || tab === "general") return tab;
	return "general";
}

function setSettingsHash(tab: SettingsTab) {
	window.location.hash = `#/settings?tab=${encodeURIComponent(tab)}`;
}

export default function SettingsApp() {
	const [tab, setTab] = useState<SettingsTab>(() =>
		parseTabFromHash(window.location.hash),
	);

	useEffect(() => {
		const onHashChange = () => setTab(parseTabFromHash(window.location.hash));
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, []);

	useEffect(() => {
		let unlisten: (() => void) | null = null;
		(async () => {
			unlisten = await listen<{ tab: SettingsTab }>(
				"settings:navigate",
				(evt) => {
					if (!evt.payload?.tab) return;
					setSettingsHash(evt.payload.tab);
				},
			);
		})();
		return () => {
			unlisten?.();
		};
	}, []);

	const title = useMemo(() => {
		if (tab === "ai") return "AI";
		if (tab === "vault") return "Vault";
		return "General";
	}, [tab]);

	return (
		<div className="settingsShell">
			<div className="settingsHeader" data-tauri-drag-region>
				<div className="settingsHeaderLeft">
					<div className="settingsHeaderTitle">
						<SettingsIcon size={16} />
						<span>Settings</span>
					</div>
					<div className="settingsHeaderSubtitle">{title}</div>
				</div>
				<div className="settingsHeaderRight">
					<MotionIconButton
						type="button"
						size="sm"
						onClick={() => setSettingsHash("ai")}
						title="AI settings"
						active={tab === "ai"}
					>
						<Sparkles size={14} />
					</MotionIconButton>
				</div>
			</div>

			<div className="settingsBody">
				<nav className="settingsNav" data-window-drag-ignore>
					<button
						type="button"
						className={tab === "general" ? "active" : ""}
						onClick={() => setSettingsHash("general")}
					>
						General
					</button>
					<button
						type="button"
						className={tab === "vault" ? "active" : ""}
						onClick={() => setSettingsHash("vault")}
					>
						Vault
					</button>
					<button
						type="button"
						className={tab === "ai" ? "active" : ""}
						onClick={() => setSettingsHash("ai")}
					>
						AI
					</button>
				</nav>

				<main className="settingsMain" data-window-drag-ignore>
					{tab === "general" ? <GeneralSettingsPane /> : null}
					{tab === "vault" ? <VaultSettingsPane /> : null}
					{tab === "ai" ? <AiSettingsPane /> : null}
				</main>
			</div>
		</div>
	);
}
