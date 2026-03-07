import { useCallback, useEffect, useState } from "react";
import {
	type AiAssistantMode,
	loadSettings,
	setAiAssistantMode,
} from "../../lib/settings";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";
import {
	SettingsRow,
	SettingsSection,
	SettingsSegmented,
} from "./SettingsScaffold";

export function GeneralSettingsPane() {
	const [aiAssistantMode, setAiAssistantModeState] =
		useState<AiAssistantMode>("create");
	const [error, setError] = useState("");

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				setAiAssistantModeState(settings.ui.aiAssistantMode);
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
				<LicenseSettingsCard />
			</div>
		</div>
	);
}
