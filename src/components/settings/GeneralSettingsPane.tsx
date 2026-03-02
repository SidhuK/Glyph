import { useCallback, useEffect, useState } from "react";
import { trackSettingsChanged } from "../../lib/analytics";
import {
	type AiAssistantMode,
	loadSettings,
	setAiAssistantMode,
	setAnalyticsEnabled,
} from "../../lib/settings";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";

export function GeneralSettingsPane() {
	const [aiAssistantMode, setAiAssistantModeState] =
		useState<AiAssistantMode>("create");
	const [analyticsEnabled, setAnalyticsEnabledState] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				setAiAssistantModeState(settings.ui.aiAssistantMode);
				setAnalyticsEnabledState(settings.analytics.enabled);
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
			void trackSettingsChanged({
				settingKey: "aiAssistantMode",
				newValue: mode,
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save settings");
		}
	}, []);

	const updateAnalyticsEnabled = useCallback(async (enabled: boolean) => {
		setError("");
		setAnalyticsEnabledState(enabled);
		try {
			await setAnalyticsEnabled(enabled);
			void trackSettingsChanged({
				settingKey: "analyticsEnabled",
				newValue: enabled ? "enabled" : "disabled",
			});
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
							<div className="settingsCardHint">
								Choose which assistant view opens first.
							</div>
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
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Anonymous Analytics</div>
							<div className="settingsCardHint">
								Help improve Glyph with anonymous usage signals.
							</div>
						</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Share Anonymous Metrics</div>
						</div>
						<select
							aria-label="Anonymous analytics"
							value={analyticsEnabled ? "enabled" : "disabled"}
							onChange={(event) =>
								void updateAnalyticsEnabled(event.target.value === "enabled")
							}
						>
							<option value="disabled">Disabled</option>
							<option value="enabled">Enabled</option>
						</select>
					</div>
					<p className="settingsHint">
						Only app interaction metrics are sent. Your note content is never
						collected.
					</p>
				</section>
				<LicenseSettingsCard />
			</div>
		</div>
	);
}
