import { useCallback, useEffect, useState } from "react";
import {
	type AiAssistantMode,
	loadSettings,
	setAiAssistantMode,
} from "../../lib/settings";

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
			<div className="settingsHero">
				<div>
					<h2>General</h2>
					<p className="settingsHint">
						Core app behavior that is not tied to a specific vault.
					</p>
				</div>
				<div className="settingsBadge">App</div>
			</div>
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">AI Assistant Entry</div>
							<div className="settingsCardHint">
								Pick what opens by default in the AI panel.
							</div>
						</div>
					</div>

					<div className="settingsField">
						<div>
							<div className="settingsLabel">Default Mode</div>
							<div className="settingsHelp">
								Choose between quick creation or direct chat.
							</div>
						</div>
						<div
							className="settingsSegmented"
							role="tablist"
							aria-label="AI mode"
						>
							<button
								type="button"
								className={aiAssistantMode === "create" ? "active" : ""}
								onClick={() => void updateAssistantMode("create")}
								aria-pressed={aiAssistantMode === "create"}
							>
								Create
							</button>
							<button
								type="button"
								className={aiAssistantMode === "chat" ? "active" : ""}
								onClick={() => void updateAssistantMode("chat")}
								aria-pressed={aiAssistantMode === "chat"}
							>
								Chat
							</button>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
