import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import {
	FolderOpen,
	Settings as SettingsIcon,
	Sparkles,
} from "./components/Icons";
import { MotionIconButton, MotionInput } from "./components/MotionUI";
import { AiSettingsPane } from "./components/settings/AiSettingsPane";
import { GeneralSettingsPane } from "./components/settings/GeneralSettingsPane";
import { VaultSettingsPane } from "./components/settings/VaultSettingsPane";
import { useTauriEvent } from "./lib/tauriEvents";
import type { SettingsTab } from "./lib/windows";
import { cn } from "./utils/cn";

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

	const handleSettingsNavigate = useCallback(
		(payload: { tab: SettingsTab }) => {
			if (!payload.tab) return;
			setSettingsHash(payload.tab);
		},
		[],
	);
	useTauriEvent("settings:navigate", handleSettingsNavigate);

	const title = useMemo(() => {
		if (tab === "ai") return "AI";
		if (tab === "vault") return "Vault";
		return "General";
	}, [tab]);

	const tabs: Array<{
		id: SettingsTab;
		label: string;
		description: string;
		icon: typeof SettingsIcon;
	}> = [
		{
			id: "general",
			label: "General",
			description: "Appearance, typography, accessibility",
			icon: SettingsIcon,
		},
		{
			id: "vault",
			label: "Vault",
			description: "Storage, indexing, backups",
			icon: FolderOpen,
		},
		{
			id: "ai",
			label: "AI",
			description: "Providers, defaults, safety",
			icon: Sparkles,
		},
	];

	return (
		<div className="settingsShell">
			<div className="settingsBackdrop" aria-hidden="true" />
			<div className="settingsHeader" data-tauri-drag-region>
				<div className="settingsHeaderLeft">
					<div className="settingsHeaderTitle">
						<SettingsIcon size={16} />
						<span>Settings</span>
					</div>
					<div className="settingsHeaderSubtitle">{title}</div>
				</div>
				<div className="settingsHeaderRight">
					<div className="settingsSearch" data-window-drag-ignore>
						<MotionInput
							className="settingsSearchInput"
							placeholder="Search settings"
						/>
					</div>
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
					{tabs.map((item) => {
						const Icon = item.icon;
						const isActive = tab === item.id;
						return (
							<motion.button
								key={item.id}
								type="button"
								className={cn("settingsNavButton", isActive && "active")}
								onClick={() => setSettingsHash(item.id)}
								whileHover={{ x: 4 }}
								whileTap={{ scale: 0.98 }}
								transition={{ type: "spring", stiffness: 320, damping: 24 }}
							>
								<span className="settingsNavIcon">
									<Icon size={16} />
								</span>
								<span className="settingsNavText">
									<span>{item.label}</span>
									<span className="settingsNavHint">{item.description}</span>
								</span>
								{isActive ? (
									<motion.span
										className="settingsNavActive"
										layoutId="settingsNavActive"
										transition={{ type: "spring", stiffness: 360, damping: 28 }}
									/>
								) : null}
							</motion.button>
						);
					})}
				</nav>

				<main className="settingsMain" data-window-drag-ignore>
					<AnimatePresence mode="wait">
						{tab === "general" ? (
							<motion.div
								key="general"
								className="settingsPaneMotion"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -8 }}
								transition={{ duration: 0.2 }}
							>
								<GeneralSettingsPane />
							</motion.div>
						) : null}
						{tab === "vault" ? (
							<motion.div
								key="vault"
								className="settingsPaneMotion"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -8 }}
								transition={{ duration: 0.2 }}
							>
								<VaultSettingsPane />
							</motion.div>
						) : null}
						{tab === "ai" ? (
							<motion.div
								key="ai"
								className="settingsPaneMotion"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -8 }}
								transition={{ duration: 0.2 }}
							>
								<AiSettingsPane />
							</motion.div>
						) : null}
					</AnimatePresence>
				</main>
			</div>
		</div>
	);
}
