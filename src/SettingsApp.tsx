import "./App.css";
import { AiBrain04Icon } from "@hugeicons/core-free-icons";
import { TextFontIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LazyMotion, domAnimation } from "motion/react";
import {
	type ReactElement,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
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
type SettingsTabMeta = {
	id: SettingsTab;
	label: string;
	subtitle: string;
	renderIcon: () => ReactElement;
};

const SETTINGS_TABS: SettingsTabMeta[] = [
	{
		id: "general",
		label: "General",
		subtitle: "Assistant defaults, analytics, and core app behavior.",
		renderIcon: () => <SettingsIcon size={14} />,
	},
	{
		id: "appearance",
		label: "Appearance",
		subtitle: "Theme mode, accent palette, and typography choices.",
		renderIcon: () => <HugeiconsIcon icon={TextFontIcon} size={14} />,
	},
	{
		id: "ai",
		label: "AI",
		subtitle: "Providers, profiles, API keys, and model settings.",
		renderIcon: () => <HugeiconsIcon icon={AiBrain04Icon} size={14} />,
	},
	{
		id: "vault",
		label: "Vault",
		subtitle: "Current vault details, recent vaults, and index tools.",
		renderIcon: () => <FolderOpen size={14} />,
	},
	{
		id: "about",
		label: "About",
		subtitle: "Version info, release updates, and support links.",
		renderIcon: () => <InformationCircle size={14} />,
	},
];

const SETTINGS_TAB_IDS = new Set<SettingsTab>(
	SETTINGS_TABS.map((tab) => tab.id),
);

function isSettingsTab(tab: string): tab is SettingsTab {
	return SETTINGS_TAB_IDS.has(tab as SettingsTab);
}

function parseTabFromHash(hash: string): SettingsTab {
	const query = hash.split("?")[1] ?? "";
	const tab = new URLSearchParams(query).get("tab");
	if (tab && isSettingsTab(tab)) return tab;
	return "general";
}

export default function SettingsApp() {
	const [activeTab, setActiveTab] = useState<SettingsTab>(() =>
		parseTabFromHash(window.location.hash),
	);
	const activeTabMeta = useMemo(
		() => SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0],
		[activeTab],
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
	const closeWindow = useCallback(() => {
		void getCurrentWindow().close();
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
		<LazyMotion features={domAnimation}>
			<div className="settingsShell">
				<div className="settingsBackdrop" aria-hidden="true" />
				<div
					aria-hidden="true"
					className="settingsDragStrip"
					data-tauri-drag-region
					onMouseDown={onWindowDragMouseDown}
				/>
				<button
					type="button"
					className="settingsWindowClose"
					aria-label="Close settings"
					title="Close settings"
					onClick={closeWindow}
				>
					<span className="settingsWindowCloseGlyph" aria-hidden>
						×
					</span>
				</button>

				<main className="settingsMain">
					<div className="settingsFrame">
						<nav className="settingsTabs" aria-label="Settings sections">
							<header className="settingsNavHeader">
								<p className="settingsNavEyebrow">Preferences</p>
								<h1 className="settingsNavTitle">Glyph</h1>
								<p className="settingsNavMeta">macOS</p>
							</header>
							{SETTINGS_TABS.map((tab) => (
								<button
									key={tab.id}
									type="button"
									data-tab={tab.id}
									className={`settingsTabButton ${activeTab === tab.id ? "active" : ""}`}
									onClick={() => switchTab(tab.id)}
									aria-pressed={activeTab === tab.id}
									aria-current={activeTab === tab.id ? "page" : undefined}
								>
									<span className="settingsTabIcon" aria-hidden="true">
										{tab.renderIcon()}
									</span>
									<span>{tab.label}</span>
								</button>
							))}
						</nav>
						<div className="settingsTabPanel">
							<header className="settingsPanelHeader">
								<p className="settingsPanelEyebrow">Settings</p>
								<h2 className="settingsPanelTitle">{activeTabMeta.label}</h2>
								<p className="settingsPanelSubtitle">
									{activeTabMeta.subtitle}
								</p>
							</header>
							{tabContent}
						</div>
					</div>
				</main>
			</div>
		</LazyMotion>
	);
}
