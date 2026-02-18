import "./App.css";
import { AiBrain04Icon } from "@hugeicons/core-free-icons";
import { TextFontIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	FolderOpen,
	InformationCircle,
	Settings as SettingsIcon,
} from "./components/Icons/NavigationIcons";
import { AboutSettingsPane } from "./components/settings/AboutSettingsPane";
import { AiSettingsPane } from "./components/settings/AiSettingsPane";
import { AppearanceSettingsPane } from "./components/settings/AppearanceSettingsPane";
import { DailyNotesSettingsPane } from "./components/settings/DailyNotesSettingsPane";
import { GeneralSettingsPane } from "./components/settings/GeneralSettingsPane";
import { VaultSettingsPane } from "./components/settings/VaultSettingsPane";
import { onWindowDragMouseDown } from "./utils/window";

type SettingsTab = "general" | "appearance" | "ai" | "vault" | "about";

function parseTabFromHash(hash: string): SettingsTab {
	const query = hash.split("?")[1] ?? "";
	const tab = new URLSearchParams(query).get("tab");
	if (tab === "general") return "general";
	if (tab === "appearance") return "appearance";
	if (tab === "ai") return "ai";
	if (tab === "vault") return "vault";
	if (tab === "about") return "about";
	return "general";
}

export default function SettingsApp() {
	const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
		parseTabFromHash(window.location.hash),
	);

	useEffect(() => {
		const onHashChange = () =>
			setActiveTab(parseTabFromHash(window.location.hash));
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, []);

	const switchTab = useCallback((tab: SettingsTab) => {
		setActiveTab(tab);
		const nextHash = `#/settings?tab=${encodeURIComponent(tab)}`;
		window.history.replaceState(null, "", nextHash);
	}, []);

	const tabContent = useMemo(() => {
		if (activeTab === "general") {
			return (
				<>
					<GeneralSettingsPane />
					<DailyNotesSettingsPane />
				</>
			);
		}
		if (activeTab === "appearance") return <AppearanceSettingsPane />;
		if (activeTab === "ai") return <AiSettingsPane />;
		if (activeTab === "about") return <AboutSettingsPane />;
		return <VaultSettingsPane />;
	}, [activeTab]);

	return (
		<div className="settingsShell" onMouseDown={onWindowDragMouseDown}>
			<div className="settingsBackdrop" aria-hidden="true" />
			<div
				aria-hidden="true"
				className="settingsDragStrip"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			/>

			<main className="settingsMain">
				<div className="settingsFrame">
					<nav className="settingsTabs" aria-label="Settings sections">
						<button
							type="button"
							className={`settingsTabButton ${activeTab === "general" ? "active" : ""}`}
							onClick={() => switchTab("general")}
							aria-pressed={activeTab === "general"}
							aria-current={activeTab === "general" ? "page" : undefined}
						>
							<SettingsIcon size={14} />
							<span>General</span>
						</button>
						<button
							type="button"
							className={`settingsTabButton ${activeTab === "appearance" ? "active" : ""}`}
							onClick={() => switchTab("appearance")}
							aria-pressed={activeTab === "appearance"}
							aria-current={activeTab === "appearance" ? "page" : undefined}
						>
							<HugeiconsIcon icon={TextFontIcon} size={14} />
							<span>Appearance</span>
						</button>
						<button
							type="button"
							className={`settingsTabButton ${activeTab === "ai" ? "active" : ""}`}
							onClick={() => switchTab("ai")}
							aria-pressed={activeTab === "ai"}
							aria-current={activeTab === "ai" ? "page" : undefined}
						>
							<HugeiconsIcon icon={AiBrain04Icon} size={14} />
							<span>AI</span>
						</button>
						<button
							type="button"
							className={`settingsTabButton ${activeTab === "vault" ? "active" : ""}`}
							onClick={() => switchTab("vault")}
							aria-pressed={activeTab === "vault"}
							aria-current={activeTab === "vault" ? "page" : undefined}
						>
							<FolderOpen size={14} />
							<span>Vault</span>
						</button>
						<button
							type="button"
							className={`settingsTabButton ${activeTab === "about" ? "active" : ""}`}
							onClick={() => switchTab("about")}
							aria-pressed={activeTab === "about"}
							aria-current={activeTab === "about" ? "page" : undefined}
						>
							<InformationCircle size={14} />
							<span>About</span>
						</button>
					</nav>
					<div className="settingsTabPanel">{tabContent}</div>
				</div>
			</main>
		</div>
	);
}
