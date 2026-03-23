import { useCallback, useEffect, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	loadSettings,
	setDatabaseShowColumnColor,
	setDatabaseShowNoteCount,
	setEditorShowCollapsibleHeadings,
	setShowToc,
} from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";

export function AdvancedSettingsPane() {
	const [showCollapsibleHeadings, setShowCollapsibleHeadings] = useState(false);
	const [showToc, setShowTocState] = useState(true);
	const [showDatabaseColumnColor, setShowDatabaseColumnColor] = useState(true);
	const [showDatabaseNoteCount, setShowDatabaseNoteCount] = useState(false);
	const [error, setError] = useState("");
	const [isSavingShowToc, setIsSavingShowToc] = useState(false);
	const [isSavingShowCollapsibleHeadings, setIsSavingShowCollapsibleHeadings] =
		useState(false);
	const [isSavingDatabaseColumnColor, setIsSavingDatabaseColumnColor] =
		useState(false);
	const [isSavingDatabaseNoteCount, setIsSavingDatabaseNoteCount] =
		useState(false);

	const refresh = useCallback(async () => {
		setError("");
		try {
			const settings = await loadSettings();
			setShowCollapsibleHeadings(settings.editor.showCollapsibleHeadings);
			setShowTocState(settings.ui.showToc);
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
		if (typeof payload.editor?.showCollapsibleHeadings === "boolean") {
			setShowCollapsibleHeadings(payload.editor.showCollapsibleHeadings);
		}
		if (typeof payload.ui?.showToc === "boolean") {
			setShowTocState(payload.ui.showToc);
		}
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
					title="Editor"
					description="Controls for editing behavior and note structure inside Glyph."
				>
					<SettingsRow
						label="Table of contents"
						description="Show a floating table of contents for each note."
					>
						<SettingsToggle
							checked={showToc}
							disabled={isSavingShowToc}
							ariaLabel="Table of contents"
							onCheckedChange={(checked) => {
								const previous = showToc;
								setError("");
								setShowTocState(checked);
								setIsSavingShowToc(true);
								void setShowToc(checked)
									.catch((cause) => {
										setShowTocState(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingShowToc(false);
									});
							}}
						/>
					</SettingsRow>
					<SettingsRow
						label="Collapsible headings"
						description="Show collapse toggles on note headings in editor and preview."
					>
						<SettingsToggle
							checked={showCollapsibleHeadings}
							disabled={isSavingShowCollapsibleHeadings}
							ariaLabel="Collapsible headings"
							onCheckedChange={(checked) => {
								const previous = showCollapsibleHeadings;
								setError("");
								setShowCollapsibleHeadings(checked);
								setIsSavingShowCollapsibleHeadings(true);
								void setEditorShowCollapsibleHeadings(checked)
									.catch((cause) => {
										setShowCollapsibleHeadings(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingShowCollapsibleHeadings(false);
									});
							}}
						/>
					</SettingsRow>
				</SettingsSection>
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
							disabled={isSavingDatabaseColumnColor}
							ariaLabel="Show database column color"
							onCheckedChange={(checked) => {
								const previous = showDatabaseColumnColor;
								setError("");
								setShowDatabaseColumnColor(checked);
								setIsSavingDatabaseColumnColor(true);
								void setDatabaseShowColumnColor(checked)
									.catch((cause) => {
										setShowDatabaseColumnColor(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingDatabaseColumnColor(false);
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
							disabled={isSavingDatabaseNoteCount}
							ariaLabel="Show note count"
							onCheckedChange={(checked) => {
								const previous = showDatabaseNoteCount;
								setError("");
								setShowDatabaseNoteCount(checked);
								setIsSavingDatabaseNoteCount(true);
								void setDatabaseShowNoteCount(checked)
									.catch((cause) => {
										setShowDatabaseNoteCount(previous);
										setError(extractErrorMessage(cause));
									})
									.finally(() => {
										setIsSavingDatabaseNoteCount(false);
									});
							}}
						/>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
