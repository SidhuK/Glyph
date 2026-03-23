import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	loadSettings,
	setDatabaseShowColumnColor,
	setDatabaseShowNoteCount,
} from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";

export function AdvancedSettingsPane() {
	const [showDatabaseColumnColor, setShowDatabaseColumnColor] = useState(true);
	const [showDatabaseNoteCount, setShowDatabaseNoteCount] = useState(false);
	const [error, setError] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	const refresh = useCallback(async () => {
		setError("");
		try {
			const settings = await loadSettings();
			setShowDatabaseColumnColor(settings.database.showColumnColor);
			setShowDatabaseNoteCount(settings.database.showNoteCount);
		} catch (cause) {
			setError(extractErrorMessage(cause));
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.database?.showColumnColor === "boolean") {
			setShowDatabaseColumnColor(payload.database.showColumnColor);
		}
		if (typeof payload.database?.showNoteCount === "boolean") {
			setShowDatabaseNoteCount(payload.database.showNoteCount);
		}
	});

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				<SettingsSection
					title="Database"
					description="Global controls for how databases are presented across Glyph."
				>
					<SettingsRow
						label="Show database column color"
						description="Keep the lane pill and tag colors while toggling the full column tint."
					>
						<SettingsToggle
							checked={showDatabaseColumnColor}
							disabled={isSaving}
							ariaLabel="Show database column color"
							onCheckedChange={(checked) => {
								const previous = showDatabaseColumnColor;
								setError("");
								setShowDatabaseColumnColor(checked);
								setIsSaving(true);
								void setDatabaseShowColumnColor(checked)
									.catch((cause) => {
										setShowDatabaseColumnColor(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSaving(false);
									});
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label="Show note count"
						description="Show the total number of notes in the database header."
					>
						<SettingsToggle
							checked={showDatabaseNoteCount}
							disabled={isSaving}
							ariaLabel="Show note count"
							onCheckedChange={(checked) => {
								const previous = showDatabaseNoteCount;
								setError("");
								setShowDatabaseNoteCount(checked);
								setIsSaving(true);
								void setDatabaseShowNoteCount(checked)
									.catch((cause) => {
										setShowDatabaseNoteCount(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSaving(false);
									});
							}}
						/>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
