import { useCallback, useEffect, useState } from "react";
import {
	type AiAssistantMode,
	loadSettings,
	setAiAssistantMode,
	setShowWindowsMenuBar,
} from "../../lib/settings";
import { isWindows } from "../../lib/shortcuts/platform";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";
import {
	SettingsRow,
	SettingsSection,
	SettingsSegmented,
	SettingsToggle,
} from "./SettingsScaffold";

export function GeneralSettingsPane() {
	const [aiAssistantMode, setAiAssistantModeState] =
		useState<AiAssistantMode>("create");
	const [showWindowsMenuBar, setShowWindowsMenuBarState] = useState(false);
	const [error, setError] = useState("");
	const windows = isWindows();

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				setAiAssistantModeState(settings.ui.aiAssistantMode);
				setShowWindowsMenuBarState(Boolean(settings.ui.showWindowsMenuBar));
			} catch (e) {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : "Failed to load settings");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const updateAssistantMode = useCallback(async (mode: AiAssistantMode) => {
		setError("");
		setAiAssistantModeState(mode);
		try {
			await setAiAssistantMode(mode);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save settings");
		}
	}, []);

	const updateWindowsMenuBar = useCallback(async (next: boolean) => {
		const previous = showWindowsMenuBar;
		setError("");
		setShowWindowsMenuBarState(next);
		try {
			await setShowWindowsMenuBar(next);
		} catch (e) {
			setShowWindowsMenuBarState(previous);
			setError(e instanceof Error ? e.message : "Failed to save settings");
		}
	}, [showWindowsMenuBar]);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<SettingsSection
					title="Assistant"
					description="Choose how Glyph opens your assistant workspace by default."
				>
					<SettingsRow
						label="Default view"
						description="Switch between Create and Chat without changing any assistant behavior."
					>
						<SettingsSegmented<AiAssistantMode>
							ariaLabel="Assistant default view"
							value={aiAssistantMode}
							onChange={(value) => void updateAssistantMode(value)}
							options={[
								{ label: "Create", value: "create" },
								{ label: "Chat", value: "chat" },
							]}
						/>
					</SettingsRow>
				</SettingsSection>
				{windows ? (
					<SettingsSection
						title="Windows"
						description="Customize Windows-only behavior."
					>
						<SettingsRow
							label="Menu bar"
							description="Show a File, Space, AI, View, and Help menu under the title bar."
						>
							<SettingsToggle
								ariaLabel="Show Windows menu bar"
								checked={showWindowsMenuBar}
								onCheckedChange={(checked) => void updateWindowsMenuBar(checked)}
							/>
						</SettingsRow>
					</SettingsSection>
				) : null}
				<LicenseSettingsCard />
			</div>
		</div>
	);
}
