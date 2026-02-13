import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { getDailyNotesFolder, setDailyNotesFolder } from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { FolderOpen } from "../Icons";
import { Button } from "../ui/shadcn/button";

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
			const selected = await open({
				directory: true,
				multiple: false,
			});
			if (selected && typeof selected === "string") {
				const currentVaultPath = await invoke("vault_get_current");
				if (!currentVaultPath) {
					setError("No vault is currently open.");
					return;
				}
				const vaultPrefix = currentVaultPath.endsWith("/")
					? currentVaultPath
					: `${currentVaultPath}/`;
				if (
					selected !== currentVaultPath &&
					!selected.startsWith(vaultPrefix)
				) {
					setError("Selected folder must be inside the current vault.");
					return;
				}
				const relativePath = selected
					.slice(currentVaultPath.length)
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
			<div className="settingsHero">
				<div>
					<h2>Daily Notes</h2>
					<p className="settingsHint">
						Configure where daily notes are stored in your vault.
					</p>
				</div>
				<div className="settingsBadge">Notes</div>
			</div>

			<div className="settingsGrid">
				<section className="settingsCard">
					<div className="settingsCardHeader">
						<div>
							<div className="settingsCardTitle">Daily Notes Folder</div>
							<div className="settingsCardHint">
								Select a folder where daily notes will be created automatically.
							</div>
						</div>
					</div>

					<div className="dailyNotesFolderField">
						<div className="settingsField">
							<div>
								<div className="settingsLabel">Folder Path</div>
								<div className="settingsHelp">
									Daily notes will be created as Markdown files named
									YYYY-MM-DD.md
								</div>
							</div>
							<div className="settingsActions">
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleBrowseFolder}
									disabled={isLoading}
								>
									<FolderOpen size={14} />
									Browse...
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
						</div>
						<div className="dailyNotesFolderPath mono">
							{isLoading ? "Loading..." : folderDisplay}
						</div>
						{error && (
							<div className="settingsError dailyNotesError">{error}</div>
						)}
					</div>
				</section>
			</div>
		</div>
	);
}
