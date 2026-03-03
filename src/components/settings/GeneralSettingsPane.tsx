import { useCallback, useEffect, useState } from "react";
import {
	type AiAssistantMode,
	loadSettings,
	setAiAssistantMode,
} from "../../lib/settings";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";

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
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Assistant Default View</div>
						</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Open Assistant In</div>
						</div>
						<select
							aria-label="Open Assistant In"
							value={aiAssistantMode}
							onChange={(event) =>
								void updateAssistantMode(event.target.value as AiAssistantMode)
							}
						>
							<option value="create">Create View</option>
							<option value="chat">Chat View</option>
						</select>
					</div>
				</section>
				<LicenseSettingsCard />
			</div>
		</div>
	);
}
