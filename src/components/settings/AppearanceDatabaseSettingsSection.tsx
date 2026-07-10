import { useEffect, useState } from "react";
import {
	loadSettings,
	setDatabaseShowColumnColor,
} from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { useOptimisticSettingsToggle } from "./useOptimisticSettingsToggle";

export function AppearanceDatabaseSettingsSection() {
	const [showColumnColor, setShowColumnColor] = useState(true);
	const [error, setError] = useState("");
	const toggle = useOptimisticSettingsToggle(
		showColumnColor,
		setShowColumnColor,
		setDatabaseShowColumnColor,
		setError,
	);

	useEffect(() => {
		void loadSettings()
			.then((settings) => setShowColumnColor(settings.database.showColumnColor))
			.catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.database?.showColumnColor === "boolean") {
			setShowColumnColor(payload.database.showColumnColor);
		}
	});

	return (
		<SettingsSection
			title="Database"
			description="Choose how databases are presented across Glyph."
		>
			{error ? <div className="settingsError">{error}</div> : null}
			<SettingsRow
				label="Show database column color"
				description="Keep the lane pill and tag colors while toggling the full column tint."
			>
				<SettingsToggle
					checked={showColumnColor}
					disabled={toggle.isSaving}
					ariaLabel="Show database column color"
					onCheckedChange={toggle.onCheckedChange}
				/>
			</SettingsRow>
		</SettingsSection>
	);
}
