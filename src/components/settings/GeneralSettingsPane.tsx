import { useCallback, useEffect, useState } from "react";
import {
	getDailyNotesFolder,
	loadSettings,
	setShowToc as saveShowToc,
	setDailyNotesFolder,
} from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { Trash2 } from "../Icons";
import { FolderOpen } from "../Icons/NavigationIcons";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";
import { Button } from "../ui/shadcn/button";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";

export function GeneralSettingsPane() {
	const [showToc, setShowTocState] = useState(true);
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
				const [folder, settings] = await Promise.all([
					getDailyNotesFolder(),
					loadSettings(),
				]);
				if (cancelled) return;
				setDailyNotesFolderState(folder);
				setShowTocState(settings.ui.showToc);
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

	const handleShowTocChange = useCallback((checked: boolean) => {
		setShowTocState(checked);
		void saveShowToc(checked);
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
							<div className="dailyNotesFolderRow">
								<div className="dailyNotesFolderPath">
									{dailyNotesLoading
										? "Loading..."
										: (dailyNotesFolder ?? "Not configured")}
								</div>
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
											size="icon-sm"
											className="rounded-md border-border bg-background justify-center shadow-none"
											onClick={handleClearFolder}
											disabled={dailyNotesLoading}
											aria-label="Clear daily notes folder"
											title="Clear daily notes folder"
										>
											<Trash2 size={14} />
										</Button>
									) : null}
								</div>
							</div>
							{dailyNotesError ? (
								<div className="settingsError dailyNotesError">
									{dailyNotesError}
								</div>
							) : null}
						</div>
					</SettingsRow>
				</SettingsSection>

				<SettingsSection title="Editor">
					<SettingsRow
						label="Table of contents"
						description="Show a floating table of contents for each note."
					>
						<SettingsToggle
							ariaLabel="Table of contents"
							checked={showToc}
							onCheckedChange={handleShowTocChange}
						/>
					</SettingsRow>
				</SettingsSection>

				<LicenseSettingsCard />
			</div>
		</div>
	);
}
