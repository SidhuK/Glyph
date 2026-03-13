import "./SettingsApp.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LazyMotion, domAnimation } from "motion/react";
import {
	type ReactNode,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useState,
} from "react";
import { X } from "./components/Icons";
import { Search } from "./components/Icons/NavigationIcons";
import { AboutSettingsPane } from "./components/settings/AboutSettingsPane";
import { AiSettingsPane } from "./components/settings/AiSettingsPane";
import { AppearanceSettingsPane } from "./components/settings/AppearanceSettingsPane";
import { GeneralSettingsPane } from "./components/settings/GeneralSettingsPane";
import {
	SETTINGS_TABS,
	type SettingsTab,
	isSettingsTab,
} from "./components/settings/settingsConfig";
import { SpaceSettingsPane } from "./components/settings/SpaceSettingsPane";
import { searchSettingsIndex } from "./components/settings/settingsSearch";
import { Button } from "./components/ui/shadcn/button";
import { Input } from "./components/ui/shadcn/input";
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
	const [searchQuery, setSearchQuery] = useState("");
	const deferredSearchQuery = useDeferredValue(searchQuery);
	const trimmedSearchQuery = deferredSearchQuery.trim();
	const activeTabMeta = useMemo(
		() => SETTINGS_TABS.find((tab) => tab.id === activeTab) ?? SETTINGS_TABS[0],
		[activeTab],
	);
	const searchResults = useMemo(
		() => searchSettingsIndex(deferredSearchQuery),
		[deferredSearchQuery],
	);
	const searchCounts = useMemo(() => {
		const counts = new Map<SettingsTab, number>();
		for (const result of searchResults) {
			counts.set(result.tab, (counts.get(result.tab) ?? 0) + 1);
		}
		return counts;
	}, [searchResults]);
	const activeTabMatches = useMemo(
		() => searchResults.filter((result) => result.tab === activeTab),
		[activeTab, searchResults],
	);
	const matchedSections = useMemo(() => {
		if (!trimmedSearchQuery) return null;
		return new Set(activeTabMatches.map((result) => result.section));
	}, [activeTabMatches, trimmedSearchQuery]);
	const noSearchMatches =
		Boolean(trimmedSearchQuery) && searchResults.length === 0;
	const noMatchesInActiveTab =
		Boolean(trimmedSearchQuery) &&
		!noSearchMatches &&
		activeTabMatches.length === 0;

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

	let tabContent: ReactNode;
	if (noSearchMatches) {
		tabContent = (
			<div className="settingsPane">
				<div className="settingsSearchEmpty">
					<div className="settingsSearchEmptyTitle">
						No settings matched “{trimmedSearchQuery}”.
					</div>
					<p className="settingsSearchEmptyCopy">
						Try a different keyword like theme, model, license, tasks, or
						updates.
					</p>
				</div>
			</div>
		);
	} else if (noMatchesInActiveTab) {
		tabContent = (
			<div className="settingsPane">
				<div className="settingsSearchEmpty">
					<div className="settingsSearchEmptyTitle">
						No matches in {activeTabMeta.label}.
					</div>
					<p className="settingsSearchEmptyCopy">
						Try a different keyword or switch sections to see matching settings.
					</p>
				</div>
			</div>
		);
	} else {
		const tabContentByTab: Record<SettingsTab, ReactNode> = {
			general: <GeneralSettingsPane visibleSections={matchedSections} />,
			appearance: <AppearanceSettingsPane visibleSections={matchedSections} />,
			ai: <AiSettingsPane visibleSections={matchedSections} />,
			space: <SpaceSettingsPane visibleSections={matchedSections} />,
			about: <AboutSettingsPane visibleSections={matchedSections} />,
		};
		tabContent = tabContentByTab[activeTab];
	}

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
								<div className="settingsNavSearch">
									<Search
										size={14}
										className="settingsNavSearchIcon"
										aria-hidden="true"
									/>
									<Input
										type="search"
										value={searchQuery}
										onChange={(event) => setSearchQuery(event.target.value)}
										placeholder="Search settings"
										aria-label="Search settings"
										className="settingsNavSearchInput"
									/>
								</div>
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
									{trimmedSearchQuery ? (
										<span className="settingsTabCount">
											{searchCounts.get(tab.id) ?? 0}
										</span>
									) : null}
								</button>
							))}
							{noSearchMatches ? (
								<div className="settingsNavNoResults">No matching settings</div>
							) : null}
						</nav>
						<div className="settingsTabPanel">
							<header className="settingsPanelHeader">
								<h2 className="settingsPanelTitle">
									{noSearchMatches
										? "No matching settings"
										: activeTabMeta.label}
								</h2>
								<p className="settingsPanelSubtitle">
									{noSearchMatches
										? "Try a broader search or switch to a different keyword to surface matching settings."
										: noMatchesInActiveTab
											? `${activeTabMeta.subtitle}. No results in this section yet.`
											: trimmedSearchQuery
												? `${activeTabMeta.subtitle}. ${activeTabMatches.length} match${activeTabMatches.length === 1 ? "" : "es"} across ${matchedSections?.size ?? 0} section${(matchedSections?.size ?? 0) === 1 ? "" : "s"}.`
												: activeTabMeta.subtitle}
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
