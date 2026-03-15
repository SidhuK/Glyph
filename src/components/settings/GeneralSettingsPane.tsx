import { useCallback, useEffect, useState } from "react";
import {
	type AiAssistantMode,
	getDailyNotesFolder,
	loadSettings,
	setAiAssistantMode,
	setDailyNotesFolder,
} from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { FolderOpen } from "../Icons/NavigationIcons";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";
import { Button } from "../ui/shadcn/button";
import {
	SettingsRow,
	SettingsSection,
	SettingsSegmented,
} from "./SettingsScaffold";

export function GeneralSettingsPane() {
	const [aiAssistantMode, setAiAssistantModeState] =
		useState<AiAssistantMode>("create");
	const [dailyNotesFolder, setDailyNotesFolderState] = useState<string | null>(
		null,
	);
	const [dailyNotesLoading, setDailyNotesLoading] = useState(true);
	const [dailyNotesError, setDailyNotesError] = useState<string | null>(null);
	const [error, setError] = useState("");

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [settings, folder] = await Promise.all([
					loadSettings(),
					getDailyNotesFolder(),
				]);
				if (cancelled) return;
				setAiAssistantModeState(settings.ui.aiAssistantMode);
				setDailyNotesFolderState(folder);
			} catch (cause) {
				if (!cancelled) {
					setError(
						cause instanceof Error ? cause.message : "Failed to load settings",
					);
				}
			} finally {
				if (!cancelled) {
					setDailyNotesLoading(false);
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
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Failed to save settings",
			);
		}
	}, []);

	const handleBrowseFolder = useCallback(async () => {
		setDailyNotesError(null);
		try {
			const { open } = await import("@tauri-apps/plugin-dialog");
			const selected = await open({
				directory: true,
				multiple: false,
			});
			if (selected && typeof selected === "string") {
				const currentSpacePath = await invoke("space_get_current");
				if (!currentSpacePath) {
					setDailyNotesError("No space is currently open.");
					return;
				}
				const normSelected = selected.replace(/\\/g, "/");
				const normSpace = currentSpacePath.replace(/\\/g, "/");
				const spacePrefix = normSpace.endsWith("/")
					? normSpace
					: `${normSpace}/`;
				if (
					normSelected !== normSpace &&
					!normSelected.startsWith(spacePrefix)
				) {
					setDailyNotesError(
						"Selected folder must be inside the current space.",
					);
					return;
				}
				const relativePath = normSelected
					.slice(normSpace.length)
					.replace(/^\/+/, "");
				await setDailyNotesFolder(relativePath || null);
				setDailyNotesFolderState(relativePath || null);
			}
		} catch (cause) {
			setDailyNotesError(
				cause instanceof Error ? cause.message : "Failed to select folder",
			);
		}
	}, []);

	const handleClearFolder = useCallback(async () => {
		setDailyNotesError(null);
		await setDailyNotesFolder(null);
		setDailyNotesFolderState(null);
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

				<SettingsSection
					title="Daily Notes"
					description="Choose where new daily notes should be created within the current space."
				>
					<SettingsRow
						label="Folder"
						description="Glyph stores daily notes relative to the active space."
						stacked
						interactive={false}
					>
						<div className="dailyNotesFolderField">
							<div className="dailyNotesFolderPath">
								{dailyNotesLoading
									? "Loading..."
									: (dailyNotesFolder ?? "Not configured")}
							</div>
							{dailyNotesError ? (
								<div className="settingsError dailyNotesError">
									{dailyNotesError}
								</div>
							) : null}
						</div>
					</SettingsRow>
					<SettingsRow
						label="Actions"
						description="Browse for a folder or clear the current daily notes location."
					>
						<div className="settingsActions dailyNotesActions">
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="min-w-24 rounded-md border-border bg-background justify-center shadow-none"
								onClick={handleBrowseFolder}
								disabled={dailyNotesLoading}
							>
								<FolderOpen size={14} />
								Browse
							</Button>
							{dailyNotesFolder ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="min-w-20 rounded-md border-border bg-background justify-center shadow-none"
									onClick={handleClearFolder}
									disabled={dailyNotesLoading}
								>
									Clear
								</Button>
							) : null}
						</div>
					</SettingsRow>
				</SettingsSection>

				<LicenseSettingsCard />
			</div>
		</div>
	);
}
