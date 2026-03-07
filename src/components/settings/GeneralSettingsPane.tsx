import { useCallback, useEffect, useState } from "react";
import {
	type AiAssistantMode,
	loadSettings,
	setAiAssistantMode,
	setShowWindowsMenuBar,
} from "../../lib/settings";
import { isWindows } from "../../lib/shortcuts/platform";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";

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
		setError("");
		setShowWindowsMenuBarState(next);
		try {
			await setShowWindowsMenuBar(next);
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
				{windows ? (
					<section className="settingsCard">
						<div className="settingsCardHeader">
							<div>
								<div className="settingsCardTitle">Windows Menu Bar</div>
							</div>
						</div>

						<div className="settingsField settingsFieldCheckbox">
							<div>
								<div className="settingsLabel">Show mac-style menu bar</div>
								<div className="settingsHint">
									Adds a clean File, Space, AI, View, and Help menu under the Windows title bar.
								</div>
							</div>
							<input
								type="checkbox"
								checked={showWindowsMenuBar}
								onChange={(event) =>
									void updateWindowsMenuBar(event.target.checked)
								}
							/>
						</div>
					</section>
				) : null}
				<LicenseSettingsCard />
			</div>
		</div>
	);
}
