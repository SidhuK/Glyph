import { useCallback, useEffect, useState } from "react";
import { getDailyNotesFolder, setDailyNotesFolder } from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { FolderOpen } from "../Icons/NavigationIcons";
import { Button } from "../ui/shadcn/button";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";

export function DailyNotesSettingsPane() {
	const [currentFolder, setCurrentFolder] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void getDailyNotesFolder().then((folder) => {
			if (cancelled) return;
			setCurrentFolder(folder);
			setIsLoading(false);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const handleBrowseFolder = useCallback(async () => {
		setError(null);
		try {
			const { open } = await import("@tauri-apps/plugin-dialog");
			const selected = await open({
				directory: true,
				multiple: false,
			});
			if (selected && typeof selected === "string") {
				const currentSpacePath = await invoke("space_get_current");
				if (!currentSpacePath) {
					setError("No space is currently open.");
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
					setError("Selected folder must be inside the current space.");
					return;
				}
				const relativePath = normSelected
					.slice(normSpace.length)
					.replace(/^\/+/, "");
				await setDailyNotesFolder(relativePath || null);
				setCurrentFolder(relativePath || null);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to select folder");
		}
	}, []);

	const handleClearFolder = useCallback(async () => {
		setError(null);
		await setDailyNotesFolder(null);
		setCurrentFolder(null);
	}, []);

	const folderDisplay = currentFolder || "Not configured";

	return (
		<div className="settingsPane">
			<div className="settingsGrid">
				<SettingsSection
					title="Daily Notes"
					description="Choose where new daily notes should be created within the current space."
				>
					<SettingsRow
						label="Folder"
						description="Glyph stores daily notes relative to the active space."
						stacked
					>
						<div className="dailyNotesFolderField">
							<div className="dailyNotesFolderPath">
								{isLoading ? "Loading..." : folderDisplay}
							</div>
							{error ? (
								<div className="settingsError dailyNotesError">{error}</div>
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
								variant="default"
								size="sm"
								onClick={handleBrowseFolder}
								disabled={isLoading}
							>
								<FolderOpen size={14} />
								Browse
							</Button>
							{currentFolder && (
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={handleClearFolder}
									disabled={isLoading}
								>
									Clear
								</Button>
							)}
						</div>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
