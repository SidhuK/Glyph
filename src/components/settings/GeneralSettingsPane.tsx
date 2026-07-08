import { useCallback, useEffect, useState } from "react";
import { loadSettings, setResumeLastSession } from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { useOptimisticSettingsToggle } from "./useOptimisticSettingsToggle";

export function GeneralSettingsPane() {
	const [resumeLastSession, setResumeLastSessionState] = useState(false);
	const [error, setError] = useState("");
	const resumeLastSessionToggle = useOptimisticSettingsToggle(
		resumeLastSession,
		setResumeLastSessionState,
		setResumeLastSession,
		setError,
	);

	useEffect(() => {
		let cancelled = false;
		setError("");
		void loadSettings()
			.then((settings) => {
				if (!cancelled) {
					setResumeLastSessionState(settings.ui.resumeLastSession);
				}
			})
			.catch((cause) => {
				if (!cancelled) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent(
		"settings:updated",
		useCallback((payload: { ui?: { resumeLastSession?: boolean } }) => {
			if (typeof payload.ui?.resumeLastSession === "boolean") {
				setResumeLastSessionState(payload.ui.resumeLastSession);
			}
		}, []),
	);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
				<SettingsSection
					title="Startup"
					description="Choose what opens when you start Glyph."
				>
					<SettingsRow
						label="Open previous tabs"
						description="Start this space with the tabs you left open."
					>
						<SettingsToggle
							checked={resumeLastSession}
							disabled={resumeLastSessionToggle.isSaving}
							ariaLabel="Resume last session"
							onCheckedChange={resumeLastSessionToggle.onCheckedChange}
						/>
					</SettingsRow>
				</SettingsSection>
				<LicenseSettingsCard />
			</div>
		</div>
	);
}
