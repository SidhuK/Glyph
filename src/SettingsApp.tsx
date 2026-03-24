import "./SettingsApp.css";
import {
	ArrowUpRight01Icon,
	BubbleChatQuestionIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LazyMotion, domAnimation } from "motion/react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { X } from "./components/Icons";
import { AboutSettingsPane } from "./components/settings/AboutSettingsPane";
import { AdvancedSettingsPane } from "./components/settings/AdvancedSettingsPane";
import { AiSettingsPane } from "./components/settings/AiSettingsPane";
import { AppearanceSettingsPane } from "./components/settings/AppearanceSettingsPane";
import { GeneralSettingsPane } from "./components/settings/GeneralSettingsPane";
import { SpaceSettingsPane } from "./components/settings/SpaceSettingsPane";
import {
	SETTINGS_TABS,
	type SettingsTab,
	isSettingsTab,
} from "./components/settings/settingsConfig";
import { Button } from "./components/ui/shadcn/button";
import { useTauriEvent } from "./lib/tauriEvents";
import { onWindowDragMouseDown } from "./utils/window";

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
		void getCurrentWindow()
			.close()
			.catch(() => getCurrentWindow().hide());
	}, []);

	useTauriEvent("settings:navigate", ({ tab }) => {
		if (!isSettingsTab(tab)) return;
		switchTab(tab);
	});

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") return;
			const activeElement = document.activeElement as HTMLElement | null;
			if (activeElement) {
				const tagName = activeElement.tagName;
				if (
					tagName === "INPUT" ||
					tagName === "TEXTAREA" ||
					tagName === "SELECT" ||
					activeElement.isContentEditable ||
					Boolean(
						activeElement.closest(
							'[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]',
						),
					)
				) {
					return;
				}
			}
			event.preventDefault();
			closeWindow();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [closeWindow]);

	const tabContentByTab: Record<SettingsTab, ReactNode> = {
		general: <GeneralSettingsPane />,
		appearance: <AppearanceSettingsPane />,
		ai: <AiSettingsPane />,
		space: <SpaceSettingsPane />,
		advanced: <AdvancedSettingsPane />,
		about: <AboutSettingsPane />,
	};
	const tabContent = tabContentByTab[activeTab];

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
				<Button
					type="button"
					className="settingsWindowClose"
					variant="ghost"
					size="icon-sm"
					aria-label="Close settings"
					title="Close settings (Esc)"
					onClick={closeWindow}
				>
					<X size={14} />
				</Button>

				<main className="settingsMain">
					<div className="settingsFrame">
						<nav className="settingsTabs" aria-label="Settings sections">
							<header className="settingsNavHeader">
								<h1 className="settingsNavTitle">Glyph</h1>
								<p className="settingsNavMeta">Preferences</p>
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
									<span className="settingsTabLabel">{tab.label}</span>
								</button>
							))}
							<div className="settingsFeedbackCard">
								<div className="settingsFeedbackEyebrow">
									Still in Early Access
								</div>
								<div className="settingsFeedbackTitle">Help shape Glyph</div>
								<p className="settingsFeedbackBody">
									Glyph is actively evolving and changing, so you may run into
									rough edges here and there. If something feels off, I’d really
									love to hear about it.
								</p>
								<Button
									type="button"
									className="settingsFeedbackButton"
									onClick={() =>
										void openUrl("https://github.com/Sidhuk/Glyph/issues")
									}
								>
									<HugeiconsIcon icon={BubbleChatQuestionIcon} size={15} />
									Send Feedback
									<HugeiconsIcon icon={ArrowUpRight01Icon} size={14} />
								</Button>
							</div>
						</nav>
						<div className="settingsTabPanel">
							<header className="settingsPanelHeader">
								<h2 className="settingsPanelTitle">{activeTabMeta.label}</h2>
							</header>
							{tabContent}
						</div>
					</div>
				</main>
			</div>
		</LazyMotion>
	);
}
